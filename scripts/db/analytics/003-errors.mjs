/**
 * analytics.db v3 — first-party error monitoring (lib/errors/*).
 *
 *   errors       one row per fingerprint (a hash of where and what failed):
 *                scrubbed message and stack, last path, counts, first/last
 *                seen, first/last release, coarse browser families, triage
 *                status. No IP address, user agent, query string, cookie or
 *                request body is ever stored.
 *   error_daily  events per fingerprint per UTC day (trend lines), kept 30
 *                days.
 */

/** @type {import('../migrate.mjs').Migration} */
const migration = {
  version: 3,
  name: 'errors',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS errors (
        fingerprint   TEXT PRIMARY KEY,
        source        TEXT NOT NULL CHECK (source IN ('client', 'server', 'csp')),
        kind          TEXT NOT NULL,
        name          TEXT,
        message       TEXT NOT NULL,
        stack         TEXT,
        path          TEXT,
        route         TEXT,
        count         INTEGER NOT NULL DEFAULT 0,
        first_seen    INTEGER NOT NULL,
        last_seen     INTEGER NOT NULL,
        first_release TEXT,
        last_release  TEXT,
        browsers      TEXT NOT NULL DEFAULT '{}',
        status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
        resolved_at   INTEGER,
        regressed_at  INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_errors_last_seen ON errors (last_seen DESC);
      CREATE INDEX IF NOT EXISTS idx_errors_status ON errors (status, last_seen DESC);

      CREATE TABLE IF NOT EXISTS error_daily (
        day         TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        count       INTEGER NOT NULL,
        PRIMARY KEY (day, fingerprint)
      );
    `)
  },
}

export default migration
