import { getAnalyticsDb } from '../analytics/db'
import { utcDay, dayMinus } from '../analytics/shared'

/**
 * First-party error monitor: storage (data/analytics.db, tables `errors` and
 * `error_daily`, migration scripts/db/analytics/003-errors.mjs).
 *
 * One row per fingerprint. A repeat bumps the count, the last-seen time, the
 * last path and release, and the browser-family tally; a repeat of a
 * resolved error reopens it (regressed_at). Callers pass text that is
 * already scrubbed (lib/errors/scrub.ts) — nothing personal reaches this
 * module.
 *
 * Bounds:
 *   - at most MAX_FINGERPRINTS rows: a new problem beyond that is counted as
 *     dropped (repeats of known ones still count);
 *   - at most DAILY_EVENTS events per UTC day across all sources;
 *   - retention: open errors 90 days after they were last seen, resolved or
 *     ignored ones 30 days, daily counts 30 days. Pruned once per UTC day.
 */

export type ErrorSource = 'client' | 'server' | 'csp'
export type ErrorStatus = 'open' | 'resolved' | 'ignored'
export const ERROR_STATUSES: readonly ErrorStatus[] = ['open', 'resolved', 'ignored']

export const ERROR_LIMITS = {
  maxFingerprints: 500,
  dailyEvents: 20_000,
  openDays: 90,
  closedDays: 30,
  dailyKeepDays: 30,
  maxBrowsers: 8,
} as const

export type ErrorEventInput = {
  fingerprint: string
  source: ErrorSource
  kind: string
  name?: string | null
  message: string
  stack?: string | null
  path?: string | null
  route?: string | null
  release?: string | null
  browser?: string | null
}

export type RecordOutcome = 'recorded' | 'new' | 'capped' | 'over-daily-limit'

export type ErrorRow = {
  fingerprint: string
  source: ErrorSource
  kind: string
  name: string | null
  message: string
  stack: string | null
  path: string | null
  route: string | null
  count: number
  firstSeen: number
  lastSeen: number
  firstRelease: string | null
  lastRelease: string | null
  browsers: Record<string, number>
  status: ErrorStatus
  resolvedAt: number | null
  regressedAt: number | null
}

export type ErrorTotals = {
  open: number
  resolved: number
  ignored: number
  eventsToday: number
  events7d: number
  /** Fingerprints first seen in the last 24 h. */
  new24h: number
  droppedToday: number
}

type StoreGlobal = typeof globalThis & {
  __errorStore?: { day: string; events: number; prunedDay: string | null }
}

function state() {
  const g = globalThis as StoreGlobal
  if (!g.__errorStore) g.__errorStore = { day: '', events: 0, prunedDay: null }
  return g.__errorStore
}

type RawRow = {
  fingerprint: string
  source: ErrorSource
  kind: string
  name: string | null
  message: string
  stack: string | null
  path: string | null
  route: string | null
  count: number
  first_seen: number
  last_seen: number
  first_release: string | null
  last_release: string | null
  browsers: string
  status: ErrorStatus
  resolved_at: number | null
  regressed_at: number | null
}

function parseBrowsers(raw: string): Record<string, number> {
  try {
    const v = JSON.parse(raw) as unknown
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    const out: Record<string, number> = {}
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
      if (typeof n === 'number' && Number.isFinite(n)) out[k] = n
    }
    return out
  } catch {
    return {}
  }
}

function toRow(r: RawRow): ErrorRow {
  return {
    fingerprint: r.fingerprint,
    source: r.source,
    kind: r.kind,
    name: r.name,
    message: r.message,
    stack: r.stack,
    path: r.path,
    route: r.route,
    count: Number(r.count) || 0,
    firstSeen: Number(r.first_seen) || 0,
    lastSeen: Number(r.last_seen) || 0,
    firstRelease: r.first_release,
    lastRelease: r.last_release,
    browsers: parseBrowsers(r.browsers),
    status: r.status,
    resolvedAt: r.resolved_at,
    regressedAt: r.regressed_at,
  }
}

/** Add one sighting of `browser` to a tally, keeping the most frequent families. */
export function tallyBrowser(tally: Record<string, number>, browser: string | null | undefined): Record<string, number> {
  if (!browser) return tally
  const next = { ...tally, [browser]: (tally[browser] || 0) + 1 }
  const entries = Object.entries(next).sort((a, b) => b[1] - a[1])
  return Object.fromEntries(entries.slice(0, ERROR_LIMITS.maxBrowsers))
}

