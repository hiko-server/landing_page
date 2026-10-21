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

// ── Tokens from before sessions existed ───────────────────────────────────
//
// Admin tokens minted before auth.db existed carry no session id (`sid`), so
// no session row can be revoked for them (wave 2A review, SECU-3). The first
// time the owner signs any browser out — Log out, a single browser, "Sign out
// other browsers" — `legacy_cutoff` is set, and from then on lib/auth refuses
// every token without a `sid` issued at or before it. The owner's own
// browser is never affected: those actions need a session row (and so a
// token with a `sid`). Nothing mints a token without a `sid` any more.

const LEGACY_CUTOFF = 'legacy_cutoff'

/** When tokens without a session id stopped being accepted (ms), or null while they still are. */
export function legacyCutoff(): number | null {
  const v = Number(getSetting(LEGACY_CUTOFF))
  return Number.isFinite(v) && v > 0 ? v : null
}

/** Refuse every token without a session id issued until now (the cutoff only moves forward). */
export function endLegacyTokens(now = Date.now()): void {
  setSetting(LEGACY_CUTOFF, String(Math.max(now, legacyCutoff() ?? 0)), now)
}

/** True when a token without a session id, issued at `iat` (seconds), must be refused. */
export function isLegacyTokenEnded(iat: unknown): boolean {
  const cutoff = legacyCutoff()
  if (cutoff === null) return false
  return typeof iat !== 'number' || !Number.isFinite(iat) || iat * 1000 <= cutoff
}

/**
 * Could a token without a session id still be valid? Only while no cutoff is
 * set and within one session lifetime (`ttlMs`) of auth.db's creation: every
 * such token was minted before that moment.
 */
export function legacyTokensMayBeValid(ttlMs: number, now = Date.now()): boolean {
  if (legacyCutoff() !== null) return false
  const row = getAuthDb()
    .prepare('SELECT applied_at FROM schema_version WHERE version = 1')
    .get() as { applied_at: number } | undefined
  return !row || now < Number(row.applied_at) + ttlMs
}

// ── History ───────────────────────────────────────────────────────────────
//
// Two classes, kept apart so anonymous traffic can never erase the record
// that matters (wave 2A review, SECU-2):
//   - auth_events: sign-ins and security changes. Only someone who signed
//     in (or proved control of the mailbox) can add one, so the newest
//     AUTH_EVENT_KEEP of the last AUTH_EVENT_DAYS days are all kept.
//   - auth_failures: failed sign-ins and failed identity checks, which
//     anyone can cause. Counted per clock hour, kind, method, country and
//     reason code (no address, no device), at most AUTH_FAILURE_ROWS rows
//     for AUTH_EVENT_DAYS days; the Security page shows a summary.

export const AUTH_EVENT_KEEP = 500
export const AUTH_EVENT_DAYS = 180
/** Hour buckets of failure counts kept at most (oldest go first). */
export const AUTH_FAILURE_ROWS = 5000

export const FAILURE_EVENT_TYPES = [
  'signin-failed',
  'step-up-failed',
  'password-change-failed',
] as const
export type AuthFailureType = (typeof FAILURE_EVENT_TYPES)[number]

export function isFailureEvent(type: string): type is AuthFailureType {
  return (FAILURE_EVENT_TYPES as readonly string[]).includes(type)
}

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

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
  | 'password-changed'
  | 'password-change-failed'

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

/**
 * Record one history entry. A failure (FAILURE_EVENT_TYPES) only adds one to
 * its hour's count in auth_failures — its session and network prefix are not
 * kept — so it can never push a sign-in or security change out of
 * auth_events.
 */
export function recordAuthEvent(e: AuthEventInput, now = Date.now()): void {
  if (isFailureEvent(e.type)) {
    recordAuthFailure(e.type, e, now)
    return
  }
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
  ).run(now - AUTH_EVENT_DAYS * DAY_MS, AUTH_EVENT_KEEP)
}

