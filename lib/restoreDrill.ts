import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import Database from 'better-sqlite3'
import { getAnalyticsDb } from './analytics/db'
import {
  BACKUP_CONSTANTS,
  SNAPSHOT_FILE_RE,
  extractTarball,
  listLocalBackups,
  type SnapshotManifest,
} from './backup'
import { getDb } from './db'
import { getR2Bucket, isR2Configured, r2GetBuffer } from './r2'
import { log } from './log'
import { InternalJobBusyError, triggerInternalJob } from './internalJobs'
import { isValidUploadName } from './security/uploadName'
import { currentVersion, runMigrations } from '../scripts/db/migrate.mjs'
import { CONTENT_MIGRATIONS } from '../scripts/db/content/index.mjs'

/**
 * Restore drill: proves that the newest backup can actually be restored,
 * without touching the live site.
 *
 * The snapshot is the off-site copy (R2 backups/latest.tgz) when R2 is
 * configured — the copy that matters when the server is lost — else the
 * newest local data/backups/snapshot-*.tgz. It is extracted into a scratch
 * directory under data/backups/ (same volume as the backups, never /tmp,
 * which may be a small tmpfs) and checked:
 *
 *   archive     gunzip + untar succeed and MANIFEST.json parses
 *   files       every manifest entry is present with its size, and its
 *               sha256 where the manifest records one (2.4+ snapshots)
 *   integrity   PRAGMA integrity_check on db/content.db is "ok"
 *   tables      pages, collection_items and kv exist
 *   migrations  this build's content migrations apply to the copy (what a
 *               restore would run when it reopens the swapped-in file)
 *   rows        row counts equal the counts recorded in the manifest (2.4+);
 *               the difference to the live store is reported for information
 *   render      the newest published article compiles with the public
 *               renderer
 *   uploads     every image name is one the file server can serve
 *   inbox       the contact inbox lines parse
 *
 * Each check passes, warns or fails; the drill fails when any check fails.
 * The scratch directory is always removed. Results go to analytics.db
 * (restore_drills, newest DRILL_KEEP kept) and surface in the admin System
 * panel and the /api/health detail.
 *
 * Schedule: startRestoreDrillSchedule() (instrumentation.ts) runs a drill
 * every RESTORE_DRILL_INTERVAL_HOURS (default 168 = weekly; 0 disables),
 * first 30–45 minutes after boot when none ran within the interval. A drill
 * never overlaps another drill, a backup or a restore.
 */

export const DEFAULT_DRILL_INTERVAL_HOURS = 168
export const DRILL_KEEP = 52
const HOUR_MS = 3_600_000
const BUSY_RETRY_MS = 10 * 60_000
const FIRST_RUN_MIN_MS = 30 * 60_000
const FIRST_RUN_SPREAD_MS = 15 * 60_000
const FAILED_RETRY_MS = 24 * HOUR_MS
const REQUIRED_TABLES = ['pages', 'collection_items', 'kv'] as const

export type CheckStatus = 'pass' | 'warn' | 'fail'
export type DrillCheck = { id: string; label: string; status: CheckStatus; detail: string }
export type DrillStatus = 'passed' | 'failed' | 'skipped'
export type DrillTrigger = 'scheduled' | 'manual'

export type DrillResult = {
  id: number | null
  ranAt: number
  durationMs: number
  trigger: DrillTrigger
  status: DrillStatus
  source: 'r2' | 'local' | null
  snapshot: string | null
  snapshotAt: number | null
  bytes: number | null
  summary: string
  checks: DrillCheck[]
}

export class DrillBusyError extends Error {
  constructor(what: string) {
    super(`A ${what} is running — try the drill again when it has finished.`)
    this.name = 'DrillBusyError'
  }
}

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** RESTORE_DRILL_INTERVAL_HOURS: unset → 168, 0 → disabled, else clamped to [1, 576]. */
export function drillIntervalHours(
  raw: string | undefined = process.env.RESTORE_DRILL_INTERVAL_HOURS
): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_DRILL_INTERVAL_HOURS
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_DRILL_INTERVAL_HOURS
  if (n === 0) return 0
  return Math.min(Math.max(n, 1), 24 * 24)
}

