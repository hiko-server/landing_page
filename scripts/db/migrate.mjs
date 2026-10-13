/**
 * Versioned SQLite migrations, shared by the app (lib/db.ts,
 * lib/analytics/db.ts, lib/auth/db.ts) and the plain-Node scripts
 * (scripts/content-helpers.mjs, scripts/migrate-db.mjs). This file is plain
 * ESM so the container's boot scripts can import it without Next; webpack
 * bundles the same module into the server.
 *
 * Model
 *   - Each database has an ordered list of migration modules
 *     (scripts/db/<db>/NNN-name.mjs, listed by scripts/db/<db>/index.mjs).
 *     A migration is `{ version, name, up(db) }`; versions start at 1 and
 *     are contiguous.
 *   - `schema_version (version, name, applied_at)` records every applied
 *     migration; `PRAGMA user_version` mirrors the newest one so the sqlite3
 *     CLI shows it at a glance.
 *   - Every migration runs in its own `BEGIN IMMEDIATE` transaction together
 *     with its schema_version row: it applies completely or not at all. The
 *     version is re-read inside the write lock, so several processes opening
 *     the same file at once (`next build` workers, the boot sync and the
 *     server) apply each migration exactly once.
 *   - Idempotent: a version already recorded is skipped. Version 1 of every
 *     database is a baseline written with CREATE … IF NOT EXISTS, so a store
 *     created before this file existed (no schema_version table) adopts the
 *     baseline without any change to its tables.
 *
 * Rules for new migrations (rollback safety — scripts/deploy.sh rolls back
 * by starting the previous image on the same data volume):
 *   - expand only: add tables, columns (nullable or with a default) and
 *     indexes. Never drop, rename or retype in the same release that stops
 *     using something; contract in a later release, once no image that still
 *     reads the old shape can be rolled back to.
 *   - guard statements that are not naturally idempotent (ALTER TABLE ADD
 *     COLUMN) with a check, so a migration can be replayed on a store that
 *     was changed by hand.
 *   - never call `db.exec('BEGIN')`/`COMMIT` inside `up`: the runner owns the
 *     transaction.
 *
 * An older image that meets a newer store (version ahead of the newest
 * migration it knows) logs a warning and keeps working — that is exactly
 * what the expand-only rule guarantees.
 */

/**
 * @typedef {{ exec(sql: string): unknown, prepare(sql: string): { run(...params: unknown[]): unknown, get(...params: unknown[]): unknown, all(...params: unknown[]): unknown[] }, pragma(source: string, options?: { simple?: boolean }): unknown, readonly inTransaction: boolean }} SqliteDb
 * @typedef {{ version: number, name: string, up: (db: SqliteDb) => void }} Migration
 * @typedef {{ version: number, name: string, appliedAt: number }} AppliedMigration
 * @typedef {{ label: string, from: number, to: number, latest: number, applied: Array<{ version: number, name: string }>, ahead: boolean }} MigrationReport
 * @typedef {{ label?: string, beforeMigrate?: (info: { from: number, pending: Migration[] }) => void, now?: () => number, busyTimeoutMs?: number }} MigrationOptions
 */

import fs from 'node:fs'
import path from 'node:path'

export const SCHEMA_TABLE = 'schema_version'
/** Pre-migration copies kept per database label (newest first). */
export const PRE_MIGRATION_KEEP = 5

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

/**
 * Throws unless `migrations` is a well-formed ordered list: versions 1…n
 * without gaps or duplicates, a slug name and an `up` function each.
 * @param {readonly Migration[]} migrations
 */
export function validateMigrations(migrations) {
  if (!Array.isArray(migrations)) throw new TypeError('migrations must be an array')
  migrations.forEach((m, i) => {
    if (!m || typeof m !== 'object') throw new TypeError(`migration #${i + 1} is not an object`)
    if (m.version !== i + 1) {
      throw new Error(
        `migration #${i + 1} has version ${String(m.version)}; versions must be 1…n in order, without gaps`
      )
    }
    if (typeof m.name !== 'string' || !NAME_RE.test(m.name))
      throw new Error(`migration ${m.version} needs a slug name`)
    if (typeof m.up !== 'function')
      throw new Error(`migration ${m.version} (${m.name}) has no up(db) function`)
  })
}

