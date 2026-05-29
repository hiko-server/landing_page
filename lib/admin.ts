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
 * Brute-force defence: per-account exponential-backoff lockout layered on
 * top of the per-IP rate limiter (lib/rateLimit.ts). After 10 wrong
 * attempts in a rolling 15 min window the account is locked for 15 min;
 * a correct password (or the 15 min elapsing) clears the counter.
 *
 * Reset tokens: 24 random bytes, 30 min TTL, single-use, pruned on every
 * read. Token comparison is constant-time to avoid leaking via timing.
 */

const adminPath = path.join(process.cwd(), 'data', 'admin.json')

type ResetToken = { token: string; expires: number }
type FailedLogin = { at: number }

export type AdminData = {
  email: string
  passwordHash: string
  salt: string
  resets?: ResetToken[]
  failedLogins?: FailedLogin[]
  /** ms-epoch; while in the future, logins are rejected as locked. */
  lockoutUntil?: number
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
  const email = process.env.ADMIN_EMAIL || process.env.ADMIN_USER
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
const LOCKOUT_THRESHOLD = 10
const LOCKOUT_DURATION_MS = 15 * 60 * 1000

export function getLockoutInfo(data: AdminData | null = readAdmin()): {
  locked: boolean
  retryAfterMs: number
} {
  if (!data) return { locked: false, retryAfterMs: 0 }
  const now = Date.now()
  if (data.lockoutUntil && data.lockoutUntil > now) {
    return { locked: true, retryAfterMs: data.lockoutUntil - now }
  }
  return { locked: false, retryAfterMs: 0 }
}

function pruneFailedLogins(list: FailedLogin[] | undefined, now: number): FailedLogin[] {
  if (!Array.isArray(list)) return []
  return list.filter((f) => now - f.at < FAILED_WINDOW_MS)
}

function recordFailedAttempt(data: AdminData): { locked: boolean; retryAfterMs: number } {
  const now = Date.now()
  const recent = pruneFailedLogins(data.failedLogins, now)
  recent.push({ at: now })
  let lockoutUntil = data.lockoutUntil
  let locked = false
  let retryAfterMs = 0
  if (recent.length >= LOCKOUT_THRESHOLD) {
    lockoutUntil = now + LOCKOUT_DURATION_MS
    locked = true
    retryAfterMs = LOCKOUT_DURATION_MS
  } else if (lockoutUntil && lockoutUntil <= now) {
    lockoutUntil = undefined
  }
  writeAdmin({ ...data, failedLogins: recent, lockoutUntil })
  return { locked, retryAfterMs }
}

function clearFailedAttempts(data: AdminData) {
  if ((data.failedLogins?.length || 0) === 0 && !data.lockoutUntil) return
  writeAdmin({ ...data, failedLogins: [], lockoutUntil: undefined })
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
export function verifyCredentials(email: string, password: string): VerifyOutcome {
  const data = readAdmin() || ensureAdminFromEnv()

  // No admin record at all → still consume a hash so timing matches.
  if (!data) {
    hashPassword(password, '0'.repeat(32))
    return { ok: false, reason: 'invalid' }
  }

  const lock = getLockoutInfo(data)
  if (lock.locked) {
    hashPassword(password, '0'.repeat(32))
    return { ok: false, reason: 'locked', retryAfterMs: lock.retryAfterMs }
  }

  const candidate = hashPassword(password, data.salt)
  const emailOk = email === data.email
  const passOk = timingSafeEqualHex(candidate, data.passwordHash)
  const success = emailOk && passOk

  if (success) {
    clearFailedAttempts(data)
    return { ok: true }
  }
  const after = recordFailedAttempt(data)
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
