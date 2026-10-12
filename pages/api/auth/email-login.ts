import type { NextApiRequest, NextApiResponse } from 'next'
import { setCookie } from 'cookies-next'
import { ensureAdminFromEnv, loginPressure, readAdmin, verifyCredentials } from '../../../lib/admin'
import { ADMIN_COOKIE, ADMIN_SESSION_TTL_S, signAdminToken } from '../../../lib/auth'
import { isProd } from '../../../lib/env'
import { clientKey, rateLimit } from '../../../lib/rateLimit'
import { DEFAULT_LOGIN_POLICY } from '../../../lib/security/loginThrottle'

/**
 * POST /api/auth/email-login
 *
 *   1. CSRF: the edge middleware rejects cross-site POSTs and non-JSON
 *      bodies before this runs (lib/security/csrf.ts).
 *   2. Per-IP limits: 10 attempts / 5 min (4 while the site is under a
 *      distributed attack) and 30 / hour.
 *   3. Per (email, client) lockout with exponential backoff, plus a global
 *      slowdown instead of a global lockout (lib/security/loginThrottle.ts) —
 *      strangers can only ever lock out their own network.
 *   4. scrypt-hashed password, constant-time compare; unknown email and wrong
 *      password take the same path, the same time and get the same answer.
 *   5. JWT (HS256, 7d, bound to the session version) in an httpOnly +
 *      sameSite=strict + secure cookie.
 */

const ALLOWED_BODY_KEYS = new Set(['email', 'password'])
const HOURLY_LIMIT = 30
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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')

  const pressure = loginPressure()
  const policy = DEFAULT_LOGIN_POLICY
  const perWindow = rateLimit(
    req,
    pressure.underAttack ? policy.ipLimitUnderAttack : policy.ipLimit,
    policy.ipWindowMs,
    'auth:email-login',
  )
  const perHour = rateLimit(req, HOURLY_LIMIT, 60 * 60 * 1000, 'auth:email-login:hour')
  res.setHeader('X-RateLimit-Remaining', String(Math.min(perWindow.remaining, perHour.remaining)))
  if (!perWindow.allowed || !perHour.allowed) {
    const resetAt = Math.max(perWindow.allowed ? 0 : perWindow.resetAt, perHour.allowed ? 0 : perHour.resetAt)
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))))
    return res.status(429).json({ error: THROTTLED })
  }

  const creds = sanitizeBody(req.body)
  if (!creds) {
    return res.status(400).json({ error: 'Missing or invalid fields' })
  }

  ensureAdminFromEnv()
  const outcome = verifyCredentials(creds.email, creds.password, clientKey(req))
  // Site-wide slowdown applies to every outcome, so the delay itself leaks nothing.
  if (pressure.delayMs > 0) await sleep(pressure.delayMs)

  if (!outcome.ok) {
    if (outcome.reason === 'locked') {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(outcome.retryAfterMs / 1000))))
      return res.status(429).json({ error: THROTTLED })
    }
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  // Sign with the address exactly as stored on disk.
  const email = readAdmin()?.email || creds.email
  setCookie(ADMIN_COOKIE, signAdminToken(email), {
    req,
    res,
    httpOnly: true,
    sameSite: 'strict',
    secure: isProd(),
    path: '/',
    maxAge: ADMIN_SESSION_TTL_S,
  })
  return res.status(200).json({ ok: true })
}
