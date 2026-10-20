/**
 * auth.db v2 — failed attempts are counted, not listed (wave 2A review,
 * SECU-2).
 *
 * Anyone can fail a sign-in, so failures used to be rows of auth_events,
 * where a flood of them pushed real sign-ins and security changes out of
 * the 500-row history. They now go to a table of their own, one row per
 * clock hour, kind, method, country and reason code with a count, which can
 * never evict anything from auth_events (lib/adminAuth/store.ts):
 *
 *   auth_failures  hour     start of the clock hour (ms since the epoch)
 *                  type     'signin-failed' | 'step-up-failed'
 *                  method   'password' | 'passkey' | 'recovery' | '' (unknown)
 *                  country  ISO 3166-1 alpha-2 from Cloudflare, '' when unknown
 *                  reason   a short code ('challenge', 'unknown_credential', …) or ''
 *                  count    attempts in that bucket
 *                  last_at  the newest attempt in it (ms)
 *
 * Empty strings instead of NULL keep the primary key unique (SQLite treats
 * NULLs as distinct). Failures already in the history move here.
 */

/** @type {import('../migrate.mjs').Migration} */
const migration = {
  version: 2,
  name: 'failure-counts',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS auth_failures (
        hour    INTEGER NOT NULL,
        type    TEXT NOT NULL,
        method  TEXT NOT NULL DEFAULT '',
        country TEXT NOT NULL DEFAULT '',
        reason  TEXT NOT NULL DEFAULT '',
        count   INTEGER NOT NULL,
        last_at INTEGER NOT NULL,
        PRIMARY KEY (hour, type, method, country, reason)
      );
      CREATE INDEX IF NOT EXISTS idx_auth_failures_last ON auth_failures (last_at DESC);

      INSERT INTO auth_failures (hour, type, method, country, reason, count, last_at)
        SELECT (at / 3600000) * 3600000, type, coalesce(method, ''), coalesce(country, ''),
               substr(coalesce(detail, ''), 1, 40), count(*), max(at)
        FROM auth_events
        WHERE type IN ('signin-failed', 'step-up-failed')
        GROUP BY 1, 2, 3, 4, 5
        ON CONFLICT (hour, type, method, country, reason)
          DO UPDATE SET count = count + excluded.count, last_at = max(last_at, excluded.last_at);
      DELETE FROM auth_events WHERE type IN ('signin-failed', 'step-up-failed');
    `)
  },
}

export default migration
