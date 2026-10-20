import { hasColumn } from '../migrate.mjs'

/**
 * analytics.db v5 — Web Vitals attribution (G6): `vitals.attr`, a nullable
 * JSON object per LCP / INP / CLS measurement — the element (a selector of
 * the site's own markup: tag, id, class names, ≤ 120 characters) and the
 * phase timings that made up the value (lib/analytics/attribution.ts). No
 * visitor data. Rows stored before this version, and FCP / TTFB, keep NULL.
 */

/** @type {import('../migrate.mjs').Migration} */
const migration = {
  version: 5,
  name: 'vitals-attribution',
  up(db) {
    if (!hasColumn(db, 'vitals', 'attr')) db.exec('ALTER TABLE vitals ADD COLUMN attr TEXT')
  },
}

export default migration
