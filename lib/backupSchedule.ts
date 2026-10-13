import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getDb } from './db'
import {
  BACKUP_CONSTANTS,
  StorageBusyError,
  createSnapshot,
  listLocalBackups,
  uploadInventory,
  type SnapshotResult,
} from './backup'
import { inboxFile } from './inbox'
import { getR2Bucket, isR2Configured } from './r2'
import { log } from './log'

/**
 * Scheduled, change-aware full-site snapshots.
 *
 * `startBackupSchedule()` (called once per server process from
 * instrumentation.ts) runs a tick 5–15 minutes after boot and then every
 * BACKUP_INTERVAL_HOURS (default 24; 0 disables) by chaining setTimeout, so
 * two ticks can never overlap. Each tick fingerprints the content — the
 * newest updated_at and row count of pages / collection_items / kv, the
 * contact inbox's size and mtime, every upload's name and size, and where
 * snapshots go (R2 bucket or local only) — and compares it with the
 * fingerprint of the last fully successful backup in
 * data/backups/.last-scheduled.json. Unchanged content (and that snapshot
 * still on disk) → the tick is skipped; otherwise it runs
 * createSnapshot({ reason: 'scheduled' }).
 *
 * A tick that finds a backup or restore already running retries in 10
 * minutes; a failed tick retries within the hour. Nothing here ever throws
 * into the caller: every failure is logged and recorded for getBackupStatus().
 *
 * Manual "Backup now" goes through createTrackedSnapshot('manual') so it
 * updates the same record (a scheduled tick right after it is skipped).
 *
 * Process-wide runtime state (next tick, interval) lives on globalThis:
 * instrumentation and the API routes are separate webpack runtimes.
 */

export const DEFAULT_INTERVAL_HOURS = 24
/** setTimeout cannot wait longer than ~24.8 days. */
export const MAX_INTERVAL_HOURS = 24 * 24
const MIN_INTERVAL_HOURS = 0.25
const HOUR_MS = 3_600_000
export const BUSY_RETRY_MS = 10 * 60_000
const FAILURE_RETRY_MS = HOUR_MS
const FIRST_RUN_MIN_MS = 5 * 60_000
const FIRST_RUN_SPREAD_MS = 10 * 60_000

export type TrackedReason = 'manual' | 'scheduled'
export type TickResult = 'created' | 'unchanged' | 'empty' | 'failed' | 'busy'

/** Persisted in data/backups/.last-scheduled.json. */
export type ScheduleRecord = {
  /** Fingerprint of the content captured by `filename` (set only when the backup fully succeeded). */
  fingerprint: string | null
  filename: string | null
  /** Last snapshot that was written (ms). */
  snapshotAt: number | null
  /** Last tick that found the content unchanged since `filename` (ms). */
  verifiedAt: number | null
  lastRunAt: number | null
  lastReason: TrackedReason | null
  lastResult: TickResult | null
  /** Did the last backup attempt succeed (local snapshot and, when configured, the R2 push)? */
  lastOk: boolean | null
  lastError: string | null
}

export type BackupStatus = {
  /** Newest snapshot on disk (ms), or null when there is none. */
  lastAt: number | null
  lastOk: boolean | null
  /**
   * Hours since the content was last known to be captured by a backup: the
   * newer of the last snapshot and the last tick that confirmed nothing
   * changed since it. null when no backup exists.
   */
  ageHours: number | null
  scheduled: boolean
  nextAt: number | null
  intervalHours: number
  lastRunAt: number | null
  lastResult: TickResult | null
  lastError: string | null
}

export type TickOutcome =
  | { result: 'created'; filename: string; ok: boolean }
  | { result: 'unchanged'; filename: string }
  | { result: 'empty' }
  | { result: 'busy' }
  | { result: 'failed'; error: string }

export type ScheduleOptions = {
  intervalHours?: number
  setTimeoutFn?: (fn: () => void, ms: number) => unknown
  clearTimeoutFn?: (handle: unknown) => void
  random?: () => number
  now?: () => number
}

export type ScheduleHandle = { stop: () => void }

type Runtime = {
  started: boolean
  intervalHours: number
  nextAt: number | null
}

