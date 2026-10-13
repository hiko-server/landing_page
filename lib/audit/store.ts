import { getAuditDb } from './db'
import type { AuditDescription } from './describe'
import type { SnapshotKind } from './context'

/**
 * Reads and writes of the activity log (data/audit.db, lib/audit/db.ts).
 *
 * Retention: entries older than AUDIT_KEEP_DAYS are deleted, and at most
 * AUDIT_KEEP_ROWS are kept (oldest first out); pruning runs at most once an
 * hour, from a write. Nothing here may throw into an admin action — the
 * capture wraps every call.
 */

export const AUDIT_KEEP_DAYS = 400
export const AUDIT_KEEP_ROWS = 20_000
export const AUDIT_PAGE_MAX = 200
const PRUNE_EVERY_MS = 60 * 60_000

export type AuditActor = {
  sessionId: string | null
  device: string | null
  ipPrefix: string | null
  country: string | null
}

export type AuditInput = AuditDescription &
  AuditActor & {
    method: string
    route: string
    status: number
    requestId: string | null
    snapshots?: Array<{ kind: SnapshotKind; file: string }>
  }

export type AuditEntry = AuditDescription &
  AuditActor & {
    id: number
    ts: number
    method: string
    route: string
    status: number
  }

type Row = {
  id: number
  ts: number
  action: string
  area: string
  target: string | null
  summary: string
  method: string
  route: string
  status: number
  session_id: string | null
  device: string | null
  ip_prefix: string | null
  country: string | null
}

type PruneGlobal = typeof globalThis & { __auditPrunedAt?: number }

function toEntry(r: Row): AuditEntry {
  return {
    id: r.id,
    ts: r.ts,
    action: r.action,
    area: r.area as AuditEntry['area'],
    target: r.target,
    summary: r.summary,
    method: r.method,
    route: r.route,
    status: r.status,
    sessionId: r.session_id,
    device: r.device,
    ipPrefix: r.ip_prefix,
    country: r.country,
  }
}

/** Store one entry (and its snapshot links); returns its id. */
export function recordAudit(e: AuditInput, now = Date.now()): number {
  const db = getAuditDb()
  const id = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO audit_log (ts, action, area, target, summary, method, route, status, session_id, device, ip_prefix, country, request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(now, e.action, e.area, e.target, e.summary, e.method, e.route, e.status, e.sessionId, e.device, e.ipPrefix, e.country, e.requestId)
    const rowId = Number(info.lastInsertRowid)
    const link = db.prepare('INSERT OR REPLACE INTO audit_snapshots (audit_id, kind, file) VALUES (?, ?, ?)')
    for (const s of e.snapshots || []) link.run(rowId, s.kind, s.file)
    return rowId
  })()
  const g = globalThis as PruneGlobal
  if (!g.__auditPrunedAt || now - g.__auditPrunedAt > PRUNE_EVERY_MS) {
    g.__auditPrunedAt = now
    pruneAudit(now)
  }
  return id
}

/** Delete entries past the retention period or beyond the row cap; returns how many went. */
export function pruneAudit(now = Date.now(), keepDays = AUDIT_KEEP_DAYS, keepRows = AUDIT_KEEP_ROWS): number {
  const db = getAuditDb()
  return db.transaction(() => {
    const cutoff = now - keepDays * 86_400_000
    const byAge = db.prepare('DELETE FROM audit_log WHERE ts < ?').run(cutoff).changes
    const byCount = db
      .prepare('DELETE FROM audit_log WHERE id IN (SELECT id FROM audit_log ORDER BY ts DESC, id DESC LIMIT -1 OFFSET ?)')
      .run(Math.max(0, keepRows)).changes
    db.prepare('DELETE FROM audit_snapshots WHERE audit_id NOT IN (SELECT id FROM audit_log)').run()
    return byAge + byCount
  })()
}

export type AuditQuery = {
  area?: string | null
  /** Case-insensitive text found in the summary, the target or the device. */
  q?: string | null
  /** Only entries older than this time in ms (pagination cursor). */
  before?: number | null
  /** Only entries at or after this time (ms). */
  since?: number | null
  limit?: number
}

/** Newest first. `nextBefore` is the cursor for the following page (null at the end). */
export function listAudit(query: AuditQuery = {}): { entries: AuditEntry[]; nextBefore: number | null } {
  const db = getAuditDb()
  const limit = Math.min(AUDIT_PAGE_MAX, Math.max(1, Math.trunc(query.limit ?? 50)))
  const where: string[] = []
  const params: unknown[] = []
  if (query.area) {
    where.push('area = ?')
    params.push(query.area)
  }
  if (query.before && Number.isFinite(query.before)) {
    where.push('ts < ?')
    params.push(Math.trunc(query.before))
  }
  if (query.since && Number.isFinite(query.since)) {
    where.push('ts >= ?')
    params.push(Math.trunc(query.since))
  }
  const q = (query.q || '').trim().toLowerCase().slice(0, 80)
  if (q) {
    where.push("(lower(summary) LIKE ? ESCAPE '\\' OR lower(coalesce(target, '')) LIKE ? ESCAPE '\\' OR lower(coalesce(device, '')) LIKE ? ESCAPE '\\')")
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    params.push(like, like, like)
  }
  const rows = db
    .prepare(
      `SELECT id, ts, action, area, target, summary, method, route, status, session_id, device, ip_prefix, country
       FROM audit_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ts DESC, id DESC LIMIT ?`,
    )
    .all(...params, limit + 1) as Row[]
  const more = rows.length > limit
  const entries = rows.slice(0, limit).map(toEntry)
  return { entries, nextBefore: more ? entries[entries.length - 1].ts : null }
}

export type VersionNote = { summary: string; ts: number; device: string | null }

/**
 * For each snapshot file of `kind`, the change that took it — the write
 * whose previous state the file holds. Files without an entry (taken before
 * the log existed, or by a restore drill or scheduled job) are absent.
 */
export function versionNotes(kind: SnapshotKind, files: readonly string[]): Map<string, VersionNote> {
  const out = new Map<string, VersionNote>()
  if (!files.length) return out
  const db = getAuditDb()
  const stmt = db.prepare(
    `SELECT s.file, a.summary, a.ts, a.device FROM audit_snapshots s JOIN audit_log a ON a.id = s.audit_id WHERE s.kind = ? AND s.file = ?`,
  )
  for (const file of files.slice(0, 500)) {
    const row = stmt.get(kind, file) as { file: string; summary: string; ts: number; device: string | null } | undefined
    if (row) out.set(file, { summary: row.summary, ts: row.ts, device: row.device })
  }
  return out
}

/** Entry counts per area over the last `days` days (the Activity view's filter chips). */
export function auditAreaCounts(now = Date.now(), days = 30): Record<string, number> {
  const rows = getAuditDb()
    .prepare('SELECT area, count(*) AS n FROM audit_log WHERE ts >= ? GROUP BY area')
    .all(now - days * 86_400_000) as Array<{ area: string; n: number }>
  return Object.fromEntries(rows.map((r) => [r.area, Number(r.n) || 0]))
}
