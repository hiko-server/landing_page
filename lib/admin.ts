import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { createLoginGate, type LoginGate } from './security/loginGate'
import { createLoginThrottle, pairKey, type LockState, type LoginThrottle, type Pressure } from './security/loginThrottle'
import { toSessionVersion } from './security/session'
import { normalizePassword } from './adminAuth/passwordPolicy'

/**
 * Local admin record + credential helpers.
 *
 * Stored at data/admin.json (gitignored, bind-mounted). One admin per site —
 * this is a personal portfolio, not a multi-tenant SaaS.
 *
 * Hashing: scrypt with random 16-byte salt, 64-byte key (N=16384, r=8,
 * p=1 — Node defaults). Constant-time comparison via crypto.timingSafeEqual.
 * Login verification and the Admin → Security password change use the
 * asynchronous crypto.scrypt (libuv thread pool), so a flood of attempts
 * cannot block the event loop; only the rare bootstrap and e-mail reset
 * paths hash synchronously.
 *
 * Normalisation: a record written by this build hashes the NFKC form of the
 * password (`passwordNorm: 'NFKC'`, lib/adminAuth/passwordPolicy
 * normalizePassword — NIST SP 800-63B), and every check of it normalises the
 * typed password the same way, so "ｐａｓｓ" and "pass", or a composed and a
 * decomposed "é", are one password on every keyboard. A record from an
 * older build (no marker) hashed the password as typed and is checked as
 * typed, until the next change or reset rewrites it normalised.
 *
 * Brute-force defence: per (email, client) lockout with exponential backoff
 * (lib/security/loginThrottle.ts), per-IP and per-/48 limits in the route,
 * and a process-wide admission gate (lib/security/loginGate.ts) that, while
 * the site is under pressure, runs credential checks one at a time spaced by
 * the slowdown delay — a real throughput cap, never a global lockout: the
 * owner's known devices skip the queue. Every email is throttled
 * identically, real or not, so neither responses nor timing reveal the admin
 * address.
 *
 * Sessions: `sessionVersion` is embedded in every admin JWT (`sv`); bumping
 * it (password reset, logout) revokes every outstanding token.
 *
 * Reset tokens: 24 random bytes, 30 min TTL, single-use, pruned on every
 * read, at most MAX_LIVE_RESETS outstanding. Token comparison is
 * constant-time. The reset route checks the token (isLiveResetToken) before
 * anything about the new password, so the password rules — one of which
 * names the account's e-mail — answer only the holder of a real link.
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
  /** 'NFKC' when passwordHash is of the normalised password (absent on records from older builds). */
  passwordNorm?: 'NFKC'
  /** When the password was last set (bootstrap, reset or change; ms), when known. */
  passwordChangedAt?: number
}

/** Fields older builds stored for the (now removed) file-based lockout. */
const LEGACY_KEYS = ['failedLogins', 'lockoutUntil', 'ipLockouts'] as const

/** Emails compare case-insensitively and without surrounding whitespace. */
export function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

// ── Hashing ────────────────────────────────────────────────────────────

const KEY_LEN = 64

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, KEY_LEN).toString('hex')
}

/** Same hash as hashPassword, computed off the event loop. */
function hashPasswordAsync(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LEN, (err, key) => (err ? reject(err) : resolve(key.toString('hex'))))
  })
}

/**
 * The form of a typed password that `data`'s hash was made from: NFKC for
 * records written by this build (and for the dummy hash when there is no
 * record), as typed for a record from before normalisation.
 */
export function passwordForRecord(data: AdminData | null, password: string): string {
  return !data || data.passwordNorm === 'NFKC' ? normalizePassword(password) : password
}

