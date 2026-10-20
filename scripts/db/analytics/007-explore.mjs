/**
 * analytics.db v7 — Analytics explore (H10, lib/analytics/explore.ts).
 *
 *   idx_hits_day_visitor  hits (day, visitor, ts): a filtered report selects
 *                         visitor-days (a referrer filter keeps every page
 *                         view of the visitor-days that arrived from that
 *                         site), conversion paths read one visitor-day's
 *                         page views in order, and an outbound click is put
 *                         on the page viewed last before it — all lookups by
 *                         day and visitor hash, in time order.
 *   idx_hits_day_ref      hits (day, ref_host, visitor): the referrer filter
 *                         and the referrers of a filtered report.
 *   langs_daily           per UTC day × page language: views, unique
 *                         visitors — the language card for periods older
 *                         than the raw window. Rolled up with the other
 *                         daily tables (lib/analytics/ingest rollup), kept
 *                         400 days. Days already rolled up are filled from
 *                         the raw page views still kept (35 days); `meta`
 *                         `langs_since` is the first day it covers.
 *
 * Nothing new is stored about visitors: the page language is already a
 * column of every page view, and the new table holds daily totals only.
 * Expand-only (scripts/db/migrate.mjs): an older image ignores the table and
 * the indexes.
 */

/** @type {import('../migrate.mjs').Migration} */
const migration = {
  version: 7,
  name: 'explore',
  up(db) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_hits_day_visitor ON hits (day, visitor, ts);
      CREATE INDEX IF NOT EXISTS idx_hits_day_ref ON hits (day, ref_host, visitor);

      CREATE TABLE IF NOT EXISTS langs_daily (
        day      TEXT NOT NULL,
        lang     TEXT NOT NULL,
        views    INTEGER NOT NULL,
        visitors INTEGER NOT NULL,
        PRIMARY KEY (day, lang)
      );

      INSERT OR IGNORE INTO langs_daily (day, lang, views, visitors)
        SELECT day, lang, count(*), count(DISTINCT visitor) FROM hits
        WHERE lang IS NOT NULL
          AND day <= coalesce((SELECT value FROM meta WHERE key = 'rolled_through'), '')
        GROUP BY day, lang;

      INSERT OR IGNORE INTO meta (key, value)
        VALUES ('langs_since', coalesce((SELECT min(day) FROM hits), date('now')));
    `)
  },
}

export default migration