// ── Checks on an extracted snapshot (pure over the file system; unit-tested) ──

export type LiveCounts = { pages: number; collection_items: number; kv: number } | null

type Counts = { pages: number; collection_items: number; kv: number }

function countsOf(db: Database.Database): Counts {
  const n = (t: string) =>
    Number((db.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n) || 0
  return { pages: n('pages'), collection_items: n('collection_items'), kv: n('kv') }
}

const fmtCounts = (c: Counts) => `${c.pages} pages, ${c.collection_items} articles, ${c.kv} kv rows`

/** Bodies of published articles, newest first (drafts are skipped). */
function publishedBodies(db: Database.Database): Array<{ ref: string; body: string }> {
  const rows = db
    .prepare(
      `SELECT collection, slug, frontmatter, body FROM collection_items ORDER BY updated_at DESC`
    )
    .all() as Array<{ collection: string; slug: string; frontmatter: string; body: string }>
  const out: Array<{ ref: string; body: string }> = []
  for (const r of rows) {
    let draft = false
    try {
      draft = Boolean((JSON.parse(r.frontmatter) as { draft?: unknown }).draft)
    } catch {
      draft = false
    }
    if (!draft) out.push({ ref: `${r.collection}/${r.slug}`, body: r.body || '' })
  }
  return out
}

/**
 * Run every check on a snapshot already extracted into `dir`.
 * `compile` renders an article body (lib/mdx compileMdx in production).
 */
export async function checkExtractedSnapshot(
  dir: string,
  manifest: SnapshotManifest | null,
  opts: { live: LiveCounts; compile: (body: string) => Promise<unknown> }
): Promise<DrillCheck[]> {
  const checks: DrillCheck[] = []
  const add = (id: string, label: string, status: CheckStatus, detail: string) =>
    checks.push({ id, label, status, detail })

  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.files)) {
    add('archive', 'Archive', 'fail', 'The archive has no readable MANIFEST.json.')
    return checks
  }
  add(
    'archive',
    'Archive',
    'pass',
    `Extracted ${manifest.files.length} files listed in the manifest.`
  )

  // files
  const missing: string[] = []
  const sizeMismatch: string[] = []
  const hashMismatch: string[] = []
  let hashed = 0
  for (const f of manifest.files) {
    const abs = path.join(dir, f.path)
    if (!path.resolve(abs).startsWith(path.resolve(dir) + path.sep)) {
      missing.push(f.path)
      continue
    }
    let stat: fs.Stats
    try {
      stat = fs.statSync(abs)
    } catch {
      missing.push(f.path)
      continue
    }
    if (stat.size !== f.bytes) sizeMismatch.push(f.path)
    if (typeof f.sha256 === 'string') {
      hashed++
      const actual = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex')
      if (actual !== f.sha256) hashMismatch.push(f.path)
    }
  }
  const problems = [
    missing.length ? `${missing.length} missing (${missing.slice(0, 3).join(', ')})` : '',
    sizeMismatch.length
      ? `${sizeMismatch.length} with a different size (${sizeMismatch.slice(0, 3).join(', ')})`
      : '',
    hashMismatch.length
      ? `${hashMismatch.length} with a different checksum (${hashMismatch.slice(0, 3).join(', ')})`
      : '',
  ].filter(Boolean)
  if (problems.length) add('files', 'Files', 'fail', `Manifest entries ${problems.join('; ')}.`)
  else if (hashed === 0) {
    add(
      'files',
      'Files',
      'warn',
      'Every file is present with its recorded size; this snapshot predates per-file checksums.'
    )
  } else
    add(
      'files',
      'Files',
      'pass',
      `All ${manifest.files.length} files match their recorded size and SHA-256.`
    )

  // database
  const dbFile = path.join(dir, 'db', 'content.db')
  const dbStat = fs.existsSync(dbFile) ? fs.statSync(dbFile) : null
  if (!dbStat || dbStat.size === 0) {
    add('integrity', 'Database integrity', 'fail', 'The snapshot contains no content database.')
    return checks
  }
  let db: Database.Database | null = null
  try {
    db = new Database(dbFile, { fileMustExist: true })
    const integrity = (db.pragma('integrity_check') as Array<{ integrity_check: string }>).map(
      (r) => r.integrity_check
    )
    if (integrity.length === 1 && integrity[0] === 'ok')
      add('integrity', 'Database integrity', 'pass', 'PRAGMA integrity_check: ok.')
    else {
      add(
        'integrity',
        'Database integrity',
        'fail',
        `PRAGMA integrity_check: ${integrity.slice(0, 3).join('; ')}`
      )
      return checks
    }

    const tables = new Set(
      (
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
          name: string
        }>
      ).map((r) => r.name)
    )
    const absent = REQUIRED_TABLES.filter((t) => !tables.has(t))
    if (absent.length) {
      add('tables', 'Tables', 'fail', `Missing table(s): ${absent.join(', ')}.`)
      return checks
    }
    add('tables', 'Tables', 'pass', 'pages, collection_items and kv are present.')

    const before = currentVersion(db)
    try {
      const report = runMigrations(db, CONTENT_MIGRATIONS, { label: 'drill copy' })
      add(
        'migrations',
        'Migrations',
        'pass',
        report.applied.length
          ? `This build migrates the copy from v${report.from} to v${report.to}.`
          : report.ahead
            ? `The copy is at v${before}, newer than this build (v${report.latest}); it opens on the additive schema.`
            : `The copy is already at v${before}.`
      )
    } catch (err) {
      add('migrations', 'Migrations', 'fail', errMsg(err))
    }

    const counts = countsOf(db)
    const recorded = manifest.counts
    let rowsStatus: CheckStatus = 'pass'
    let rowsDetail = `Snapshot holds ${fmtCounts(counts)}.`
    if (recorded) {
      const same =
        recorded.pages === counts.pages &&
        recorded.collection_items === counts.collection_items &&
        recorded.kv === counts.kv
      if (!same) {
        rowsStatus = 'fail'
        rowsDetail = `Snapshot holds ${fmtCounts(counts)}, but its manifest recorded ${fmtCounts(recorded)}.`
      }
    } else {
      rowsStatus = 'warn'
      rowsDetail += ' This snapshot predates recorded row counts.'
    }
    if (opts.live) {
      const delta = (k: keyof Counts) => opts.live![k] - counts[k]
      const parts = (['pages', 'collection_items', 'kv'] as const)
        .map((k) => [k, delta(k)] as const)
        .filter(([, d]) => d !== 0)
        .map(
          ([k, d]) =>
            `${d > 0 ? '+' : ''}${d} ${k === 'collection_items' ? 'articles' : k === 'kv' ? 'kv rows' : 'pages'}`
        )
      rowsDetail += parts.length
        ? ` The live store has ${parts.join(', ')} since.`
        : ' The live store has the same counts.'
    }
    add('rows', 'Row counts', rowsStatus, rowsDetail)

    const articles = publishedBodies(db)
    if (!articles.length)
      add('render', 'Article render', 'pass', 'The snapshot has no published article to render.')
    else {
      const first = articles[0]
      try {
        await opts.compile(first.body)
        add('render', 'Article render', 'pass', `${first.ref} compiles with the public renderer.`)
      } catch (err) {
        add(
          'render',
          'Article render',
          'fail',
          `${first.ref} does not compile: ${errMsg(err).slice(0, 200)}`
        )
      }
    }
  } catch (err) {
    add('integrity', 'Database integrity', 'fail', `Not a readable SQLite database: ${errMsg(err)}`)
    return checks
  } finally {
    db?.close()
  }

  // uploads
  const uploadsDir = path.join(dir, 'uploads')
  const uploads = fs.existsSync(uploadsDir)
    ? fs.readdirSync(uploadsDir, { withFileTypes: true }).filter((e) => e.isFile())
    : []
  const unservable = uploads.filter((e) => !isValidUploadName(e.name)).map((e) => e.name)
  if (unservable.length) {
    add(
      'uploads',
      'Images',
      'warn',
      `${unservable.length} file(s) would not be restored (names the file server cannot serve): ${unservable.slice(0, 3).join(', ')}.`
    )
  } else add('uploads', 'Images', 'pass', `${uploads.length} image file(s), all restorable.`)

  // inbox
  const inbox = path.join(dir, 'data', 'inbox', 'contact-inbox.jsonl')
  if (!fs.existsSync(inbox))
    add('inbox', 'Contact inbox', 'pass', 'No contact inbox in this snapshot.')
  else {
    const lines = fs
      .readFileSync(inbox, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
    let bad = 0
    for (const l of lines) {
      try {
        JSON.parse(l)
      } catch {
        bad++
      }
    }
    if (bad)
      add(
        'inbox',
        'Contact inbox',
        'warn',
        `${bad} of ${lines.length} line(s) are not valid JSON and would be skipped by the merge.`
      )
    else add('inbox', 'Contact inbox', 'pass', `${lines.length} line(s), all readable.`)
  }

  return checks
}

