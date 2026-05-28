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
 * (used by scripts/migrate-files-to-db.ts on first boot).
 *
 * Schema:
 *   pages            (name PK, frontmatter, body, updated_at)
 *   collection_items (collection, slug, frontmatter, body, updated_at) PK(collection, slug)
 *   kv               (key PK, value, updated_at)
 *
 * `frontmatter` columns hold JSON-encoded objects. `body` is the raw MDX
 * body (no frontmatter wrapper). `kv.value` is an opaque JSON blob.
 */

const DB_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DB_DIR, 'content.db')

let dbInstance: Database.Database | null = null

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })
}

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance
  ensureDir()
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
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

    CREATE INDEX IF NOT EXISTS idx_collection_items_updated
      ON collection_items (collection, updated_at DESC);
  `)
  dbInstance = db
  return db
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}
