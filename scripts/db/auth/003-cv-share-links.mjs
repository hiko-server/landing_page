/**
 * auth.db v3 — private share links for CV variants (E4).
 *
 *   cv_share_links  id               public handle of a link in the admin
 *                                    ('l' + random); never the token
 *                   token_hash       SHA-256 (hex) of the link's token — the
 *                                    token itself is shown to the owner once
 *                                    and never stored (lib/cvShare/token)
 *                   variant_id       the CV variant it opens (kv `cvvariants`)
 *                   lang             'en' | 'zh': the language it opens in
 *                   note             the owner's own label ("Acme — ML role");
 *                                    admin only, never shown to the visitor
 *                   created_at, expires_at (ms)
 *                   revoked_at       ms, NULL while not revoked
 *                   open_count       counted opens (a rendered page that
 *                                    reported itself, lib/cvShare/store)
 *                   last_opened_day  'YYYY-MM-DD' (UTC) of the last counted
 *                                    open — no time, address or device
 *
 * In auth.db, not content.db, for the same reason as sessions: auth.db is
 * never packed into a content snapshot, mirrored to R2 or replaced by a
 * restore, so restoring an older backup can never bring a revoked or
 * removed link back to life. Expand-only: a new table.
 */

/** @type {import('../migrate.mjs').Migration} */
const migration = {
  version: 3,
  name: 'cv-share-links',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cv_share_links (
        id              TEXT PRIMARY KEY,
        token_hash      TEXT NOT NULL UNIQUE,
        variant_id      TEXT NOT NULL,
        lang            TEXT NOT NULL CHECK (lang IN ('en', 'zh')),
        note            TEXT NOT NULL DEFAULT '',
        created_at      INTEGER NOT NULL,
        expires_at      INTEGER NOT NULL,
        revoked_at      INTEGER,
        open_count      INTEGER NOT NULL DEFAULT 0,
        last_opened_day TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_cv_share_links_variant ON cv_share_links (variant_id);
      CREATE INDEX IF NOT EXISTS idx_cv_share_links_created ON cv_share_links (created_at DESC);
    `)
  },
}

export default migration