/** passed / failed from the checks, plus a one-line summary. */
export function summarizeChecks(checks: DrillCheck[]): { status: DrillStatus; summary: string } {
  const failed = checks.filter((c) => c.status === 'fail')
  const warned = checks.filter((c) => c.status === 'warn')
  if (failed.length)
    return {
      status: 'failed',
      summary: `Failed: ${failed.map((c) => c.label.toLowerCase()).join(', ')}.`,
    }
  return {
    status: 'passed',
    summary: warned.length
      ? `Restorable, with ${warned.length} warning${warned.length === 1 ? '' : 's'} (${warned.map((c) => c.label.toLowerCase()).join(', ')}).`
      : 'Restorable: every check passed.',
  }
}

// ── Running a drill ───────────────────────────────────────────────────────

type DrillGlobal = typeof globalThis & {
  __restoreDrillRunning?: boolean
  __storageOperation?: string | null
}

type SnapshotSource = {
  source: 'r2' | 'local'
  name: string
  buf: Buffer
  offsiteNote: DrillCheck | null
}

async function pickSnapshot(): Promise<SnapshotSource | null> {
  let offsiteNote: DrillCheck | null = null
  if (isR2Configured()) {
    try {
      const buf = await r2GetBuffer(BACKUP_CONSTANTS.R2_LATEST_KEY)
      if (buf) {
        return {
          source: 'r2',
          name: BACKUP_CONSTANTS.R2_LATEST_KEY,
          buf,
          offsiteNote: {
            id: 'source',
            label: 'Source',
            status: 'pass',
            detail: `Drilled the off-site copy r2://${getR2Bucket()}/${BACKUP_CONSTANTS.R2_LATEST_KEY}.`,
          },
        }
      }
      offsiteNote = {
        id: 'source',
        label: 'Source',
        status: 'warn',
        detail: `R2 has no ${BACKUP_CONSTANTS.R2_LATEST_KEY}; drilled the newest local snapshot instead.`,
      }
    } catch (err) {
      offsiteNote = {
        id: 'source',
        label: 'Source',
        status: 'warn',
        detail: `Could not download ${BACKUP_CONSTANTS.R2_LATEST_KEY} from R2 (${errMsg(err)}); drilled the newest local snapshot instead.`,
      }
    }
  }
  const local = listLocalBackups().find((b) => SNAPSHOT_FILE_RE.test(b.filename))
  if (!local) return null
  const buf = fs.readFileSync(path.join(BACKUP_CONSTANTS.BACKUPS_DIR, local.filename))
  return {
    source: 'local',
    name: local.filename,
    buf,
    offsiteNote: offsiteNote || {
      id: 'source',
      label: 'Source',
      status: 'pass',
      detail: `Drilled the newest local snapshot ${local.filename} (R2 is not configured).`,
    },
  }
}

