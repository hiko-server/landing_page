/**
 * auth.db v1 — admin sign-in state (lib/auth/*). A database of its own:
 * never in a content snapshot, the R2 mirror or a restore, so restoring
 * content can never bring back a removed passkey, a used recovery code or a
 * signed-out session. The password itself stays in data/admin.json.
 *
 *   webauthn_credentials  registered passkeys (public key, sign counter,
 *                         transports, backup state, owner's label)
 *   recovery_codes        one-time recovery codes, SHA-256 of the normalised
 *                         code only (each code carries 80 random bits)
 *   auth_sessions         one row per signed-in browser; the session JWT
 *                         carries its id (`sid`). verified_at = last sign-in
 *                         or step-up (recent-verification checks)
 *   auth_events           sign-in history and security changes
 *   webauthn_challenges   single-use WebAuthn challenges (5 minutes)
 *   auth_settings         key/value: WebAuthn user handle, passkey policy
 *
 * Network data is coarse on purpose: an IPv4 /24 or IPv6 /48 prefix and the
 * Cloudflare country, plus a browser · OS label — enough for the owner to
 * recognise a session, never a full address or user agent.
 */

/** @type {import('../migrate.mjs').Migration} */
const migration = {
  version: 1,
  name: 'passkeys-sessions',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS webauthn_credentials (
        id           TEXT PRIMARY KEY,
        public_key   BLOB NOT NULL,
        counter      INTEGER NOT NULL DEFAULT 0,
        transports   TEXT NOT NULL DEFAULT '[]',
        device_type  TEXT NOT NULL,
        backed_up    INTEGER NOT NULL DEFAULT 0,
        aaguid       TEXT,
        name         TEXT NOT NULL,
        created_at   INTEGER NOT NULL,
        last_used_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS recovery_codes (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        code_hash  TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        used_at    INTEGER
      );

      CREATE TABLE IF NOT EXISTS auth_sessions (
        id             TEXT PRIMARY KEY,
        created_at     INTEGER NOT NULL,
        expires_at     INTEGER NOT NULL,
        last_seen_at   INTEGER NOT NULL,
        verified_at    INTEGER NOT NULL,
        method         TEXT NOT NULL,
        credential_id  TEXT,
        device         TEXT,
        ip_prefix      TEXT,
        country        TEXT,
        revoked_at     INTEGER,
        revoked_reason TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions (expires_at);

      CREATE TABLE IF NOT EXISTS auth_events (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        at         INTEGER NOT NULL,
        type       TEXT NOT NULL,
        method     TEXT,
        session_id TEXT,
        device     TEXT,
        ip_prefix  TEXT,
        country    TEXT,
        detail     TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_auth_events_at ON auth_events (at DESC);

      CREATE TABLE IF NOT EXISTS webauthn_challenges (
        challenge  TEXT PRIMARY KEY,
        purpose    TEXT NOT NULL CHECK (purpose IN ('register', 'login', 'step-up')),
        session_id TEXT,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auth_settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
  },
}

export default migration
