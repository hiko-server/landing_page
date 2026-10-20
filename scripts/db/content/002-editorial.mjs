/**
 * content.db v2 — editorial tools for posts and case studies.
 *
 *   pending_revisions (collection, slug, frontmatter, body, base_updated_at, updated_at)
 *                     PK(collection, slug)
 *     Unpublished changes to a LIVE item (H4): one row per item at most —
 *     the edits saved on it that are not public yet. The public pages never
 *     read this table (lib/mdx reads collection_items); Draft Mode previews
 *     it and "Publish changes" writes it to collection_items and deletes the
 *     row. `base_updated_at` is the live row's updated_at when the revision
 *     was started, so the editor can tell when the live item changed
 *     underneath it (a restore, a rename, a tag change).
 *
 *   redirects (collection, from_slug, to_slug, created_at) PK(collection, from_slug)
 *     Permanent redirects of renamed items (H6): /<collection>/<from_slug>
 *     answers 308 → /<collection>/<to_slug>. Kept collapsed (every row
 *     points at the item's current slug, never at another old one) by
 *     lib/redirects; read by getStaticProps of pages/blog/[slug] and
 *     pages/work/[slug] (the edge middleware has no file access).
 *
 * Expand-only (scripts/db/migrate.mjs): two new tables, nothing existing
 * changes, so an older image keeps working on a store migrated to v2. Both
 * travel with content.db in every snapshot (lib/backup); they are not
 * mirrored to R2 per key.
 */

/** @type {import('../migrate.mjs').Migration} */
const migration = {
  version: 2,
  name: 'editorial',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pending_revisions (
        collection      TEXT NOT NULL,
        slug            TEXT NOT NULL,
        frontmatter     TEXT NOT NULL DEFAULT '{}',
        body            TEXT NOT NULL DEFAULT '',
        base_updated_at INTEGER NOT NULL DEFAULT 0,
        updated_at      INTEGER NOT NULL,
        PRIMARY KEY (collection, slug)
      );

      CREATE TABLE IF NOT EXISTS redirects (
        collection TEXT NOT NULL CHECK (collection IN ('blog', 'work')),
        from_slug  TEXT NOT NULL,
        to_slug    TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (collection, from_slug),
        CHECK (from_slug <> to_slug)
      );

      CREATE INDEX IF NOT EXISTS idx_redirects_target ON redirects (collection, to_slug);
    `)
  },
}

export default migration
