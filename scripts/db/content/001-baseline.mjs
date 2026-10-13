/**
 * content.db v1 — the schema every store had before versioned migrations
 * (lib/db.ts and scripts/content-helpers.mjs each created it with
 * CREATE TABLE IF NOT EXISTS). On an existing store this changes nothing and
 * only records version 1.
 *
 *   pages            (name PK, frontmatter, body, updated_at)
 *   collection_items (collection, slug, frontmatter, body, updated_at) PK(collection, slug)
 *   kv               (key PK, value, updated_at)
 *   r2_pending       (key PK, op 'put'|'delete', updated_at)
 */

/** @type {import('../migrate.mjs').Migration} */
const migration = {
  version: 1,
  name: 'baseline',
  up(db) {
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
    `)
  },
}

export default migration
