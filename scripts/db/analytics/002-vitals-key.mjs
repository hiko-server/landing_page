import { hasColumn } from '../migrate.mjs'

/**
 * analytics.db v2 — one row per Web Vitals measurement: `vitals.vkey` (a
 * hash of route, metric and the browser's random instance id) with a unique
 * index, so a re-reported CLS / INP replaces its value. Stores created before
 * the column existed get it here; NULL keys never conflict in a SQLite
 * UNIQUE index, so old rows stay as they are.
 */

/** @type {import('../migrate.mjs').Migration} */
const migration = {
  version: 2,
  name: 'vitals-key',
  up(db) {
    if (!hasColumn(db, 'vitals', 'vkey')) db.exec('ALTER TABLE vitals ADD COLUMN vkey TEXT')
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_vitals_key ON vitals (vkey)')
  },
}

export default migration
