/**
 * analytics.db v6 — goal events (H9, lib/analytics/events.ts).
 *
 *   events             raw events, kept 35 days: time, UTC day, an
 *                      allow-listed name, at most one bounded allow-listed
 *                      property (`prop`, '' when the event has none) and
 *                      the same daily-salted visitor hash as page views. No
 *                      IP address, user agent, full URL, query string or
 *                      free text — except the normalised search text of
 *                      `search_empty` (≤ 40 characters, never with an '@'
 *                      or six digits).
 *   events_daily       per UTC day × name: events, unique visitors
 *   event_props_daily  per UTC day × name × prop: events, unique visitors
 *                      (a visitor with two different props on one day
 *                      counts once in events_daily, once per prop here).
 *                      Both are rolled up from the raw rows once a UTC day
 *                      is over and kept 400 days — `search_empty` rows,
 *                      raw and rolled up, 35 days.
 *   meta               `events_since` = the UTC day goal tracking began
 *                      (the admin compares periods only from then on) and
 *                      `events_rolled_through` = the last rolled-up day.
 *
 * The allow-list lives in code (lib/analytics/eventsShared.ts), not in a
 * CHECK constraint, so a later release can add a name without rebuilding
 * the table (expand-only migrations, scripts/db/migrate.mjs).
 */

/** @type {import('../migrate.mjs').Migration} */
const migration = {
  version: 6,
  name: 'events',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        ts      INTEGER NOT NULL,
        day     TEXT NOT NULL,
        name    TEXT NOT NULL,
        prop    TEXT NOT NULL DEFAULT '',
        visitor TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_day_name ON events (day, name, prop);
      CREATE INDEX IF NOT EXISTS idx_events_day_visitor ON events (day, visitor);

      CREATE TABLE IF NOT EXISTS events_daily (
        day      TEXT NOT NULL,
        name     TEXT NOT NULL,
        events   INTEGER NOT NULL,
        visitors INTEGER NOT NULL,
        PRIMARY KEY (day, name)
      );

      CREATE TABLE IF NOT EXISTS event_props_daily (
        day      TEXT NOT NULL,
        name     TEXT NOT NULL,
        prop     TEXT NOT NULL,
        events   INTEGER NOT NULL,
        visitors INTEGER NOT NULL,
        PRIMARY KEY (day, name, prop)
      );

      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT OR IGNORE INTO meta (key, value) VALUES ('events_since', date('now'));
    `)
  },
}

export default migration
