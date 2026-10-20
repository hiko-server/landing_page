import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { ensureWal, runMigrations, type MigrationReport } from '../../scripts/db/migrate.mjs'
import { ANALYTICS_MIGRATIONS } from '../../scripts/db/analytics/index.mjs'
import { logMigrationReport } from '../dbMigrations'

/**
 * First-party telemetry store: data/analytics.db, a SQLite file of its own.
 * It is deliberately NOT part of content.db, so it is never in the R2 sync,
 * snapshots or restores (lib/backup.ts only packs content.db, uploads,
 * version history and the inbox).
 *
 * Schema (versioned migrations in scripts/db/analytics/, run on open):
 *   hits       raw page views, kept 35 days. No IP, no user agent: `visitor`
 *              is a 16-hex hash of a daily-rotating salt held only in memory
 *              (lib/analytics/ingest), so it cannot be linked across days.
 *   vitals     raw Core Web Vitals samples, kept 30 days; one row per
 *              measurement (`vkey`: a hash of route, metric and the browser's
 *              random web-vitals instance id — a re-reported CLS / INP
 *              replaces its value; NULL for events sent without an id).
 *   daily      per day × path: views, unique visitors     ┐ rolled up from the
 *   refs_daily per day × referrer host: unique visitors   │ raw rows once a UTC
 *   dims_daily per day × (site | country | device |       │ day is over; kept
 *              browser) value: views, unique visitors     ┘ 400 days
 *   events     raw goal events, kept 35 days (lib/analytics/events): an
 *              allow-listed name, at most one bounded property, the same
 *              daily visitor hash as `hits`
 *   events_daily, event_props_daily   per day × name (× property): events,
 *              unique visitors; kept 400 days — search_empty 35 days, raw
 *              and rolled up
 *   meta       key/value bookkeeping (rolled_through = last rolled-up day;
 *              events_rolled_through, events_since for the goal events)
 *   errors, error_daily   first-party error monitoring (lib/errors)
 *   restore_drills        restore drill results (lib/restoreDrill)
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

/**
 * Bring an open analytics store to the newest migration
 * (scripts/db/analytics). Exported for tests.
 */
export function migrateAnalyticsDb(db: Database.Database): MigrationReport {
  const report = runMigrations(db, ANALYTICS_MIGRATIONS, { label: 'analytics' })
  logMigrationReport(report)
  return report
}

export function getAnalyticsDb(): Database.Database {
  const cached = g.__analyticsDb
  if (cached && cached.open) return cached
  const file = analyticsDbPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new Database(file, { timeout: 5000 })
  try {
    ensureWal(db, 5000)
    db.pragma('synchronous = NORMAL')
    migrateAnalyticsDb(db)
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
