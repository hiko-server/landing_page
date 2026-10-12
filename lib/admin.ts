import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { createLoginThrottle, pairKey, type LoginThrottle, type Pressure } from './security/loginThrottle'
import { toSessionVersion } from './security/session'

/**
 * Local admin record + credential helpers.
 *
 * Stored at data/admin.json (gitignored, bind-mounted). One admin per site —
 * this is a personal portfolio, not a multi-tenant SaaS.
 *
 * Hashing: scrypt with random 16-byte salt, 64-byte key (N=16384, r=8,
 * p=1 — Node defaults). Constant-time comparison via crypto.timingSafeEqual.
 *
 * Brute-force defence (lib/security/loginThrottle.ts): per (email, client)
 * lockout with exponential backoff, per-IP limits in the route, and a global
 * slowdown — never a global lockout, so nobody can lock the owner out by
 * failing logins from many addresses. Every email is throttled identically,
 * real or not, so neither responses nor timing reveal the admin address.
 *
 * Sessions: `sessionVersion` is embedded in every admin JWT (`sv`); bumping
 * it (password reset, logout) revokes every outstanding token.
 *
 * Reset tokens: 24 random bytes, 30 min TTL, single-use, pruned on every
 * read, at most MAX_LIVE_RESETS outstanding. Token comparison is
 * constant-time.
 */

const adminPath = path.join(process.cwd(), 'data', 'admin.json')

type ResetToken = { token: string; expires: number }

export type AdminData = {
  email: string
  passwordHash: string
  salt: string
  resets?: ResetToken[]
  /** Monotonic; admin JWTs carrying a different `sv` claim are rejected. */
  sessionVersion?: number
}

/** Fields older builds stored for the (now removed) file-based lockout. */
const LEGACY_KEYS = ['failedLogins', 'lockoutUntil', 'ipLockouts'] as const

/** Emails compare case-insensitively and without surrounding whitespace. */
export function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
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

/** Atomic write (temp file + rename) so a crash can't leave a truncated record. */
function writeAdmin(data: AdminData) {
  const clean: Record<string, unknown> = { ...data }
  for (const k of LEGACY_KEYS) delete clean[k]
  fs.mkdirSync(path.dirname(adminPath), { recursive: true })
  const tmp = `${adminPath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(clean, null, 2), { encoding: 'utf-8', mode: 0o600 })
  fs.renameSync(tmp, adminPath)
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
    sessionVersion: 0,
  }
  writeAdmin(data)
  return data
}

// ── Session versions ───────────────────────────────────────────────────

/** Current session version (0 when the record or the field is missing). */
export function getSessionVersion(data: AdminData | null = readAdmin()): number {
  return toSessionVersion(data?.sessionVersion)
}

/**
 * Revoke every outstanding admin session by bumping the version. Returns the
 * new version (0 when no admin record exists — then no token can exist either).
 */
export function bumpSessionVersion(): number {
  const data = readAdmin() || ensureAdminFromEnv()
  if (!data) return 0
  const next = getSessionVersion(data) + 1
  writeAdmin({ ...data, sessionVersion: next })
  return next
}

// ── Login throttling ───────────────────────────────────────────────────

const DUMMY_SALT = '0'.repeat(32)

function throttle(): LoginThrottle {
  // On globalThis so all route bundles (and dev reloads) share one state.
  const registry = globalThis as unknown as Record<symbol, LoginThrottle | undefined>
  const key = Symbol.for('lucian-dev.loginThrottle')
  let t = registry[key]
  if (!t) {
    t = createLoginThrottle()
    registry[key] = t
  }
  return t
}

/** Site-wide login pressure: how much to slow responses / tighten per-IP limits. */
export function loginPressure(): Pressure {
  return throttle().pressure()
}

// ── Public verify ──────────────────────────────────────────────────────

export type VerifyOutcome =
  | { ok: true }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'locked'; retryAfterMs: number }

/**
 * Constant-time, lockout-aware credential check.
 *
 * `clientBucket` is the caller's rate-limit identity (lib/rateLimit
 * clientKey: IPv4 or IPv6 /64). The same code path runs for a wrong
 * password, an unknown email and a missing admin record: one scrypt hash,
 * one in-memory failure record — so neither the response nor its timing
 * tells them apart.
 */
export function verifyCredentials(email: string, password: string, clientBucket: string): VerifyOutcome {
  const t = throttle()
  const key = pairKey(normalizeEmail(email), clientBucket)
  const lock = t.check(key)
  const data = readAdmin() || ensureAdminFromEnv()

  if (lock.locked) {
    hashPassword(password, data?.salt || DUMMY_SALT)
    return { ok: false, reason: 'locked', retryAfterMs: lock.retryAfterMs }
  }

  const candidate = hashPassword(password, data?.salt || DUMMY_SALT)
  const emailOk = !!data && normalizeEmail(email) === normalizeEmail(data.email)
  const passOk = !!data && timingSafeEqualHex(candidate, data.passwordHash)

  if (emailOk && passOk) {
    t.succeed(key)
    return { ok: true }
  }
  const after = t.fail(key)
  if (after.locked) return { ok: false, reason: 'locked', retryAfterMs: after.retryAfterMs }
  return { ok: false, reason: 'invalid' }
}

// ── Password updates ───────────────────────────────────────────────────

/** Set a new password; also burns every reset link and signs out every device. */
export function updatePassword(newPassword: string) {
  const data = readAdmin() || ensureAdminFromEnv()
  if (!data) throw new Error('admin not configured')
  const salt = crypto.randomBytes(16).toString('hex')
  writeAdmin({
    ...data,
    salt,
    passwordHash: hashPassword(newPassword, salt),
    resets: [],
    sessionVersion: getSessionVersion(data) + 1,
  })
}

// ── Reset tokens ───────────────────────────────────────────────────────

/**
 * Outstanding reset links allowed at once. Past this, no new link (and no
 * mail) is issued until one expires — so a distributed requester can't flood
 * the owner's inbox. The caller answers identically either way.
 */
const MAX_LIVE_RESETS = 3
const RESET_TTL_MS = 30 * 60 * 1000

export function createResetToken(): { token: string; expires: number } | null {
  const data = readAdmin() || ensureAdminFromEnv()
  if (!data) throw new Error('admin not configured')
  const now = Date.now()
  const resets = (data.resets || []).filter((t) => t.expires > now)
  if (resets.length >= MAX_LIVE_RESETS) return null
  const token = crypto.randomBytes(24).toString('hex')
  const expires = now + RESET_TTL_MS
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
