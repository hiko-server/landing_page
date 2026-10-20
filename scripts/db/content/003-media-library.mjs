/**
 * content.db v3 — the media library (H7).
 *
 *   media_assets (name PK, bytes, width, height, format, animated, local,
 *                 r2, r2_files, added_at, checked_at)
 *     One row per original upload: what the server's disk holds
 *     (public/uploads, refreshed from the files on every listing) and what
 *     the last listing of R2's uploads/ prefix found — `r2` NULL until R2
 *     was listed (or when it is not configured), `r2_files` the asset's
 *     object names there (original and variants). An upload that only R2
 *     holds has `local` = 0. Rebuildable from the files and R2.
 *
 *   media_usage (name, doc, field) PK
 *     The usage index: every place a post, case study (live or unpublished
 *     changes), page, the home document, the CV or another stored document
 *     refers to an upload (a variant reference counts for its original).
 *     Rebuilt in one transaction whenever the content changed
 *     (media_index_state.fingerprint), and re-scanned before a delete or a
 *     replace. Denormalised labels and links for the admin's "Used in" list.
 *
 *   media_trash (name PK, files, bytes, width, height, meta, reason,
 *                replaced_by, r2_pending, deleted_at)
 *     Uploads moved out of public/uploads into data/media-trash/<name>/
 *     (deleted, or replaced by `replaced_by`), restorable for 30 days and
 *     then removed for good. Also the tombstone the file server and the boot
 *     sync (scripts/sync-from-r2.mjs) honour: a trashed name is never served
 *     from R2 or pulled back from it.
 *
 *   media_redirects (from_name PK, to_name, created_at)
 *     A replaced upload's old address answers 308 → the new file (variants
 *     map to the new file's variant of the same width). Kept collapsed:
 *     every row points at the current file.
 *
 *   media_index_state (id = 1, fingerprint, built_at, r2_checked_at)
 *     The content fingerprint the usage index was built from, and when R2
 *     was last listed.
 *
 * The owner's default alt text and captions are content, not an index: they
 * live in the kv row `media-library` (mirrored to R2 like home and the CV).
 *
 * Expand-only (scripts/db/migrate.mjs): new tables only, nothing existing
 * changes, so an older image keeps working on a v3 store.
 */

/** @type {import('../migrate.mjs').Migration} */
const migration = {
  version: 3,
  name: 'media-library',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS media_assets (
        name       TEXT PRIMARY KEY,
        bytes      INTEGER NOT NULL DEFAULT 0,
        width      INTEGER,
        height     INTEGER,
        format     TEXT,
        animated   INTEGER NOT NULL DEFAULT 0,
        local      INTEGER NOT NULL DEFAULT 0,
        r2         INTEGER,
        r2_files   TEXT NOT NULL DEFAULT '[]',
        added_at   INTEGER NOT NULL DEFAULT 0,
        checked_at INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS media_usage (
        name        TEXT NOT NULL,
        doc         TEXT NOT NULL,
        field       TEXT NOT NULL,
        label       TEXT NOT NULL,
        line        INTEGER,
        alt         TEXT,
        count       INTEGER NOT NULL DEFAULT 1,
        doc_kind    TEXT NOT NULL,
        doc_title   TEXT NOT NULL DEFAULT '',
        doc_state   TEXT,
        edit_href   TEXT,
        public_href TEXT,
        PRIMARY KEY (name, doc, field)
      );

      CREATE INDEX IF NOT EXISTS idx_media_usage_doc ON media_usage (doc);

      CREATE TABLE IF NOT EXISTS media_trash (
        name        TEXT PRIMARY KEY,
        files       TEXT NOT NULL DEFAULT '[]',
        bytes       INTEGER NOT NULL DEFAULT 0,
        width       INTEGER,
        height      INTEGER,
        meta        TEXT,
        reason      TEXT NOT NULL DEFAULT 'deleted' CHECK (reason IN ('deleted', 'replaced')),
        replaced_by TEXT,
        r2_pending  INTEGER NOT NULL DEFAULT 0,
        deleted_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS media_redirects (
        from_name  TEXT PRIMARY KEY,
        to_name    TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        CHECK (from_name <> to_name)
      );

      CREATE INDEX IF NOT EXISTS idx_media_redirects_target ON media_redirects (to_name);

      CREATE TABLE IF NOT EXISTS media_index_state (
        id            INTEGER PRIMARY KEY CHECK (id = 1),
        fingerprint   TEXT NOT NULL DEFAULT '',
        built_at      INTEGER NOT NULL DEFAULT 0,
        r2_checked_at INTEGER
      );
    `)
  },
}

export default migration