type ScheduleGlobal = typeof globalThis & { __backupScheduleRuntime?: Runtime }

function runtime(): Runtime {
  const g = globalThis as ScheduleGlobal
  if (!g.__backupScheduleRuntime) g.__backupScheduleRuntime = { started: false, intervalHours: 0, nextAt: null }
  return g.__backupScheduleRuntime
}

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** BACKUP_INTERVAL_HOURS: unset/blank → 24, 0 → disabled, otherwise clamped to [0.25, 576]. */
export function backupIntervalHours(raw: string | undefined = process.env.BACKUP_INTERVAL_HOURS): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_INTERVAL_HOURS
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) {
    log.warn('invalid BACKUP_INTERVAL_HOURS, using the default', { value: raw, defaultHours: DEFAULT_INTERVAL_HOURS })
    return DEFAULT_INTERVAL_HOURS
  }
  if (n === 0) return 0
  return Math.min(Math.max(n, MIN_INTERVAL_HOURS), MAX_INTERVAL_HOURS)
}

// ── Fingerprint ───────────────────────────────────────────────────────────

/** True when the store holds no content at all (a fresh container whose boot sync did not run). */
export function contentStoreIsEmpty(): boolean {
  const row = getDb()
    .prepare(
      `SELECT (SELECT count(*) FROM pages) + (SELECT count(*) FROM collection_items)
            + (SELECT count(*) FROM kv WHERE key NOT LIKE 'tombstones:%') AS n`,
    )
    .get() as { n: number }
  return row.n === 0
}

/** sha256 over everything a snapshot captures that can change between ticks. */
export function contentFingerprint(): string {
  const db = getDb()
  const tables: Record<string, { m: number | null; c: number }> = {}
  for (const table of ['pages', 'collection_items', 'kv']) {
    tables[table] = db.prepare(`SELECT max(updated_at) AS m, count(*) AS c FROM ${table}`).get() as {
      m: number | null
      c: number
    }
  }
  let inbox: { size: number; mtime: number } | null = null
  try {
    const stat = fs.statSync(inboxFile())
    inbox = { size: stat.size, mtime: Math.floor(stat.mtimeMs) }
  } catch {
    inbox = null
  }
  const uploads = uploadInventory().map((u) => `${u.name}:${u.bytes}`)
  const target = isR2Configured() ? `r2:${getR2Bucket()}` : 'local'
  return crypto.createHash('sha256').update(JSON.stringify({ tables, inbox, uploads, target })).digest('hex')
}

// ── Persisted record ──────────────────────────────────────────────────────

const EMPTY_RECORD: ScheduleRecord = {
  fingerprint: null,
  filename: null,
  snapshotAt: null,
  verifiedAt: null,
  lastRunAt: null,
  lastReason: null,
  lastResult: null,
  lastOk: null,
  lastError: null,
}

function recordFile(): string {
  return path.join(BACKUP_CONSTANTS.BACKUPS_DIR, '.last-scheduled.json')
}

const TICK_RESULTS: TickResult[] = ['created', 'unchanged', 'empty', 'failed', 'busy']
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown) => (typeof v === 'string' && v ? v : null)

export function readScheduleRecord(): ScheduleRecord {
  try {
    const raw = JSON.parse(fs.readFileSync(recordFile(), 'utf8')) as Record<string, unknown>
    const reason = raw.lastReason === 'manual' || raw.lastReason === 'scheduled' ? raw.lastReason : null
    const result =
      typeof raw.lastResult === 'string' && (TICK_RESULTS as string[]).includes(raw.lastResult)
        ? (raw.lastResult as TickResult)
        : null
    return {
      fingerprint: str(raw.fingerprint),
      filename: str(raw.filename),
      snapshotAt: num(raw.snapshotAt),
      verifiedAt: num(raw.verifiedAt),
      lastRunAt: num(raw.lastRunAt),
      lastReason: reason,
      lastResult: result,
      lastOk: typeof raw.lastOk === 'boolean' ? raw.lastOk : null,
      lastError: str(raw.lastError),
    }
  } catch {
    return { ...EMPTY_RECORD }
  }
}