function liveCounts(): LiveCounts {
  try {
    return countsOf(getDb())
  } catch {
    return null
  }
}

/** Remove scratch directories a crashed drill left behind. */
function removeStaleScratch() {
  try {
    for (const name of fs.readdirSync(BACKUP_CONSTANTS.BACKUPS_DIR)) {
      if (name.startsWith('_drill-'))
        fs.rmSync(path.join(BACKUP_CONSTANTS.BACKUPS_DIR, name), { recursive: true, force: true })
    }
  } catch {
    // No backups dir yet.
  }
}

/** Renders an article body with the public renderer (lib/mdx compileMdx, passed in by the API routes). */
export type CompileArticle = (body: string) => Promise<unknown>

/**
 * Run one drill and record it. Throws DrillBusyError when a drill, backup or
 * restore is already running; every other failure becomes a failed check.
 *
 * `compile` is injected rather than imported: this module is also loaded by
 * instrumentation.ts (the schedule), whose bundle must not pull in the MDX
 * renderer and the React modules behind it.
 */
export async function runRestoreDrill(
  trigger: DrillTrigger,
  compile: CompileArticle,
  now: () => number = Date.now
): Promise<DrillResult> {
  const g = globalThis as DrillGlobal
  if (g.__restoreDrillRunning) throw new DrillBusyError('restore drill')
  if (g.__storageOperation) throw new DrillBusyError(g.__storageOperation)
  g.__restoreDrillRunning = true
  const started = now()
  let scratch: string | null = null
  try {
    removeStaleScratch()
    const picked = await pickSnapshot()
    if (!picked) {
      return recordDrill({
        id: null,
        ranAt: started,
        durationMs: now() - started,
        trigger,
        status: 'skipped',
        source: null,
        snapshot: null,
        snapshotAt: null,
        bytes: null,
        summary: 'No backup snapshot exists yet — take one in Storage, then run the drill.',
        checks: [],
      })
    }
    scratch = path.join(
      BACKUP_CONSTANTS.BACKUPS_DIR,
      `_drill-${started}-${crypto.randomBytes(3).toString('hex')}`
    )
    fs.mkdirSync(scratch, { recursive: true, mode: 0o700 })
    const checks: DrillCheck[] = []
    if (picked.offsiteNote) checks.push(picked.offsiteNote)
    let manifest: SnapshotManifest | null = null
    try {
      manifest = await extractTarball(picked.buf, scratch)
    } catch (err) {
      checks.push({
        id: 'archive',
        label: 'Archive',
        status: 'fail',
        detail: `The archive does not extract: ${errMsg(err)}`,
      })
    }
    if (!checks.some((c) => c.id === 'archive')) {
      checks.push(
        ...(await checkExtractedSnapshot(scratch, manifest, { live: liveCounts(), compile }))
      )
    }
    const { status, summary } = summarizeChecks(checks)
    const createdAt = manifest?.createdAt ? Date.parse(manifest.createdAt) : NaN
    return recordDrill({
      id: null,
      ranAt: started,
      durationMs: now() - started,
      trigger,
      status,
      source: picked.source,
      snapshot: picked.name,
      snapshotAt: Number.isFinite(createdAt) ? createdAt : null,
      bytes: picked.buf.length,
      summary,
      checks,
    })
  } finally {
    if (scratch) fs.rmSync(scratch, { recursive: true, force: true })
    g.__restoreDrillRunning = false
  }
}

