import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

/**
 * Local admin record + credential helpers.
 *
 * Stored at data/admin.json (gitignored). One admin per site — this is a
 * personal portfolio, not a multi-tenant SaaS.
 *
 * Hashing: scrypt with random 16-byte salt, 64-byte key (N=16384, r=8,
 * p=1 — Node defaults). Constant-time comparison via crypto.timingSafeEqual.
 *
 * Brute-force defence, layered on top of the per-IP rate limiter
 * (lib/rateLimit.ts):
 *   - per (account, client IP): 10 wrong passwords in a rolling 15 min
 *     window lock THAT client out for 15 min — so a stranger hammering the
 *     login can no longer lock the real admin out from elsewhere;
 *   - global circuit breaker: 100 wrong passwords across all IPs in the
 *     window (a distributed attack) lock the account for 15 min.
 * Only attempts against the real admin email count. A correct login clears
 * all counters. Client IPs are stored as short SHA-256 digests.
 *
 * Reset tokens: 24 random bytes, 30 min TTL, single-use, pruned on every
 * read. Token comparison is constant-time to avoid leaking via timing.
 */

const adminPath = path.join(process.cwd(), 'data', 'admin.json')

type ResetToken = { token: string; expires: number }
type FailedLogin = { at: number; ip?: string }

export type AdminData = {
  email: string
  passwordHash: string
  salt: string
  resets?: ResetToken[]
  failedLogins?: FailedLogin[]
  /** ms-epoch; while in the future, ALL logins are rejected (global breaker). */
  lockoutUntil?: number
  /** Per-client lockouts: ipDigest → ms-epoch. */
  ipLockouts?: Record<string, number>
}

/** Emails compare case-insensitively and without surrounding whitespace. */
export function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

function ipDigest(ip: string): string {
  return crypto.createHash('sha256').update(`admin-lockout:${ip}`).digest('hex').slice(0, 16)
}

// ── Hashing ────────────────────────────────────────────────────────────

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex')
}

/** Constant-time hex string compare — defends against timing oracles. */
function timingSafeEqualHex(a: string, b: string): boolean {
  // Always materialise both buffers to the SAME length so the timingSafeEqual
  // call itself is constant-time. A length mismatch is folded into the
  // return value via an OR so we don't early-return on it.
  const lenMismatch = a.length !== b.length
  const safeA = Buffer.from(a, 'hex')
  const safeB = Buffer.from(lenMismatch ? a.replace(/./g, '0') : b, 'hex')
  if (safeA.length !== safeB.length) return false
  return !lenMismatch && crypto.timingSafeEqual(safeA, safeB)
}

// ── Read / write ───────────────────────────────────────────────────────

