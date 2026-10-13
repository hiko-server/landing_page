import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

/**
 * First-party analytics store: data/analytics.db, a SQLite file of its own.
 * It is deliberately NOT part of content.db, so it is never in the R2 sync,
 * snapshots or restores (lib/backup.ts only packs content.db, uploads,
 * version history and the inbox).
 *
 * Schema:
 *   hits       raw page views, kept 35 days. No IP, no user agent: `visitor`
 *              is a 16-hex hash of a daily-rotating salt held only in memory
 *              (lib/analytics/ingest), so it cannot be linked across days.
 *   vitals     raw Core Web Vitals samples, kept 30 days.
 *   daily      per day × path: views, unique visitors     ┐ rolled up from the
 *   refs_daily per day × referrer host: unique visitors   │ raw rows once a UTC
 *   dims_daily per day × (site | country | device |       │ day is over; kept
 *              browser) value: views, unique visitors     ┘ 400 days
 *   meta       key/value bookkeeping (rolled_through = last rolled-up day)
 *
 * The connection lives on globalThis like lib/db.ts (one per process across
 * Next's webpack runtimes). The path is resolved when the store is first
 * opened.
 */

export function analyticsDbPath(): string {
  return path.join(process.cwd(), 'data', 'analytics.db')
}

type AnalyticsGlobal = typeof globalThis & { __analyticsDb?: Database.Database | null }
const g = globalThis as AnalyticsGlobal

const SCHEMA = `
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
    nav    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_vitals_day ON vitals (day, route, name);

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`

export function getAnalyticsDb(): Database.Database {
  const cached = g.__analyticsDb
  if (cached && cached.open) return cached
  const file = analyticsDbPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new Database(file, { timeout: 5000 })
  try {
    if (String(db.pragma('journal_mode', { simple: true })).toLowerCase() !== 'wal') db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.exec(SCHEMA)
  } catch (err) {
    db.close()
    throw err
  }
  g.__analyticsDb = db
  return db
}

export function closeAnalyticsDb() {
  const db = g.__analyticsDb
  g.__analyticsDb = null
  if (db && db.open) db.close()
}