function writeScheduleRecord(record: ScheduleRecord) {
  const file = recordFile()
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(record, null, 2))
    fs.renameSync(tmp, file)
  } catch (err) {
    log.error('could not write the backup schedule record', { file, err })
  }
}

function localSnapshotExists(filename: string | null): boolean {
  if (!filename) return false
  return fs.existsSync(path.join(BACKUP_CONSTANTS.BACKUPS_DIR, path.basename(filename)))
}

// ── Backups ───────────────────────────────────────────────────────────────

function safeFingerprint(): string | null {
  try {
    return contentFingerprint()
  } catch (err) {
    log.warn('could not fingerprint the content; the next tick will back up again', { err })
    return null
  }
}

/**
 * createSnapshot() plus bookkeeping for getBackupStatus() and the skip check.
 * The fingerprint is taken BEFORE the snapshot, so an edit made while it runs
 * makes the next tick back up again. A snapshot whose R2 push failed is
 * recorded as not OK and not fingerprinted (the next tick retries it).
 * Throws what createSnapshot throws (StorageBusyError is not recorded).
 */
export async function createTrackedSnapshot(reason: TrackedReason, now: () => number = Date.now): Promise<SnapshotResult> {
  const fingerprint = safeFingerprint()
  const startedAt = now()
  let result: SnapshotResult
  try {
    result = await createSnapshot({ reason })
  } catch (err) {
    if (err instanceof StorageBusyError) throw err
    writeScheduleRecord({
      ...readScheduleRecord(),
      lastRunAt: startedAt,
      lastReason: reason,
      lastResult: 'failed',
      lastOk: false,
      lastError: errMsg(err),
    })
    throw err
  }
  const r2Failed = Boolean(result.r2.error)
  writeScheduleRecord({
    ...readScheduleRecord(),
    fingerprint: r2Failed ? null : fingerprint,
    filename: result.filename,
    snapshotAt: now(),
    lastRunAt: startedAt,
    lastReason: reason,
    lastResult: 'created',
    lastOk: !r2Failed,
    lastError: r2Failed ? `Saved locally, but the R2 push failed: ${result.r2.error}` : null,
  })
  return result
}

/** One scheduled tick: skip when nothing changed, otherwise snapshot. Never throws. */
export async function runScheduledBackup(now: () => number = Date.now): Promise<TickOutcome> {
  try {
    const record = readScheduleRecord()
    // Never let an empty store (e.g. a boot sync that failed) replace the
    // good backups/latest.tgz in R2 with an empty snapshot.
    if (contentStoreIsEmpty()) {
      writeScheduleRecord({ ...record, lastRunAt: now(), lastReason: 'scheduled', lastResult: 'empty' })
      log.warn('scheduled backup skipped: the content store is empty')
      return { result: 'empty' }
    }
    const fingerprint = safeFingerprint()
    if (fingerprint && record.fingerprint === fingerprint && localSnapshotExists(record.filename)) {
      const at = now()
      writeScheduleRecord({ ...record, verifiedAt: at, lastRunAt: at, lastReason: 'scheduled', lastResult: 'unchanged' })
      log.info('scheduled backup skipped: content unchanged since the last snapshot', { filename: record.filename })
      return { result: 'unchanged', filename: record.filename as string }
    }
    const result = await createTrackedSnapshot('scheduled', now)
    return { result: 'created', filename: result.filename, ok: !result.r2.error }
  } catch (err) {
    if (err instanceof StorageBusyError) {
      writeScheduleRecord({ ...readScheduleRecord(), lastRunAt: now(), lastReason: 'scheduled', lastResult: 'busy' })
      log.info('scheduled backup postponed: another backup or restore is running', { retryInMs: BUSY_RETRY_MS })
      return { result: 'busy' }
    }
    log.error('scheduled backup failed', { err })
    writeScheduleRecord({
      ...readScheduleRecord(),
      lastRunAt: now(),
      lastReason: 'scheduled',
      lastResult: 'failed',
      lastOk: false,
      lastError: errMsg(err),
    })
    return { result: 'failed', error: errMsg(err) }
  }
}

/**
 * Start the schedule for this process (idempotence across runtimes is the
 * caller's job: instrumentation.ts guards it with globalThis). Returns a
 * handle whose stop() cancels the pending tick.
 */
