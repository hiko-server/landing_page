/**
 * audit.db v1 — the admin activity log (lib/audit): one row per admin write
 * that succeeded (who, what, when). "Who" is the signed-in browser — its
 * session id, a coarse device label ("Chrome on macOS"), the network prefix
 * (IPv4 /24, IPv6 /48) and the country — never a full address or user agent.
 * audit_snapshots links an entry to the version-history files the write took
 * first (kind: cv | home | blog | work | page), so the history views can say
 * which change replaced each version.
 */

/** @type {import('../migrate.mjs').Migration} */
const migration = {
  version: 1,
  name: 'baseline',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        ts         INTEGER NOT NULL,
        action     TEXT NOT NULL,
        area       TEXT NOT NULL,
        target     TEXT,
        summary    TEXT NOT NULL,
        method     TEXT NOT NULL,
        route      TEXT NOT NULL,
        status     INTEGER NOT NULL,
        session_id TEXT,
        device     TEXT,
        ip_prefix  TEXT,
        country    TEXT,
        request_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log (ts DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_area_ts ON audit_log (area, ts DESC);
      CREATE TABLE IF NOT EXISTS audit_snapshots (
        audit_id INTEGER NOT NULL REFERENCES audit_log (id) ON DELETE CASCADE,
        kind     TEXT NOT NULL,
        file     TEXT NOT NULL,
        PRIMARY KEY (kind, file)
      );
      CREATE INDEX IF NOT EXISTS idx_audit_snapshots_entry ON audit_snapshots (audit_id);
    `)
  },
}

export default migration