function recordDrill(result: DrillResult): DrillResult {
  try {
    const db = getAnalyticsDb()
    const info = db
      .prepare(
        `INSERT INTO restore_drills (ran_at, duration_ms, trigger, status, source, snapshot, snapshot_at, bytes, summary, checks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        result.ranAt,
        result.durationMs,
        result.trigger,
        result.status,
        result.source,
        result.snapshot,
        result.snapshotAt,
        result.bytes,
        result.summary,
        JSON.stringify(result.checks)
      )
    db.prepare(
      `DELETE FROM restore_drills WHERE id NOT IN (SELECT id FROM restore_drills ORDER BY ran_at DESC, id DESC LIMIT ?)`
    ).run(DRILL_KEEP)
    result.id = Number(info.lastInsertRowid)
  } catch (err) {
    log.error('could not record the restore drill result', { err })
  }
  const fields = {
    status: result.status,
    source: result.source,
    snapshot: result.snapshot,
    ms: result.durationMs,
  }
  if (result.status === 'failed')
    log.warn('restore drill failed', { ...fields, summary: result.summary })
  else log.info('restore drill finished', fields)
  return result
}

type DrillRow = {
  id: number
  ran_at: number
  duration_ms: number
  trigger: DrillTrigger
  status: DrillStatus
  source: 'r2' | 'local' | null
  snapshot: string | null
  snapshot_at: number | null
  bytes: number | null
  summary: string
  checks: string
}

function fromRow(r: DrillRow): DrillResult {
  let checks: DrillCheck[] = []
  try {
    const parsed = JSON.parse(r.checks) as unknown
    if (Array.isArray(parsed)) checks = parsed as DrillCheck[]
  } catch {
    checks = []
  }
  return {
    id: r.id,
    ranAt: r.ran_at,
    durationMs: r.duration_ms,
    trigger: r.trigger,
    status: r.status,
    source: r.source,
    snapshot: r.snapshot,
    snapshotAt: r.snapshot_at,
    bytes: r.bytes,
    summary: r.summary,
    checks,
  }
}

/** Newest drills first. Never throws (an unreadable store reads as no history). */
export function listRestoreDrills(limit = 10): DrillResult[] {
  try {
    const rows = getAnalyticsDb()
      .prepare('SELECT * FROM restore_drills ORDER BY ran_at DESC, id DESC LIMIT ?')
      .all(Math.max(1, Math.min(DRILL_KEEP, limit))) as DrillRow[]
    return rows.map(fromRow)
  } catch {
    return []
  }
}

export function latestRestoreDrill(): DrillResult | null {
  return listRestoreDrills(1)[0] ?? null
}

/** Newest drill that actually ran (not skipped). */
export function latestRanDrill(): DrillResult | null {
  return listRestoreDrills(DRILL_KEEP).find((d) => d.status !== 'skipped') ?? null
}

// ── Schedule ──────────────────────────────────────────────────────────────

type ScheduleRuntime = { started: boolean; intervalHours: number; nextAt: number | null }
type ScheduleGlobal = typeof globalThis & { __restoreDrillSchedule?: ScheduleRuntime }

function runtime(): ScheduleRuntime {
  const g = globalThis as ScheduleGlobal
  if (!g.__restoreDrillSchedule)
    g.__restoreDrillSchedule = { started: false, intervalHours: 0, nextAt: null }
  return g.__restoreDrillSchedule
}

export type DrillScheduleStatus = {
  enabled: boolean
  intervalHours: number
  nextAt: number | null
  running: boolean
}

export function restoreDrillSchedule(): DrillScheduleStatus {
  const rt = runtime()
  return {
    enabled: rt.started,
    intervalHours: rt.started ? rt.intervalHours : drillIntervalHours(),
    nextAt: rt.started ? rt.nextAt : null,
    running: Boolean((globalThis as DrillGlobal).__restoreDrillRunning),
  }
}

/** When the first scheduled drill after boot is due (pure; unit-tested). */
export function firstDrillDelay(
  lastRanAt: number | null,
  intervalMs: number,
  now: number,
  random: number
): number {
  const bootDelay =
    FIRST_RUN_MIN_MS + Math.floor(Math.max(0, Math.min(1, random)) * FIRST_RUN_SPREAD_MS)
  if (lastRanAt === null) return bootDelay
  return Math.max(bootDelay, lastRanAt + intervalMs - now)
}

export type DrillScheduleOptions = {
  intervalHours?: number
  setTimeoutFn?: (fn: () => void, ms: number) => unknown
  clearTimeoutFn?: (handle: unknown) => void
  random?: () => number
  now?: () => number
  run?: (trigger: DrillTrigger) => Promise<DrillResult>
}

/**
 * The scheduled drill runs through POST /api/internal/restore-drill on this
 * same server (lib/internalJobs.ts): the API route has the MDX renderer the
 * render check needs, which the instrumentation bundle that owns the timer
 * must not import.
 */
async function triggerScheduledDrill(): Promise<DrillResult> {
  try {
    const out = (await triggerInternalJob('restore-drill')) as { drill?: DrillResult }
    if (!out?.drill) throw new Error('the internal drill endpoint returned no result')
    return out.drill
  } catch (err) {
    if (err instanceof InternalJobBusyError) throw new DrillBusyError('backup, restore or drill')
    throw err
  }
}

/** Start the weekly drill for this process. Returns a handle whose stop() cancels it. */
export function startRestoreDrillSchedule(opts: DrillScheduleOptions = {}): { stop: () => void } {
  const intervalHours = opts.intervalHours ?? drillIntervalHours()
  const rt = runtime()
  rt.intervalHours = intervalHours
  rt.nextAt = null
  if (intervalHours <= 0) {
    rt.started = false
    log.info('restore drills are disabled (RESTORE_DRILL_INTERVAL_HOURS=0)')
    return { stop: () => {} }
  }
  const setT = opts.setTimeoutFn ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearT =
    opts.clearTimeoutFn ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const now = opts.now ?? Date.now
  const run = opts.run ?? (() => triggerScheduledDrill())
  const intervalMs = intervalHours * HOUR_MS
  let timer: unknown = null
  let stopped = false

  const schedule = (ms: number) => {
    if (stopped) return
    rt.nextAt = now() + ms
    timer = setT(() => void tick(), ms)
    const unref = (timer as { unref?: () => void } | null)?.unref
    if (typeof unref === 'function') unref.call(timer)
  }

  const tick = async () => {
    timer = null
    rt.nextAt = null
    let next = intervalMs
    try {
      const result = await run('scheduled')
      if (result.status === 'failed') next = Math.min(intervalMs, FAILED_RETRY_MS)
    } catch (err) {
      if (err instanceof DrillBusyError) next = BUSY_RETRY_MS
      else {
        log.error('scheduled restore drill crashed', { err })
        next = Math.min(intervalMs, FAILED_RETRY_MS)
      }
    }
    schedule(next)
  }

  rt.started = true
  const first = firstDrillDelay(
    latestRanDrill()?.ranAt ?? null,
    intervalMs,
    now(),
    (opts.random ?? Math.random)()
  )
  schedule(first)
  log.info('restore drills scheduled', { intervalHours, firstRunInMs: first })
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

/** Health warnings about drills (empty when fine). Safe to publish: no details. */
export function restoreDrillWarnings(
  latest: DrillResult | null,
  schedule: DrillScheduleStatus,
  hasBackups: boolean,
  now = Date.now()
): string[] {
  if (!hasBackups) return []
  if (latest && latest.status === 'failed')
    return ['The last restore drill failed; details are in the admin System panel.']
  if (schedule.enabled && schedule.intervalHours > 0) {
    const staleMs = 2 * schedule.intervalHours * HOUR_MS
    if (!latest || latest.status === 'skipped') {
      // Only once the first drill had time to run since boot.
      if (process.uptime() * 1000 > FIRST_RUN_MIN_MS + FIRST_RUN_SPREAD_MS + HOUR_MS)
        return ['No restore drill has run yet.']
    } else if (now - latest.ranAt > staleMs) {
      return [
        `The last restore drill ran ${Math.round((now - latest.ranAt) / HOUR_MS)} h ago (schedule: every ${schedule.intervalHours} h).`,
      ]
    }
  }
  return []
}
