import path from 'path'
import fs from 'fs'
import Database from 'better-sqlite3'

/**
 * Local-first content store.
 *
 * One SQLite file at data/content.db is the canonical source of truth for
 * editorial content. Cloudflare R2 is the off-site replica (see lib/r2.ts).
 * Filesystem snapshots in data/*_snapshots/ remain as audit-only artefacts
 * and the legacy content/*.mdx + data/*.json files act as a one-way seed
 * (used by scripts/migrate-files-to-db.mjs).
 *
 * Schema:
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
 * when the failure was recorded. The same DDL lives in
 * scripts/content-helpers.mjs — keep the two in step (a parity test compares
 * the resulting sqlite_master of both).
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
// idempotent (skip the switch when the file is already WAL) and retried.
const BUSY_TIMEOUT_MS = 10_000

function sleepSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function withBusyRetry<T>(fn: () => T): T {
  const deadline = Date.now() + BUSY_TIMEOUT_MS
  for (let attempt = 0; ; attempt++) {
    try {
      return fn()
    } catch (err) {
      const code = (err as { code?: string }).code
      if ((code !== 'SQLITE_BUSY' && code !== 'SQLITE_LOCKED') || Date.now() > deadline) throw err
      sleepSync(Math.min(200, 20 * 2 ** attempt))
    }
  }
}

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
 * Create the content tables on `db` (idempotent) and switch it to WAL.
 * Exported so tests can build a store on a temp file and compare it with the
 * plain-Node scripts' schema (tests/r4-ops-schema-parity.test.ts).
 */
export function initSchema(db: Database.Database): void {
  withBusyRetry(() => {
    const mode = String(db.pragma('journal_mode', { simple: true })).toLowerCase()
    if (mode !== 'wal') db.pragma('journal_mode = WAL')
  })
  db.pragma('foreign_keys = ON')
  withBusyRetry(() =>
    db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      name        TEXT PRIMARY KEY,
      frontmatter TEXT NOT NULL DEFAULT '{}',
      body        TEXT NOT NULL DEFAULT '',
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collection_items (
      collection  TEXT NOT NULL,
      slug        TEXT NOT NULL,
      frontmatter TEXT NOT NULL DEFAULT '{}',
      body        TEXT NOT NULL DEFAULT '',
      updated_at  INTEGER NOT NULL,
      PRIMARY KEY (collection, slug)
    );

    CREATE TABLE IF NOT EXISTS kv (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS r2_pending (
      key        TEXT PRIMARY KEY,
      op         TEXT NOT NULL CHECK (op IN ('put', 'delete')),
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_collection_items_updated
      ON collection_items (collection, updated_at DESC);
  `),
  )
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
