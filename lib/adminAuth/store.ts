import crypto from 'crypto'
import { getAuthDb } from './db'

/**
 * auth.db helpers that are not about sessions or passkeys: settings, the
 * sign-in / security history, and one-time recovery codes.
 */

// ── Settings ──────────────────────────────────────────────────────────────

export function getSetting(key: string): string | null {
  const row = getAuthDb().prepare('SELECT value FROM auth_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row ? row.value : null
}

export function setSetting(key: string, value: string, now = Date.now()): void {
  getAuthDb()
    .prepare(
      `INSERT INTO auth_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value, now)
}

/** The WebAuthn user handle for the admin: 32 random bytes, created once. */
export function webauthnUserId(): Uint8Array {
  const existing = getSetting('webauthn_user_id')
  if (existing) return new Uint8Array(Buffer.from(existing, 'base64url'))
  const id = crypto.randomBytes(32)
  getAuthDb()
    .prepare(
      `INSERT OR IGNORE INTO auth_settings (key, value, updated_at) VALUES ('webauthn_user_id', ?, ?)`
    )
    .run(id.toString('base64url'), Date.now())
  return new Uint8Array(Buffer.from(getSetting('webauthn_user_id') as string, 'base64url'))
}

/** "Require a passkey": password sign-in then also needs a recovery code. */
export function isPasskeyRequired(): boolean {
  return getSetting('passkey_required') === '1'
}

export function setPasskeyRequired(on: boolean): void {
  setSetting('passkey_required', on ? '1' : '0')
}

// ── History ───────────────────────────────────────────────────────────────

export const AUTH_EVENT_KEEP = 500
export const AUTH_EVENT_DAYS = 180

export type AuthEventType =
  | 'signin'
  | 'signin-failed'
  | 'step-up'
  | 'step-up-failed'
  | 'signout'
  | 'session-revoked'
  | 'sessions-revoked'
  | 'passkey-added'
  | 'passkey-renamed'
  | 'passkey-removed'
  | 'recovery-codes-generated'
  | 'recovery-code-used'
  | 'policy-changed'
  | 'password-reset'

export type AuthMethod = 'password' | 'passkey' | 'recovery' | 'legacy'

export type AuthEventInput = {
  type: AuthEventType
  method?: AuthMethod | null
  sessionId?: string | null
  device?: string | null
  ipPrefix?: string | null
  country?: string | null
  detail?: string | null
}

// Required<> drops `?` and `undefined` from every field (a hand-written mapped
// type here crashed the lint run: the TS parser and the Next config's
// typescript-eslint plugin disagree on the mapped-type AST).
export type AuthEvent = Required<AuthEventInput> & { id: number; at: number }

export function recordAuthEvent(e: AuthEventInput, now = Date.now()): void {
  const db = getAuthDb()
  db.prepare(
    `INSERT INTO auth_events (at, type, method, session_id, device, ip_prefix, country, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    now,
    e.type,
    e.method ?? null,
    e.sessionId ?? null,
    e.device ?? null,
    e.ipPrefix ?? null,
    e.country ?? null,
    e.detail ? e.detail.slice(0, 200) : null
  )
  db.prepare(
    `DELETE FROM auth_events WHERE at < ? OR id NOT IN (SELECT id FROM auth_events ORDER BY at DESC, id DESC LIMIT ?)`
  ).run(now - AUTH_EVENT_DAYS * 86_400_000, AUTH_EVENT_KEEP)
}

export function listAuthEvents(limit = 50): AuthEvent[] {
  const rows = getAuthDb()
    .prepare('SELECT * FROM auth_events ORDER BY at DESC, id DESC LIMIT ?')
    .all(Math.max(1, Math.min(AUTH_EVENT_KEEP, limit))) as Array<{
    id: number
    at: number
    type: AuthEventType
    method: AuthMethod | null
    session_id: string | null
    device: string | null
    ip_prefix: string | null
    country: string | null
    detail: string | null
  }>
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    type: r.type,
    method: r.method,
    sessionId: r.session_id,
    device: r.device,
    ipPrefix: r.ip_prefix,
    country: r.country,
    detail: r.detail,
  }))
}

// ── Recovery codes ────────────────────────────────────────────────────────

export const RECOVERY_CODE_COUNT = 10
/** Crockford base32 (no I, L, O, U): 16 characters = 80 random bits per code. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** "ABCD-EFGH-JKMN-PQRS" from 10 random bytes. */
export function formatRecoveryCode(bytes: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return out.match(/.{1,4}/g)!.join('-')
}

/**
 * Canonical form of a typed code: upper case, separators and spaces removed,
 * the look-alikes O → 0 and I / L → 1 folded. Null unless 16 base32 chars.
 */
export function normalizeRecoveryCode(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 64) return null
  const s = raw.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
  return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(s) ? s : null
}

export function hashRecoveryCode(normalized: string): string {
  return crypto.createHash('sha256').update(`lucian-dev/recovery-code\n${normalized}`).digest('hex')
}

/** Replace every recovery code with a fresh set; returns the codes (shown once, never stored). */
export function generateRecoveryCodes(now = Date.now()): string[] {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    formatRecoveryCode(crypto.randomBytes(10))
  )
  const db = getAuthDb()
  db.transaction(() => {
    db.prepare('DELETE FROM recovery_codes').run()
    const insert = db.prepare('INSERT INTO recovery_codes (code_hash, created_at) VALUES (?, ?)')
    for (const c of codes) insert.run(hashRecoveryCode(normalizeRecoveryCode(c) as string), now)
  })()
  return codes
}

/** Use a code once. True when it was valid and unused (it is now spent). */
export function consumeRecoveryCode(raw: unknown, now = Date.now()): boolean {
  const normalized = normalizeRecoveryCode(raw)
  if (!normalized) return false
  const res = getAuthDb()
    .prepare('UPDATE recovery_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL')
    .run(now, hashRecoveryCode(normalized))
  return res.changes === 1
}

export type RecoveryStatus = { total: number; remaining: number; generatedAt: number | null }

export function recoveryStatus(): RecoveryStatus {
  const row = getAuthDb()
    .prepare(
      'SELECT count(*) AS total, sum(CASE WHEN used_at IS NULL THEN 1 ELSE 0 END) AS remaining, max(created_at) AS at FROM recovery_codes'
    )
    .get() as { total: number; remaining: number | null; at: number | null }
  return {
    total: Number(row.total) || 0,
    remaining: Number(row.remaining) || 0,
    generatedAt: row.at ?? null,
  }
}