export function startBackupSchedule(opts: ScheduleOptions = {}): ScheduleHandle {
  const intervalHours = opts.intervalHours ?? backupIntervalHours()
  const rt = runtime()
  rt.intervalHours = intervalHours
  rt.nextAt = null
  if (intervalHours <= 0) {
    rt.started = false
    log.info('scheduled backups are disabled (BACKUP_INTERVAL_HOURS=0)')
    return { stop: () => {} }
  }

  const setT = opts.setTimeoutFn ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearT = opts.clearTimeoutFn ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const random = opts.random ?? Math.random
  const now = opts.now ?? Date.now
  const intervalMs = intervalHours * HOUR_MS
  let timer: unknown = null
  let stopped = false

  const schedule = (ms: number) => {
    if (stopped) return
    rt.nextAt = now() + ms
    timer = setT(() => void tick(), ms)
    // Never keep the process (or a test run) alive just for the next backup.
    const unref = (timer as { unref?: () => void } | null)?.unref
    if (typeof unref === 'function') unref.call(timer)
  }

  const tick = async () => {
    timer = null
    rt.nextAt = null
    const outcome = await runScheduledBackup(now)
    const next =
      outcome.result === 'busy'
        ? BUSY_RETRY_MS
        : outcome.result === 'failed' || (outcome.result === 'created' && !outcome.ok)
          ? Math.min(intervalMs, FAILURE_RETRY_MS)
          : intervalMs
    schedule(next)
  }

  rt.started = true
  const first = FIRST_RUN_MIN_MS + Math.floor(Math.max(0, Math.min(1, random())) * FIRST_RUN_SPREAD_MS)
  schedule(first)
  log.info('scheduled backups enabled', { intervalHours, firstRunInMs: first })

  return {
    stop: () => {
      stopped = true
      if (timer !== null) clearT(timer)
      timer = null
      rt.started = false
      rt.nextAt = null
    },
  }
}

// ── Status ────────────────────────────────────────────────────────────────

const round1 = (n: number) => Math.round(n * 10) / 10

/** Backup health for /api/health, the Storage panel and the admin overview. Never throws. */
export function getBackupStatus(now: number = Date.now()): BackupStatus {
  const record = readScheduleRecord()
  let newestLocal: number | null = null
  try {
    newestLocal = listLocalBackups()[0]?.mtime ?? null
  } catch {
    newestLocal = null
  }
  const candidates = [record.snapshotAt, newestLocal].filter((n): n is number => n !== null)
  const lastAt = candidates.length ? Math.max(...candidates) : null
  const coveredAt = lastAt === null ? null : Math.max(lastAt, record.verifiedAt ?? 0)
  const rt = runtime()
  return {
    lastAt,
    lastOk: record.lastOk,
    ageHours: coveredAt === null ? null : round1(Math.max(0, now - coveredAt) / HOUR_MS),
    scheduled: rt.started && rt.intervalHours > 0,
    nextAt: rt.started ? rt.nextAt : null,
    intervalHours: rt.started ? rt.intervalHours : backupIntervalHours(),
    lastRunAt: record.lastRunAt,
    lastResult: record.lastResult,
    lastError: record.lastError,
  }
}

/** Human-readable health warnings (empty when everything is fine). Safe to publish: no error details. */
export function backupHealthWarnings(status: BackupStatus, r2Pending: number): string[] {
  const warnings: string[] = []
  if (status.scheduled) {
    if (status.ageHours === null) {
      warnings.push('No backup exists yet.')
    } else if (status.ageHours > 2 * status.intervalHours) {
      warnings.push(
        `The newest backup is ${status.ageHours} h behind the content (schedule: every ${status.intervalHours} h).`,
      )
    }
  }
  // The error text itself stays in the admin Storage panel (this list also
  // goes to monitors holding HEALTH_TOKEN through /api/health).
  if (status.lastOk === false) warnings.push('The last backup attempt failed; details are in the admin Storage panel.')
  if (r2Pending > 0) {
    warnings.push(`${r2Pending} R2 object${r2Pending === 1 ? ' is' : 's are'} out of date (r2_pending); the next boot sync repairs them.`)
  }
  return warnings
}
