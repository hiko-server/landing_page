import path from 'path'
import fs from 'fs'
import Database from 'better-sqlite3'
import { backupBeforeMigration, ensureWal, runMigrations, withBusyRetry, type MigrationReport } from '../scripts/db/migrate.mjs'
import { CONTENT_MIGRATIONS } from '../scripts/db/content/index.mjs'
import { log } from './log'
import { logMigrationReport } from './dbMigrations'

/**
 * Local-first content store.
 *
 * One SQLite file at data/content.db is the canonical source of truth for
 * editorial content. Cloudflare R2 is the off-site replica (see lib/r2.ts).
 * Filesystem snapshots in data/*_snapshots/ remain as audit-only artefacts
 * and the legacy content/*.mdx + data/*.json files act as a one-way seed
 * (used by scripts/migrate-files-to-db.mjs).
 *
 * Schema (versioned migrations in scripts/db/content/, run on open):
 *   pages            (name PK, frontmatter, body, updated_at)
 *   collection_items (collection, slug, frontmatter, body, updated_at) PK(collection, slug)
 *   kv               (key PK, value, updated_at)
 *   r2_pending       (key PK, op 'put'|'delete', updated_at)
 *
 * `frontmatter` columns hold JSON-encoded objects. `body` is the raw MDX
 * body (no frontmatter wrapper). `kv.value` is an opaque JSON blob.
 *
 * `r2_pending` lists R2 keys whose last upload/delete failed after all
 * retries (lib/contentStore.ts, lib/backup.ts): R2 is known to be stale for
 * them, so the boot sync (scripts/sync-from-r2.mjs) reconciles them from the
 * local row unconditionally instead of trusting timestamps. `updated_at` is
 * when the failure was recorded. The app and the plain-Node scripts apply the
 * same migration list (scripts/db/content/index.mjs); a parity test compares
 * the resulting sqlite_master of both.
 */

const DB_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DB_DIR, 'content.db')

/** Absolute path of the live SQLite file (used by backup/restore). */
export const CONTENT_DB_PATH = DB_PATH

// Next bundles pages and API routes into separate webpack runtimes, so a
// module-level variable would give each runtime its own connection — and a
// restore that closes "the" handle would leave the other one pointing at the
// replaced file. The handle lives on globalThis so the whole process shares
// exactly one connection, and closeDb()/reopenDb() reset it for everyone.
type DbGlobal = typeof globalThis & { __contentDb?: Database.Database | null }
const dbGlobal = globalThis as DbGlobal

// `next build` collects page data in several worker processes at once, and the
// Docker build starts with no content.db at all. Every worker then races to
// create the file and switch it to WAL; SQLite answers the losers with
// SQLITE_BUSY *without* consulting the busy handler for a journal-mode change,
// so the build used to die with "database is locked". Setup is therefore
// idempotent (skip the switch when the file is already WAL) and retried
// (ensureWal / withBusyRetry in scripts/db/migrate.mjs).
const BUSY_TIMEOUT_MS = 10_000

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })
}

export function getDb(): Database.Database {
  const cached = dbGlobal.__contentDb
  if (cached && cached.open) return cached
  ensureDir()
  const db = new Database(DB_PATH, { timeout: BUSY_TIMEOUT_MS })
  try {
    initSchema(db)
  } catch (err) {
    db.close()
    throw err
  }
  dbGlobal.__contentDb = db
  return db
}

/**
 * Switch `db` to WAL and bring it to the newest content migration
 * (scripts/db/content — the same list the plain-Node scripts apply through
 * scripts/content-helpers.mjs). Idempotent; safe while other processes open
 * the same file (each migration runs once, under BEGIN IMMEDIATE). A store
 * that is already versioned is copied to data/backups/pre-migration/ before a
 * new migration touches it. Exported so tests can build a store on a temp
 * file and compare it with the scripts' schema
 * (tests/r4-ops-schema-parity.test.ts).
 */
export function initSchema(db: Database.Database, opts: { backupDir?: string } = {}): MigrationReport {
  ensureWal(db, BUSY_TIMEOUT_MS)
  db.pragma('foreign_keys = ON')
  const backupDir = opts.backupDir ?? path.join(path.dirname(db.name), 'backups', 'pre-migration')
  const report = withBusyRetry(
    () =>
      runMigrations(db, CONTENT_MIGRATIONS, {
        label: 'content',
        busyTimeoutMs: BUSY_TIMEOUT_MS,
        beforeMigrate: ({ from }) => {
          const copy = backupBeforeMigration(db, { dir: backupDir, label: 'content', from })
          if (copy) log.info('content.db copied before migrating', { file: copy, from })
        },
      }),
    BUSY_TIMEOUT_MS,
  )
  logMigrationReport(report)
  return report
}

/** Close the shared connection (every runtime in this process sees the reset). */
export function closeDb() {
  const db = dbGlobal.__contentDb
  dbGlobal.__contentDb = null
  if (db && db.open) db.close()
}

/** Drop the shared connection and open a fresh one — e.g. after the file was swapped. */
export function reopenDb(): Database.Database {
  closeDb()
  return getDb()
}
