import { sanitize, type LogFields, type LogLevel } from './log'

/**
 * The most recent warn / error log entries of this server process, in
 * memory only (a bounded ring on globalThis, shared by Next's webpack
 * runtimes), for the admin System panel. Entries are redacted by
 * lib/log.ts sanitize() — the same rules as the log line itself — and their
 * fields are capped at MAX_FIELDS_CHARS characters of JSON.
 */

export const LOG_RING_SIZE = 200
const MAX_FIELDS_CHARS = 1200

export type LogEntry = {
  ts: number
  level: Extract<LogLevel, 'warn' | 'error'>
  msg: string
  fields: string | null
}

type RingGlobal = typeof globalThis & {
  __logRing?: { entries: LogEntry[]; next: number; total: number }
}

function ring() {
  const g = globalThis as RingGlobal
  if (!g.__logRing) g.__logRing = { entries: [], next: 0, total: 0 }
  return g.__logRing
}

export function pushLogEntry(
  level: LogLevel,
  msg: string,
  fields: LogFields,
  now = Date.now()
): void {
  if (level !== 'warn' && level !== 'error') return
  const r = ring()
  let json: string | null = null
  const clean = sanitize(fields) as LogFields
  if (clean && Object.keys(clean).length) {
    json = JSON.stringify(clean)
    if (json.length > MAX_FIELDS_CHARS) json = `${json.slice(0, MAX_FIELDS_CHARS - 1)}…`
  }
  const entry: LogEntry = { ts: now, level, msg: String(msg).slice(0, 300), fields: json }
  if (r.entries.length < LOG_RING_SIZE) r.entries.push(entry)
  else r.entries[r.next] = entry
  r.next = (r.next + 1) % LOG_RING_SIZE
  r.total++
}

/** Newest first, at most `limit` (optionally only one level). */
export function recentLogEntries(limit = 50, level?: 'warn' | 'error'): LogEntry[] {
  const r = ring()
  const ordered =
    r.entries.length < LOG_RING_SIZE
      ? [...r.entries]
      : [...r.entries.slice(r.next), ...r.entries.slice(0, r.next)]
  return ordered
    .reverse()
    .filter((e) => !level || e.level === level)
    .slice(0, Math.max(0, limit))
}

/** Entries recorded since the process started (including those the ring has dropped). */
export function logEntryTotal(): number {
  return ring().total
}

/** Test helper: forget everything. */
export function clearLogEntries(): void {
  const g = globalThis as RingGlobal
  g.__logRing = { entries: [], next: 0, total: 0 }
}