export function readAdmin(): AdminData | null {
  try {
    const raw = fs.readFileSync(adminPath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeAdmin(data: AdminData) {
  fs.mkdirSync(path.dirname(adminPath), { recursive: true })
  fs.writeFileSync(adminPath, JSON.stringify(data, null, 2), 'utf-8')
}

export function ensureAdminFromEnv(): AdminData | null {
  const current = readAdmin()
  if (current) return current
  const email = normalizeEmail(process.env.ADMIN_EMAIL || process.env.ADMIN_USER)
  const pass = process.env.ADMIN_PASS
  if (!email || !pass) return null
  const salt = crypto.randomBytes(16).toString('hex')
  const data: AdminData = {
    email,
    passwordHash: hashPassword(pass, salt),
    salt,
    resets: [],
    failedLogins: [],
  }
  writeAdmin(data)
  return data
}

// ── Lockout policy ─────────────────────────────────────────────────────

const FAILED_WINDOW_MS = 15 * 60 * 1000 // 15 min rolling window
const PER_IP_THRESHOLD = 10
const GLOBAL_THRESHOLD = 100
const LOCKOUT_DURATION_MS = 15 * 60 * 1000

export function getLockoutInfo(
  data: AdminData | null = readAdmin(),
  ip = 'unknown',
): {
  locked: boolean
  retryAfterMs: number
} {
  if (!data) return { locked: false, retryAfterMs: 0 }
  const now = Date.now()
  const until = Math.max(data.lockoutUntil || 0, data.ipLockouts?.[ipDigest(ip)] || 0)
  return until > now ? { locked: true, retryAfterMs: until - now } : { locked: false, retryAfterMs: 0 }
}

function pruneFailedLogins(list: FailedLogin[] | undefined, now: number): FailedLogin[] {
  if (!Array.isArray(list)) return []
  return list.filter((f) => now - f.at < FAILED_WINDOW_MS)
}

function recordFailedAttempt(data: AdminData, ip: string): { locked: boolean; retryAfterMs: number } {
  const now = Date.now()
  const key = ipDigest(ip)
  const recent = pruneFailedLogins(data.failedLogins, now).slice(-GLOBAL_THRESHOLD * 2)
  recent.push({ at: now, ip: key })
  const ipLockouts: Record<string, number> = {}
  for (const [k, until] of Object.entries(data.ipLockouts || {})) if (until > now) ipLockouts[k] = until
  let lockoutUntil = data.lockoutUntil && data.lockoutUntil > now ? data.lockoutUntil : undefined

  if (recent.filter((f) => f.ip === key).length >= PER_IP_THRESHOLD) ipLockouts[key] = now + LOCKOUT_DURATION_MS
  if (recent.length >= GLOBAL_THRESHOLD) lockoutUntil = now + LOCKOUT_DURATION_MS

  writeAdmin({ ...data, failedLogins: recent, lockoutUntil, ipLockouts })
  return getLockoutInfo({ ...data, lockoutUntil, ipLockouts }, ip)
}

function clearFailedAttempts(data: AdminData) {
  if ((data.failedLogins?.length || 0) === 0 && !data.lockoutUntil && !Object.keys(data.ipLockouts || {}).length) return
  writeAdmin({ ...data, failedLogins: [], lockoutUntil: undefined, ipLockouts: {} })
}

// ── Public verify ──────────────────────────────────────────────────────

export type VerifyOutcome =
  | { ok: true }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'locked'; retryAfterMs: number }

/**
 * Constant-time, lockout-aware credential check.
 *
 * Always does a scrypt hash (even when the email is wrong or the admin
 * isn't configured yet) so the response time doesn't differ for "user
 * exists" vs "user doesn't" — defends against username enumeration.
 */
export function verifyCredentials(email: string, password: string, ip = 'unknown'): VerifyOutcome {
  const data = readAdmin() || ensureAdminFromEnv()

  // No admin record at all → still consume a hash so timing matches.
  if (!data) {
    hashPassword(password, '0'.repeat(32))
    return { ok: false, reason: 'invalid' }
  }

  const lock = getLockoutInfo(data, ip)
  if (lock.locked) {
    hashPassword(password, '0'.repeat(32))
    return { ok: false, reason: 'locked', retryAfterMs: lock.retryAfterMs }
  }

  const candidate = hashPassword(password, data.salt)
  const emailOk = normalizeEmail(email) === normalizeEmail(data.email)
  const passOk = timingSafeEqualHex(candidate, data.passwordHash)
  const success = emailOk && passOk

  if (success) {
    clearFailedAttempts(data)
    return { ok: true }
  }
  // Guesses against a wrong email can't hurt the account (and are already
  // IP rate-limited), so only real-account failures feed the lockout.
  if (!emailOk) return { ok: false, reason: 'invalid' }
  const after = recordFailedAttempt(data, ip)
  if (after.locked) return { ok: false, reason: 'locked', retryAfterMs: after.retryAfterMs }
  return { ok: false, reason: 'invalid' }
}

/** @deprecated Kept for callers we haven't migrated; prefer verifyCredentials. */
export function verifyPassword(email: string, password: string): boolean {
  return verifyCredentials(email, password).ok
}

// ── Password updates ───────────────────────────────────────────────────

export function updatePassword(newPassword: string) {
  const data = readAdmin() || ensureAdminFromEnv()
  if (!data) throw new Error('admin not configured')
  const salt = crypto.randomBytes(16).toString('hex')
  writeAdmin({
    ...data,
    salt,
    passwordHash: hashPassword(newPassword, salt),
    resets: [],
    failedLogins: [],
    lockoutUntil: undefined,
    ipLockouts: {},
  })
}

// ── Reset tokens ───────────────────────────────────────────────────────

export function createResetToken(): { token: string; expires: number } {
  const data = readAdmin() || ensureAdminFromEnv()
  if (!data) throw new Error('admin not configured')
  const token = crypto.randomBytes(24).toString('hex')
  const expires = Date.now() + 1000 * 60 * 30 // 30 min
  const resets = (data.resets || []).filter((t) => t.expires > Date.now())
  resets.push({ token, expires })
  writeAdmin({ ...data, resets })
  return { token, expires }
}

export function consumeResetToken(token: string): boolean {
  if (typeof token !== 'string' || !/^[0-9a-f]{48}$/.test(token)) return false
  const data = readAdmin() || ensureAdminFromEnv()
  if (!data) return false
  const now = Date.now()
  const live = (data.resets || []).filter((t) => t.expires > now)
  // Constant-time scan so timing doesn't reveal which token matched.
  let found = false
  for (const t of live) {
    if (
      t.token.length === token.length &&
      crypto.timingSafeEqual(Buffer.from(t.token, 'hex'), Buffer.from(token, 'hex'))
    ) {
      found = true
    }
  }
  const remaining = live.filter((t) => t.token !== token)
  writeAdmin({ ...data, resets: remaining })
  return found
}