/** A fresh salt and the async hash of the normalised password — the fields a password write stores. */
async function hashedFields(password: string, now: number): Promise<Pick<AdminData, 'salt' | 'passwordHash' | 'passwordNorm' | 'passwordChangedAt'>> {
  const salt = crypto.randomBytes(16).toString('hex')
  return { salt, passwordHash: await hashPasswordAsync(normalizePassword(password), salt), passwordNorm: 'NFKC', passwordChangedAt: now }
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

/**
 * The admin record; null only when data/admin.json does not exist (first
 * boot, before the bootstrap from ADMIN_EMAIL / ADMIN_PASS). Throws when the
 * file exists but cannot be read (EACCES, EIO, EISDIR…) or is not a JSON
 * object — callers that check sessions must fail closed then, never treat
 * the record as absent (SECU-3, wave 2B review).
 */
export function readAdminStrict(): AdminData | null {
  let raw: string
  try {
    raw = fs.readFileSync(adminPath, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT') return null
    throw err
  }
  const data: unknown = JSON.parse(raw)
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('data/admin.json does not hold an admin record')
  return data as AdminData
}

/** The admin record, or null when there is none OR it cannot be read (see readAdminStrict). */
export function readAdmin(): AdminData | null {
  try {
    return readAdminStrict()
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

/**
 * The admin record, created from ADMIN_EMAIL / ADMIN_PASS on first boot.
 * Only a MISSING data/admin.json is created: one that exists but cannot be
 * read is never overwritten (that would reset the session version to 0 and
 * the password to the environment's) — null, so sign-in fails closed until
 * the file is repaired.
 */
export function ensureAdminFromEnv(): AdminData | null {
  let current: AdminData | null
  try {
    current = readAdminStrict()
  } catch {
    return null
  }
  if (current) return current
  const email = normalizeEmail(process.env.ADMIN_EMAIL || process.env.ADMIN_USER)
  const pass = process.env.ADMIN_PASS
  if (!email || !pass) return null
  const salt = crypto.randomBytes(16).toString('hex')
  const data: AdminData = {
    email,
    passwordHash: hashPassword(normalizePassword(pass), salt),
    salt,
    passwordNorm: 'NFKC',
    passwordChangedAt: Date.now(),
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
 * The session version tokens are checked against and minted with: 0 while
 * there is no admin record yet, and it THROWS when data/admin.json exists
 * but cannot be read — so the proxy gate answers `unavailable` and
 * lib/auth finds no session (fail closed) instead of taking the version
 * for 0, which would let tokens revoked by "Sign out everywhere" back in.
 */
export function currentSessionVersion(): number {
  return getSessionVersion(readAdminStrict())
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

/** Site-wide login pressure: how much to space credential checks / tighten per-IP limits. */
export function loginPressure(): Pressure {
  return throttle().pressure()
}

/**
 * The process-wide credential-check gate. Its spacing follows the current
 * pressure, so it only queues while the site is under attack (or while a
 * burst exceeds its concurrency cap).
 */
export function loginGate(): LoginGate {
  const registry = globalThis as unknown as Record<symbol, LoginGate | undefined>
  const key = Symbol.for('lucian-dev.loginGate')
  let g = registry[key]
  if (!g) {
    g = createLoginGate(() => loginPressure().delayMs)
    registry[key] = g
  }
  return g
}

/**
 * Cheap lockout pre-check for an (email, client) pair — no hashing. Every
 * email is tracked identically, so a locked answer reveals nothing about
 * which address is real; it just spares a locked pair the queue and scrypt.
 */
export function loginLockState(email: string, clientBucket: string): LockState {
  return throttle().check(pairKey(normalizeEmail(email), clientBucket))
}

/** Forget the (email, client) failures once every step of a sign-in succeeded. */
export function clearLoginFailures(email: string, clientBucket: string): void {
  throttle().succeed(pairKey(normalizeEmail(email), clientBucket))
}

/**
 * Count a failed second step (a wrong recovery code after a right password)
 * against the same (email, client) lockout as a wrong password.
 */
export function recordLoginFailure(email: string, clientBucket: string): LockState {
  return throttle().fail(pairKey(normalizeEmail(email), clientBucket))
}

// ── Public verify ──────────────────────────────────────────────────────

export type VerifyOutcome =
  | { ok: true }
  | { ok: false; reason: 'invalid' }
  /**
   * `checked`: this call hashed the password, found it wrong, and that
   * failure locked the pair — a real wrong attempt. False when the pair was
   * already locked and nothing was checked (a waiting request, which must
   * not be counted as a failure).
   */
  | { ok: false; reason: 'locked'; retryAfterMs: number; checked: boolean }

/**
 * Constant-time, lockout-aware credential check.
 *
 * `clientBucket` is the caller's rate-limit identity (lib/rateLimit
 * clientKey: IPv4 or IPv6 /64). The same code path runs for a wrong
 * password, an unknown email and a missing admin record: one (async) scrypt
 * hash, one in-memory failure record — so neither the response nor its
 * timing tells them apart. A pair that is locked (also re-checked here,
 * because the state may change while a request waits in the login gate)
 * is answered without hashing.
 */
export async function verifyCredentials(
  email: string,
  password: string,
  clientBucket: string,
  opts: { secondStepFollows?: boolean } = {},
): Promise<VerifyOutcome> {
  const t = throttle()
  const key = pairKey(normalizeEmail(email), clientBucket)
  const lock = t.check(key)
  if (lock.locked) return { ok: false, reason: 'locked', retryAfterMs: lock.retryAfterMs, checked: false }

  const data = readAdmin() || ensureAdminFromEnv()
  const candidate = await hashPasswordAsync(passwordForRecord(data, password), data?.salt || DUMMY_SALT)
  const emailOk = !!data && normalizeEmail(email) === normalizeEmail(data.email)
  const passOk = !!data && timingSafeEqualHex(candidate, data.passwordHash)

  if (emailOk && passOk) {
    // With a second step still to come (a recovery code), a right password
    // must not wipe the failures the second step has collected.
    if (!opts.secondStepFollows) t.succeed(key)
    return { ok: true }
  }
  const after = t.fail(key)
  if (after.locked) return { ok: false, reason: 'locked', retryAfterMs: after.retryAfterMs, checked: true }
  return { ok: false, reason: 'invalid' }
}

// ── Password updates ───────────────────────────────────────────────────

/** Set a new password (e-mail reset); also burns every reset link and signs out every device. */
export function updatePassword(newPassword: string) {
  const data = readAdmin() || ensureAdminFromEnv()
  if (!data) throw new Error('admin not configured')
  const salt = crypto.randomBytes(16).toString('hex')
  writeAdmin({
    ...data,
    salt,
    passwordHash: hashPassword(normalizePassword(newPassword), salt),
    passwordNorm: 'NFKC',
    passwordChangedAt: Date.now(),
    resets: [],
    sessionVersion: getSessionVersion(data) + 1,
  })
}

/**
 * Does `candidate` match the stored password? Async scrypt, constant-time
 * compare; no lockout bookkeeping — for checks of a value the server itself
 * holds (the ADMIN_PASS bootstrap hint), never for a typed password (that is
 * verifyCredentials, which counts failures).
 */
export async function passwordMatchesRecord(candidate: string, data: AdminData): Promise<boolean> {
  if (!data.salt || !data.passwordHash) return false
  const hash = await hashPasswordAsync(passwordForRecord(data, candidate), data.salt)
  return timingSafeEqualHex(hash, data.passwordHash)
}

export type ChangePasswordWrite =
  | { ok: true; changedAt: number; sessionVersion: number }
  | { ok: false; reason: 'missing' | 'changed' }

/**
 * Replace the password from Admin → Security, after the caller verified the
 * current one against the record whose hash was `expectedHash`: a fresh
 * salt, the async scrypt hash of the normalised password, every reset link
 * burnt, and — with `signOutEverywhere` — the session version bumped, which
 * ends every admin token at once (the caller then re-issues this browser's).
 * Compare-and-swap: when the stored hash is no longer `expectedHash` (a
 * reset or another change landed meanwhile) nothing is written.
 */
export async function changeAdminPassword(
  newPassword: string,
  opts: { expectedHash: string; signOutEverywhere: boolean; now?: number },
): Promise<ChangePasswordWrite> {
  const now = opts.now ?? Date.now()
  const fields = await hashedFields(newPassword, now)
  // Re-read after the (async) hash: the record may have changed while it ran.
  const data = readAdminStrict()
  if (!data) return { ok: false, reason: 'missing' }
  if (data.passwordHash !== opts.expectedHash) return { ok: false, reason: 'changed' }
  const sessionVersion = getSessionVersion(data) + (opts.signOutEverywhere ? 1 : 0)
  writeAdmin({ ...data, ...fields, resets: [], sessionVersion })
  return { ok: true, changedAt: now, sessionVersion }
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

const RESET_TOKEN_RE = /^[0-9a-f]{48}$/

/** The unexpired reset links of `data`, and whether `token` is one of them (constant-time scan). */
function scanResetTokens(data: AdminData, token: string, now: number): { live: ResetToken[]; found: boolean } {
  const live = (data.resets || []).filter((t) => t.expires > now)
  // Every live token is compared, so timing doesn't reveal which one matched.
  let found = false
  for (const t of live) {
    if (
      t.token.length === token.length &&
      crypto.timingSafeEqual(Buffer.from(t.token, 'hex'), Buffer.from(token, 'hex'))
    ) {
      found = true
    }
  }
  return { live, found }
}

/**
 * Is `token` an unexpired reset link? Nothing is written: the reset route
 * asks this before it judges the new password, so that only the holder of a
 * real link ever learns which password rule failed (a rule mentions the
 * account's e-mail name) and a refused password keeps the link usable.
 */
export function isLiveResetToken(token: string): boolean {
  if (typeof token !== 'string' || !RESET_TOKEN_RE.test(token)) return false
  const data = readAdmin() || ensureAdminFromEnv()
  if (!data) return false
  return scanResetTokens(data, token, Date.now()).found
}

export function consumeResetToken(token: string): boolean {
  if (typeof token !== 'string' || !RESET_TOKEN_RE.test(token)) return false
  const data = readAdmin() || ensureAdminFromEnv()
  if (!data) return false
  const { live, found } = scanResetTokens(data, token, Date.now())
  const remaining = live.filter((t) => t.token !== token)
  writeAdmin({ ...data, resets: remaining })
  return found
}