function bumpDropped(day: string) {
  const db = getAnalyticsDb()
  db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, '1')
     ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`,
  ).run(`errors.dropped.${day}`)
}

/** Delete what the retention rules expire (at most once per UTC day unless forced). */
export function pruneErrors(now = Date.now(), force = false): void {
  const s = state()
  const day = utcDay(now)
  if (!force && s.prunedDay === day) return
  s.prunedDay = day
  const db = getAnalyticsDb()
  const DAY = 86_400_000
  db.transaction(() => {
    db.prepare(`DELETE FROM errors WHERE status = 'open' AND last_seen < ?`).run(now - ERROR_LIMITS.openDays * DAY)
    db.prepare(`DELETE FROM errors WHERE status != 'open' AND last_seen < ?`).run(now - ERROR_LIMITS.closedDays * DAY)
    const keepFrom = dayMinus(day, ERROR_LIMITS.dailyKeepDays)
    db.prepare(`DELETE FROM error_daily WHERE day < ?`).run(keepFrom)
    db.prepare(`DELETE FROM error_daily WHERE fingerprint NOT IN (SELECT fingerprint FROM errors)`).run()
    db.prepare(`DELETE FROM meta WHERE key LIKE 'errors.dropped.%' AND key < ?`).run(`errors.dropped.${keepFrom}`)
  })()
}

/**
 * Store one error event. Never throws for a bad event (the caller already
 * validated it); a database failure does throw — callers catch it.
 */
export function recordError(e: ErrorEventInput, now = Date.now()): RecordOutcome {
  const s = state()
  const day = utcDay(now)
  if (s.day !== day) {
    s.day = day
    s.events = 0
  }
  pruneErrors(now)
  if (s.events >= ERROR_LIMITS.dailyEvents) {
    bumpDropped(day)
    return 'over-daily-limit'
  }
  s.events++

  const db = getAnalyticsDb()
  return db.transaction((): RecordOutcome => {
    const existing = db.prepare('SELECT browsers, status FROM errors WHERE fingerprint = ?').get(e.fingerprint) as
      | { browsers: string; status: ErrorStatus }
      | undefined
    if (!existing) {
      const n = (db.prepare('SELECT count(*) AS n FROM errors').get() as { n: number }).n
      if (n >= ERROR_LIMITS.maxFingerprints) {
        bumpDropped(day)
        return 'capped'
      }
      db.prepare(
        `INSERT INTO errors (fingerprint, source, kind, name, message, stack, path, route, count,
                             first_seen, last_seen, first_release, last_release, browsers, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'open')`,
      ).run(
        e.fingerprint,
        e.source,
        e.kind,
        e.name || null,
        e.message,
        e.stack || null,
        e.path || null,
        e.route || null,
        now,
        now,
        e.release || null,
        e.release || null,
        JSON.stringify(tallyBrowser({}, e.browser)),
      )
    } else {
      const browsers = JSON.stringify(tallyBrowser(parseBrowsers(existing.browsers), e.browser))
      const regressed = existing.status === 'resolved'
      db.prepare(
        `UPDATE errors SET
           count = count + 1,
           last_seen = ?,
           message = ?,
           stack = COALESCE(?, stack),
           path = COALESCE(?, path),
           route = COALESCE(?, route),
           last_release = COALESCE(?, last_release),
           browsers = ?,
           status = CASE WHEN ? THEN 'open' ELSE status END,
           resolved_at = CASE WHEN ? THEN NULL ELSE resolved_at END,
           regressed_at = CASE WHEN ? THEN ? ELSE regressed_at END
         WHERE fingerprint = ?`,
      ).run(
        now,
        e.message,
        e.stack || null,
        e.path || null,
        e.route || null,
        e.release || null,
        browsers,
        regressed ? 1 : 0,
        regressed ? 1 : 0,
        regressed ? 1 : 0,
        now,
        e.fingerprint,
      )
    }
    db.prepare(
      `INSERT INTO error_daily (day, fingerprint, count) VALUES (?, ?, 1)
       ON CONFLICT(day, fingerprint) DO UPDATE SET count = count + 1`,
    ).run(day, e.fingerprint)
    return existing ? 'recorded' : 'new'
  })()
}

/** Daily counts for the last `days` UTC days (oldest first), per fingerprint. */
function dailySeries(fingerprints: string[], days: number, now: number): Map<string, number[]> {
  const out = new Map<string, number[]>()
  if (!fingerprints.length) return out
  const today = utcDay(now)
  const from = dayMinus(today, days - 1)
  const index = new Map<string, number>()
  for (let i = 0; i < days; i++) index.set(dayMinus(today, days - 1 - i), i)
  for (const fp of fingerprints) out.set(fp, new Array(days).fill(0))
  const rows = getAnalyticsDb()
    .prepare(`SELECT day, fingerprint, count FROM error_daily WHERE day >= ? AND day <= ?`)
    .all(from, today) as Array<{ day: string; fingerprint: string; count: number }>
  for (const r of rows) {
    const series = out.get(r.fingerprint)
    const i = index.get(r.day)
    if (series && i !== undefined) series[i] = Number(r.count) || 0
  }
  return out
}

export type ErrorListItem = ErrorRow & { daily: number[] }

/** Errors with `status` (or all), most recently seen first, each with a 14-day series. */
export function listErrors(opts: { status?: ErrorStatus | 'all'; limit?: number } = {}, now = Date.now()): ErrorListItem[] {
  pruneErrors(now)
  const limit = Math.min(500, Math.max(1, opts.limit ?? 200))
  const status = opts.status ?? 'open'
  const rows = (
    status === 'all'
      ? getAnalyticsDb().prepare('SELECT * FROM errors ORDER BY last_seen DESC LIMIT ?').all(limit)
      : getAnalyticsDb().prepare('SELECT * FROM errors WHERE status = ? ORDER BY last_seen DESC LIMIT ?').all(status, limit)
  ) as RawRow[]
  const series = dailySeries(
    rows.map((r) => r.fingerprint),
    14,
    now,
  )
  return rows.map((r) => ({ ...toRow(r), daily: series.get(r.fingerprint) || [] }))
}

/** One error with a 30-day series, or null. */
export function getError(fingerprint: string, now = Date.now()): ErrorListItem | null {
  const row = getAnalyticsDb().prepare('SELECT * FROM errors WHERE fingerprint = ?').get(fingerprint) as RawRow | undefined
  if (!row) return null
  return { ...toRow(row), daily: dailySeries([fingerprint], 30, now).get(fingerprint) || [] }
}

export function errorTotals(now = Date.now()): ErrorTotals {
  const db = getAnalyticsDb()
  const byStatus = db.prepare('SELECT status, count(*) AS n FROM errors GROUP BY status').all() as Array<{
    status: ErrorStatus
    n: number
  }>
  const n = (st: ErrorStatus) => byStatus.find((r) => r.status === st)?.n ?? 0
  const today = utcDay(now)
  const sum = (from: string) =>
    Number((db.prepare('SELECT coalesce(sum(count), 0) AS n FROM error_daily WHERE day >= ?').get(from) as { n: number }).n) || 0
  const dropped = db.prepare('SELECT value FROM meta WHERE key = ?').get(`errors.dropped.${today}`) as { value: string } | undefined
  return {
    open: n('open'),
    resolved: n('resolved'),
    ignored: n('ignored'),
    eventsToday: sum(today),
    events7d: sum(dayMinus(today, 6)),
    new24h: (db.prepare('SELECT count(*) AS n FROM errors WHERE first_seen >= ?').get(now - 86_400_000) as { n: number }).n,
    droppedToday: Number(dropped?.value) || 0,
  }
}

const FP_RE = /^[0-9a-f]{32}$/

export function isFingerprint(v: unknown): v is string {
  return typeof v === 'string' && FP_RE.test(v)
}

/** Set the triage status of some errors. Returns how many rows changed. */
export function setErrorStatus(fingerprints: string[], status: ErrorStatus, now = Date.now()): number {
  const valid = fingerprints.filter(isFingerprint)
  if (!valid.length) return 0
  const db = getAnalyticsDb()
  const stmt = db.prepare(
    `UPDATE errors SET status = ?, resolved_at = CASE WHEN ? = 'open' THEN NULL ELSE ? END WHERE fingerprint = ?`,
  )
  let changed = 0
  db.transaction(() => {
    for (const fp of valid) changed += stmt.run(status, status, now, fp).changes
  })()
  return changed
}

/** Delete errors (and their daily counts). Returns how many rows went. */
export function deleteErrors(fingerprints: string[]): number {
  const valid = fingerprints.filter(isFingerprint)
  if (!valid.length) return 0
  const db = getAnalyticsDb()
  let changed = 0
  db.transaction(() => {
    for (const fp of valid) {
      changed += db.prepare('DELETE FROM errors WHERE fingerprint = ?').run(fp).changes
      db.prepare('DELETE FROM error_daily WHERE fingerprint = ?').run(fp)
    }
  })()
  return changed
}

/** Delete every resolved error. */
export function deleteResolvedErrors(): number {
  const db = getAnalyticsDb()
  let changed = 0
  db.transaction(() => {
    changed = db.prepare(`DELETE FROM errors WHERE status = 'resolved'`).run().changes
    db.prepare('DELETE FROM error_daily WHERE fingerprint NOT IN (SELECT fingerprint FROM errors)').run()
  })()
  return changed
}

/** Test helper: reset the in-memory counters. */
export function resetErrorStoreState(): void {
  const g = globalThis as StoreGlobal
  g.__errorStore = { day: '', events: 0, prunedDay: null }
}