/** @param {SqliteDb} db */
function hasSchemaTable(db) {
  return !!db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(SCHEMA_TABLE)
}

/**
 * Newest applied version (0 for a store without the table or without rows).
 * @param {SqliteDb} db
 * @returns {number}
 */
export function currentVersion(db) {
  if (!hasSchemaTable(db)) return 0
  const row = /** @type {{ v: number | null } | undefined} */ (
    db.prepare(`SELECT max(version) AS v FROM ${SCHEMA_TABLE}`).get()
  )
  return Number(row?.v) || 0
}

/**
 * Every applied migration, oldest first.
 * @param {SqliteDb} db
 * @returns {AppliedMigration[]}
 */
export function appliedMigrations(db) {
  if (!hasSchemaTable(db)) return []
  const rows = /** @type {Array<{ version: number, name: string, applied_at: number }>} */ (
    db.prepare(`SELECT version, name, applied_at FROM ${SCHEMA_TABLE} ORDER BY version`).all()
  )
  return rows.map((r) => ({
    version: Number(r.version),
    name: String(r.name),
    appliedAt: Number(r.applied_at),
  }))
}

/**
 * Migrations newer than the store.
 * @param {SqliteDb} db
 * @param {readonly Migration[]} migrations
 */
export function pendingMigrations(db, migrations) {
  const current = currentVersion(db)
  return migrations.filter((m) => m.version > current)
}

/** @param {number} ms */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Run `fn`, retrying while SQLite answers SQLITE_BUSY / SQLITE_LOCKED, for at
 * most `timeoutMs`. The busy handler (the driver's `timeout`) covers most
 * waits; this covers the ones SQLite answers without consulting it — a
 * journal-mode switch while another process creates the same file, or a
 * BEGIN IMMEDIATE racing a WAL recovery.
 * @template T
 * @param {() => T} fn
 * @param {number} [timeoutMs]
 * @returns {T}
 */
export function withBusyRetry(fn, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  for (let attempt = 0; ; attempt++) {
    try {
      return fn()
    } catch (err) {
      const code = /** @type {{ code?: string }} */ (err).code
      if ((code !== 'SQLITE_BUSY' && code !== 'SQLITE_LOCKED') || Date.now() > deadline) throw err
      sleepSync(Math.min(200, 20 * 2 ** attempt))
    }
  }
}

/**
 * Switch the store to WAL unless it already is (idempotent, race-safe: a
 * second process opening a brand-new file may be refused the switch).
 * @param {SqliteDb} db
 * @param {number} [timeoutMs]
 */
export function ensureWal(db, timeoutMs = 10_000) {
  withBusyRetry(() => {
    const mode = String(db.pragma('journal_mode', { simple: true })).toLowerCase()
    if (mode !== 'wal') db.pragma('journal_mode = WAL')
  }, timeoutMs)
}

/**
 * @param {SqliteDb} db
 * @param {number} timeoutMs
 */
function beginImmediate(db, timeoutMs) {
  withBusyRetry(() => db.exec('BEGIN IMMEDIATE'), timeoutMs)
}

/** @param {SqliteDb} db */
function ensureSchemaTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS ${SCHEMA_TABLE} (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )`)
}

/**
 * Bring `db` up to the newest migration. Returns what changed; throws (with
 * the database left at the last fully applied version) when a migration
 * fails.
 *
 * `beforeMigrate` runs once, before the first pending migration, outside any
 * transaction — e.g. to copy the file with VACUUM INTO.
 *
 * @param {SqliteDb} db
 * @param {readonly Migration[]} migrations
 * @param {MigrationOptions} [options]
 * @returns {MigrationReport}
 */
export function runMigrations(db, migrations, options = {}) {
  validateMigrations(migrations)
  const label = options.label || 'database'
  const now = options.now || Date.now
  const busyTimeoutMs = options.busyTimeoutMs ?? 10_000
  const latest = migrations.length
  const from = currentVersion(db)
  /** @type {MigrationReport} */
  const report = { label, from, to: from, latest, applied: [], ahead: from > latest }
  const pending = migrations.filter((m) => m.version > from)
  if (!pending.length) return report

  if (options.beforeMigrate) options.beforeMigrate({ from, pending })

  for (const m of pending) {
    beginImmediate(db, busyTimeoutMs)
    try {
      ensureSchemaTable(db)
      // Re-read under the write lock: another process may have got here first.
      const current = currentVersion(db)
      if (current >= m.version) {
        db.exec('COMMIT')
        report.to = Math.max(report.to, current)
        continue
      }
      if (current !== m.version - 1) {
        throw new Error(`${label} is at version ${current}, cannot apply ${m.version} (${m.name})`)
      }
      m.up(db)
      if (!db.inTransaction) {
        throw new Error(
          `${label} migration ${m.version} (${m.name}) ended the runner's transaction`
        )
      }
      db.prepare(`INSERT INTO ${SCHEMA_TABLE} (version, name, applied_at) VALUES (?, ?, ?)`).run(
        m.version,
        m.name,
        now()
      )
      db.pragma(`user_version = ${m.version}`)
      db.exec('COMMIT')
      report.to = m.version
      report.applied.push({ version: m.version, name: m.name })
    } catch (err) {
      if (db.inTransaction) db.exec('ROLLBACK')
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(`${label} migration ${m.version} (${m.name}) failed: ${reason}`, {
        cause: err,
      })
    }
  }
  return report
}

