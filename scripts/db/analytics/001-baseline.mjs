/**
 * analytics.db v1 — the first-party analytics schema as it stood before
 * versioned migrations (lib/analytics/db.ts). CREATE … IF NOT EXISTS, so an
 * existing store is unchanged.
 *
 *   hits       raw page views (35 days)
 *   vitals     raw Core Web Vitals samples (30 days)
 *   daily, refs_daily, dims_daily   roll-ups (400 days)
 *   meta       key/value bookkeeping
 */

/** @type {import('../migrate.mjs').Migration} */
const migration = {
  version: 1,
  name: 'baseline',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS hits (
        ts       INTEGER NOT NULL,
        day      TEXT NOT NULL,
        path     TEXT NOT NULL,
        ref_host TEXT,
        country  TEXT,
        device   TEXT,
        browser  TEXT,
        visitor  TEXT NOT NULL,
        lang     TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_hits_day_path ON hits (day, path);
      CREATE INDEX IF NOT EXISTS idx_hits_ts ON hits (ts);

      CREATE TABLE IF NOT EXISTS daily (
        day      TEXT NOT NULL,
        path     TEXT NOT NULL,
        views    INTEGER NOT NULL,
        visitors INTEGER NOT NULL,
        PRIMARY KEY (day, path)
      );

      CREATE TABLE IF NOT EXISTS refs_daily (
        day      TEXT NOT NULL,
        ref_host TEXT NOT NULL,
        visitors INTEGER NOT NULL,
        PRIMARY KEY (day, ref_host)
      );

      CREATE TABLE IF NOT EXISTS dims_daily (
        day      TEXT NOT NULL,
        kind     TEXT NOT NULL CHECK (kind IN ('site', 'country', 'device', 'browser')),
        value    TEXT NOT NULL,
        views    INTEGER NOT NULL,
        visitors INTEGER NOT NULL,
        PRIMARY KEY (day, kind, value)
      );

      CREATE TABLE IF NOT EXISTS vitals (
        ts     INTEGER NOT NULL,
        day    TEXT NOT NULL,
        route  TEXT NOT NULL,
        name   TEXT NOT NULL,
        value  REAL NOT NULL,
        rating TEXT NOT NULL,
        device TEXT,
        nav    TEXT,
        vkey   TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_vitals_day ON vitals (day, route, name);

      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)
  },
}

export default migration
