import type { NextApiRequest, NextApiResponse } from 'next'
import {
  clearLoginFailures,
  ensureAdminFromEnv,
  loginGate,
  loginLockState,
  loginPressure,
  readAdmin,
  recordLoginFailure,
  verifyCredentials,
} from '../../../lib/admin'
import { knownDeviceIdOf, requestOrigin, startAdminSession } from '../../../lib/auth'
import { withApi } from '../../../lib/apiHandler'
import { clientKey, rateLimit, rateLimitNetwork } from '../../../lib/rateLimit'
import { DEFAULT_LOGIN_POLICY } from '../../../lib/security/loginThrottle'
import { passkeyCount } from '../../../lib/adminAuth/passkeys'
import { consumeRecoveryCode, isPasskeyRequired, recordAuthEvent } from '../../../lib/adminAuth/store'

/**
 * POST /api/auth/email-login
 *
 *   1. CSRF: the edge middleware rejects cross-site POSTs and non-JSON
 *      bodies before this runs (lib/security/csrf.ts).
 *   2. Per-IP limits: 10 attempts / 5 min (4 while the site is under a
 *      distributed attack) and 30 / hour; IPv6 clients additionally share a
 *      per-/48 budget (3× those), so one allocation can't multiply its
 *      budget across 65,536 /64s.
 *   3. Per (email, client) lockout with exponential backoff
 *      (lib/security/loginThrottle.ts) — strangers can only ever lock out
 *      their own network.
 *   4. Global throughput cap instead of a global lockout
 *      (lib/security/loginGate.ts): while the site is under pressure, every
 *      credential check from an unrecognised device waits in one serial,
 *      bounded queue spaced by the slowdown delay (overflow → 429 at once).
 *      A browser that signed in before carries a signed "known device"
 *      cookie and skips the queue — but not the lockout.
 *   5. scrypt-hashed password (async, off the event loop), constant-time
 *      compare; unknown email and wrong password take the same path, the
 *      same time and get the same answer.
 *   6. "Require a passkey" (lib/adminAuth): once the owner has turned it on,
 *      a request without a recovery code answers 403 PASSKEY_REQUIRED before
 *      any password check (so it reveals nothing about the password); the
 *      password plus one unused recovery code signs in and spends the code.
 *      A wrong password and a wrong code get the same 401, and a wrong code
 *      counts as a failure for the lockout above (a right password does not
 *      wipe that count until the code is right too).
 *   7. A session row in auth.db and a JWT (HS256, 7d, bound to the session
 *      version and the row) in an httpOnly + sameSite=strict + secure cookie,
 *      plus the readable `cv_admin_hint=1` companion cookie (lib/auth
 *      startAdminSession). Sign-ins go to the sign-in history; a failure only
 *      adds to an hourly count per method and country (lib/adminAuth/store).
 */

const ALLOWED_BODY_KEYS = new Set(['email', 'password', 'recoveryCode'])
const HOURLY_LIMIT = 30
/** A /48 holds many /64s (one per LAN); give it a larger, but finite, shared budget. */
const NETWORK_FACTOR = 3
/** With "Require a passkey" on, a wrong password and a wrong recovery code get the same answer. */
const WRONG_SECOND_STEP = { code: 'PASSWORD_OR_RECOVERY_INVALID', error: 'The password or the recovery code is not right (each code works once).' }
/** One message for every throttle outcome; it never confirms an address. */
const THROTTLED = 'Too many sign-in attempts. Please wait and try again.'

function sanitizeBody(body: unknown): { email: string; password: string; recoveryCode: string | null } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const keys = Object.keys(body as Record<string, unknown>)
  if (keys.some((k) => !ALLOWED_BODY_KEYS.has(k))) return null
  const { email, password, recoveryCode } = body as { email?: unknown; password?: unknown; recoveryCode?: unknown }
  if (typeof email !== 'string' || typeof password !== 'string') return null
  if (email.length < 3 || email.length > 254) return null
  if (password.length < 1 || password.length > 1024) return null
  if (recoveryCode !== undefined && (typeof recoveryCode !== 'string' || recoveryCode.length > 64)) return null
  return { email: email.trim().toLowerCase(), password, recoveryCode: typeof recoveryCode === 'string' && recoveryCode.trim() ? recoveryCode : null }
}

type Hit = { allowed: boolean; resetAt: number; remaining: number }