/**
 * Names recorded in the store that differ from the code's list (a store
 * migrated by another code line). Empty when everything matches.
 * @param {SqliteDb} db
 * @param {readonly Migration[]} migrations
 * @returns {string[]}
 */
export function migrationDrift(db, migrations) {
  const byVersion = new Map(migrations.map((m) => [m.version, m.name]))
  return appliedMigrations(db)
    .filter((a) => byVersion.has(a.version) && byVersion.get(a.version) !== a.name)
    .map(
      (a) => `version ${a.version}: store says "${a.name}", code says "${byVersion.get(a.version)}"`
    )
}

/**
 * Does the table have this column? (for guarded ALTER TABLE … ADD COLUMN)
 * @param {SqliteDb} db
 * @param {string} table
 * @param {string} column
 */
export function hasColumn(db, table, column) {
  const cols = /** @type {Array<{ name: string }>} */ (
    db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all()
  )
  return cols.some((c) => c.name === column)
}

/**
 * `<label>-v<from>-<UTC stamp>.db` — sortable, one per migration run.
 * @param {string} label
 * @param {number} from
 * @param {Date} [d]
 */
export function preMigrationFilename(label, from, d = new Date()) {
  const stamp = d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
    .replace('T', '-')
  return `${label}-v${from}-${stamp}.db`
}

/**
 * Copy a versioned store aside before it is migrated (VACUUM INTO writes a
 * consistent, compacted copy and works while other connections are open).
 * Keeps the newest PRE_MIGRATION_KEEP copies of this label. Returns the copy's
 * path, or null when there was nothing worth copying (a store still at
 * version 0 only adopts the idempotent baseline).
 *
 * @param {SqliteDb} db
 * @param {{ dir: string, label: string, from: number, now?: Date }} opts
 * @returns {string | null}
 */
export function backupBeforeMigration(db, { dir, label, from, now = new Date() }) {
  if (from < 1) return null
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const file = path.join(dir, preMigrationFilename(label, from, now))
  if (fs.existsSync(file)) return file
  db.prepare('VACUUM INTO ?').run(file)
  const prefix = `${label}-v`
  const copies = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.db'))
    .map((f) => ({ f, at: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.at - a.at || b.f.localeCompare(a.f))
  for (const old of copies.slice(PRE_MIGRATION_KEEP))
    fs.rmSync(path.join(dir, old.f), { force: true })
  return file
}
