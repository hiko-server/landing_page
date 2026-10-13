/**
 * analytics.db v4 — restore drill results (lib/restoreDrill.ts): the latest
 * backup snapshot is opened in a scratch directory and checked (archive and
 * manifest, SQLite integrity, migrations, row counts, an article compile).
 * One row per drill; the newest 52 are kept.
 */

/** @type {import('../migrate.mjs').Migration} */
const migration = {
  version: 4,
  name: 'restore-drills',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS restore_drills (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        ran_at      INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        trigger     TEXT NOT NULL CHECK (trigger IN ('scheduled', 'manual')),
        status      TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'skipped')),
        source      TEXT,
        snapshot    TEXT,
        snapshot_at INTEGER,
        bytes       INTEGER,
        summary     TEXT NOT NULL,
        checks      TEXT NOT NULL DEFAULT '[]'
      );
      CREATE INDEX IF NOT EXISTS idx_restore_drills_ran ON restore_drills (ran_at DESC);
    `)
  },
}

export default migration