function throttled(res: NextApiResponse, retryAfterMs: number) {
  res.setHeader('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))))
  return res.status(429).json({ error: THROTTLED })
}

export default withApi('auth/email-login', async (req: NextApiRequest, res: NextApiResponse, ctx) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')

  const pressure = loginPressure()
  const policy = DEFAULT_LOGIN_POLICY
  const windowLimit = pressure.underAttack ? policy.ipLimitUnderAttack : policy.ipLimit
  const hits: Hit[] = [
    rateLimit(req, windowLimit, policy.ipWindowMs, 'auth:email-login'),
    rateLimit(req, HOURLY_LIMIT, 60 * 60 * 1000, 'auth:email-login:hour'),
    rateLimitNetwork(req, windowLimit * NETWORK_FACTOR, policy.ipWindowMs, 'auth:email-login:net48'),
    rateLimitNetwork(req, HOURLY_LIMIT * NETWORK_FACTOR, 60 * 60 * 1000, 'auth:email-login:net48:hour'),
  ]
  res.setHeader('X-RateLimit-Remaining', String(Math.min(...hits.map((h) => h.remaining))))
  const refused = hits.filter((h) => !h.allowed)
  if (refused.length) {
    return throttled(res, Math.max(...refused.map((h) => h.resetAt)) - Date.now())
  }

  const creds = sanitizeBody(req.body)
  if (!creds) {
    return res.status(400).json({ error: 'Missing or invalid fields' })
  }

  ensureAdminFromEnv()
  const bucket = clientKey(req)
  // A locked (email, client) pair is answered at once: no queue slot, no hash.
  const lock = loginLockState(creds.email, bucket)
  if (lock.locked) return throttled(res, lock.retryAfterMs)

  // "Require a passkey" is on: without a recovery code there is nothing to
  // check (and the answer says nothing about the password).
  const passkeyOnly = isPasskeyRequired() && passkeyCount() > 0
  if (passkeyOnly && !creds.recoveryCode) {
    return res.status(403).json({
      code: 'PASSKEY_REQUIRED',
      error: 'This account signs in with a passkey. Use your passkey, or your password together with a recovery code.',
    })
  }

  const deviceId = knownDeviceIdOf(req, res)
  const admission = loginGate().admit(() => verifyCredentials(creds.email, creds.password, bucket, { secondStepFollows: passkeyOnly }), {
    bypass: deviceId !== null,
  })
  if (!admission.admitted) return throttled(res, admission.retryAfterMs)

  let outcome: Awaited<ReturnType<typeof verifyCredentials>>
  try {
    outcome = await admission.result
  } catch (err) {
    ctx.log.error('credential check failed', { err })
    return res.status(500).json({ error: 'Sign-in is unavailable right now. Please try again.' })
  }

  if (!outcome.ok) {
    if (outcome.reason === 'locked') return throttled(res, outcome.retryAfterMs)
    recordFailure(req, passkeyOnly ? 'recovery' : 'password')
    return res.status(401).json(passkeyOnly ? WRONG_SECOND_STEP : { error: 'Invalid credentials' })
  }

  // "Require a passkey": the password alone is not enough any more.
  let method: 'password' | 'recovery' = 'password'
  if (passkeyOnly) {
    if (!consumeRecoveryCode(creds.recoveryCode)) {
      const lock = recordLoginFailure(creds.email, bucket)
      recordFailure(req, 'recovery')
      if (lock.locked) return throttled(res, lock.retryAfterMs)
      return res.status(401).json(WRONG_SECOND_STEP)
    }
    clearLoginFailures(creds.email, bucket)
    method = 'recovery'
  }

  // Sign with the address exactly as stored on disk.
  const email = readAdmin()?.email || creds.email
  const session = startAdminSession(req, res, { email, method, knownDeviceId: deviceId })
  if (method === 'recovery') recordAuthEvent({ type: 'recovery-code-used', method, sessionId: session.id, ...requestOrigin(req) })
  return res.status(200).json({ ok: true })
})

/** Count a failed attempt: hour, method and country only (no address, no device). */
function recordFailure(req: NextApiRequest, method: 'password' | 'recovery') {
  try {
    recordAuthEvent({ type: 'signin-failed', method, country: requestOrigin(req).country })
  } catch {
    // History is best effort; the lockout already counted the failure.
  }
}
