/**
 * auth.db v3 — review links (H5): private, expiring, revocable links that
 * show one draft (or a live item's unpublished changes) read-only to anyone
 * who has the link (lib/review).
 *
 * In auth.db, not content.db, for the same reason as sessions and recovery
 * codes: this store is never in a content snapshot, the R2 mirror or a
 * restore, so restoring content can never bring a revoked link back.
 *
 *   review_links  id              random 128-bit id (base64url) — the token's first half
 *                 token_hash      SHA-256 (hex) of the whole token; the token itself is
 *                                 never stored (its second half is an HMAC of the row's
 *                                 scope under a key derived from JWT_SECRET)
 *                 collection      'blog' | 'work'
 *                 slug            the item's slug when the link was made (a rename is
 *                                 followed through the item's redirect)
 *                 variant         'draft' (the draft itself) | 'changes' (a live item's
 *                                 pending revision)
 *                 label           the owner's note ("for the thesis committee"), optional
 *                 created_at, expires_at, revoked_at   ms since the epoch
 *                 view_count, last_viewed_at           how often the link was opened —
 *                                 a count and a time, nothing about who opened it
 */

/** @type {import('../migrate.mjs').Migration} */
const migration = {
  version: 3,
  name: 'review-links',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS review_links (
        id             TEXT PRIMARY KEY,
        token_hash     TEXT NOT NULL UNIQUE,
        collection     TEXT NOT NULL CHECK (collection IN ('blog', 'work')),
        slug           TEXT NOT NULL,
        variant        TEXT NOT NULL CHECK (variant IN ('draft', 'changes')),
        label          TEXT,
        created_at     INTEGER NOT NULL,
        expires_at     INTEGER NOT NULL,
        revoked_at     INTEGER,
        view_count     INTEGER NOT NULL DEFAULT 0,
        last_viewed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_review_links_item ON review_links (collection, slug);
      CREATE INDEX IF NOT EXISTS idx_review_links_expires ON review_links (expires_at);
    `)
  },
}

export default migration
