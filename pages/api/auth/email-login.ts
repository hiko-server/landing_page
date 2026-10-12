import type { NextApiRequest, NextApiResponse } from 'next'
import { getCookie, setCookie } from 'cookies-next'
import { ensureAdminFromEnv, loginGate, loginLockState, loginPressure, readAdmin, verifyCredentials } from '../../../lib/admin'
import { ADMIN_COOKIE, ADMIN_SESSION_TTL_S, signAdminToken } from '../../../lib/auth'
import { getJwtSecret, isProd } from '../../../lib/env'
import { clientKey, rateLimit, rateLimitNetwork } from '../../../lib/rateLimit'
import { KNOWN_DEVICE_COOKIE, KNOWN_DEVICE_TTL_S, signKnownDevice, verifyKnownDevice } from '../../../lib/security/knownDevice'
import { DEFAULT_LOGIN_POLICY } from '../../../lib/security/loginThrottle'

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
 *   6. JWT (HS256, 7d, bound to the session version) in an httpOnly +
 *      sameSite=strict + secure cookie.
 */

const ALLOWED_BODY_KEYS = new Set(['email', 'password'])
const HOURLY_LIMIT = 30
/** A /48 holds many /64s (one per LAN); give it a larger, but finite, shared budget. */
const NETWORK_FACTOR = 3
/** One message for every throttle outcome; it never confirms an address. */
const THROTTLED = 'Too many sign-in attempts. Please wait and try again.'

function sanitizeBody(body: unknown): { email: string; password: string } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const keys = Object.keys(body as Record<string, unknown>)
  if (keys.some((k) => !ALLOWED_BODY_KEYS.has(k))) return null
  const { email, password } = body as { email?: unknown; password?: unknown }
  if (typeof email !== 'string' || typeof password !== 'string') return null
  if (email.length < 3 || email.length > 254) return null
  if (password.length < 1 || password.length > 1024) return null
  return { email: email.trim().toLowerCase(), password }
}

type Hit = { allowed: boolean; resetAt: number; remaining: number }

function throttled(res: NextApiResponse, retryAfterMs: number) {
  res.setHeader('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))))
  return res.status(429).json({ error: THROTTLED })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  const secret = getJwtSecret()
  const device = verifyKnownDevice(secret, getCookie(KNOWN_DEVICE_COOKIE, { req, res }))
  const admission = loginGate().admit(() => verifyCredentials(creds.email, creds.password, bucket), {
    bypass: device !== null,
  })
  if (!admission.admitted) return throttled(res, admission.retryAfterMs)

  let outcome: Awaited<ReturnType<typeof verifyCredentials>>
  try {
    outcome = await admission.result
  } catch (err) {
    console.error('[auth] credential check failed', err)
    return res.status(500).json({ error: 'Sign-in is unavailable right now. Please try again.' })
  }

  if (!outcome.ok) {
    if (outcome.reason === 'locked') return throttled(res, outcome.retryAfterMs)
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  // Sign with the address exactly as stored on disk.
  const email = readAdmin()?.email || creds.email
  const cookieBase = { req, res, httpOnly: true, sameSite: 'strict' as const, secure: isProd(), path: '/' }
  setCookie(ADMIN_COOKIE, signAdminToken(email), { ...cookieBase, maxAge: ADMIN_SESSION_TTL_S })
  // Remember this browser (keeping its id when it was already known) so it
  // skips the login queue during a future distributed attack.
  setCookie(KNOWN_DEVICE_COOKIE, signKnownDevice(secret, device?.id), { ...cookieBase, maxAge: KNOWN_DEVICE_TTL_S })
  return res.status(200).json({ ok: true })
}