function recordAuthFailure(type: AuthFailureType, e: AuthEventInput, now: number): void {
  const db = getAuthDb()
  db.prepare(
    `INSERT INTO auth_failures (hour, type, method, country, reason, count, last_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT (hour, type, method, country, reason)
       DO UPDATE SET count = count + 1, last_at = max(last_at, excluded.last_at)`
  ).run(
    now - (now % HOUR_MS),
    type,
    e.method ?? '',
    e.country ?? '',
    e.detail ? e.detail.slice(0, 40) : '',
    now
  )
  db.prepare('DELETE FROM auth_failures WHERE hour < ?').run(now - AUTH_EVENT_DAYS * DAY_MS)
  const rows = (db.prepare('SELECT count(*) AS n FROM auth_failures').get() as { n: number }).n
  if (rows > AUTH_FAILURE_ROWS) {
    db.prepare(
      `DELETE FROM auth_failures WHERE rowid NOT IN
         (SELECT rowid FROM auth_failures ORDER BY hour DESC, last_at DESC LIMIT ?)`
    ).run(AUTH_FAILURE_ROWS)
  }
}

export type AuthFailureSummary = {
  /** Failed attempts in the last 24 hours, 7 days and 30 days (counted by clock hour). */
  last24h: number
  last7d: number
  last30d: number
  /** The newest failed attempt within the 30 days, or null. */
  lastAt: number | null
  /** The 30 days by kind and method, most first. */
  byMethod: Array<{ type: AuthFailureType; method: AuthMethod | null; count: number }>
  /** The 30 days by Cloudflare country (null = unknown), most first, at most five. */
  byCountry: Array<{ country: string | null; count: number }>
}

/** Failed sign-ins and identity checks of the last 30 days, summed (Admin → Security). */
export function authFailureSummary(now = Date.now()): AuthFailureSummary {
  const rows = getAuthDb()
    .prepare(
      'SELECT hour, type, method, country, count, last_at FROM auth_failures WHERE hour >= ?'
    )
    .all(now - (now % HOUR_MS) - 30 * DAY_MS) as Array<{
    hour: number
    type: AuthFailureType
    method: string
    country: string
    count: number
    last_at: number
  }>
  const since = (ms: number) => now - (now % HOUR_MS) - ms
  const sum = (from: number) => rows.reduce((n, r) => (r.hour >= from ? n + Number(r.count) : n), 0)
  const methods = new Map<string, AuthFailureSummary['byMethod'][number]>()
  const countries = new Map<string, number>()
  let lastAt: number | null = null
  for (const r of rows) {
    const key = `${r.type}|${r.method}`
    const m = methods.get(key) ?? {
      type: r.type,
      method: (r.method || null) as AuthMethod | null,
      count: 0,
    }
    m.count += Number(r.count)
    methods.set(key, m)
    countries.set(r.country, (countries.get(r.country) ?? 0) + Number(r.count))
    if (lastAt === null || r.last_at > lastAt) lastAt = r.last_at
  }
  return {
    last24h: sum(since(DAY_MS)),
    last7d: sum(since(7 * DAY_MS)),
    last30d: sum(since(30 * DAY_MS)),
    lastAt,
    byMethod: Array.from(methods.values()).sort((a, b) => b.count - a.count),
    byCountry: Array.from(countries, ([country, count]) => ({ country: country || null, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  }
}

/** The newest sign-ins and security changes (never failures — see authFailureSummary). */
export function listAuthEvents(limit = 50): AuthEvent[] {
  const rows = getAuthDb()
    .prepare(
      `SELECT * FROM auth_events WHERE type NOT IN (${FAILURE_EVENT_TYPES.map(() => '?').join(', ')})
       ORDER BY at DESC, id DESC LIMIT ?`
    )
    .all(...FAILURE_EVENT_TYPES, Math.max(1, Math.min(AUTH_EVENT_KEEP, limit))) as Array<{
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
