import type { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
import { setCookie } from 'cookies-next'
import { ensureAdminFromEnv, readAdmin, verifyCredentials } from '../../../lib/admin'
import { getJwtSecret, isProd } from '../../../lib/env'
import { rateLimit } from '../../../lib/rateLimit'

/**
 * POST /api/auth/email-login
 *
 * Industry-grade login pipeline:
 *
 *   1. Same-origin POST check (defence-in-depth on top of SameSite=Strict).
 *      Defeats simple CSRF + reduces noise from credential stuffing tools
 *      that fire requests cross-origin.
 *   2. Per-IP rate limit (10 attempts / 5 min).
 *   3. Per-account lockout (lib/admin → 10 fails / 15 min ⇒ 15 min lock).
 *      Layered so even an attacker rotating IPs hits the per-account wall.
 *   4. scrypt-hashed password, constant-time compare, no username
 *      enumeration (timing-equal response when email is unknown).
 *   5. JWT (HS256, 7d) in an httpOnly + sameSite=strict + secure cookie.
 */

const ALLOWED_BODY_KEYS = new Set(['email', 'password'])

function isSameOrigin(req: NextApiRequest): boolean {
  // In dev (NODE_ENV !== 'production') we accept missing Origin so curl /
  // localhost tooling still works. In prod we require it to match Host.
  const origin = req.headers.origin
  const host = req.headers.host
  if (!isProd()) return true
  if (!origin || !host) return false
  try {
    const u = new URL(origin)
    return u.host === host
  } catch {
    return false
  }
}

function sanitizeBody(body: unknown): { email: string; password: string } | null {
  if (!body || typeof body !== 'object') return null
  const keys = Object.keys(body as Record<string, unknown>)
  if (keys.some((k) => !ALLOWED_BODY_KEYS.has(k))) return null
  const { email, password } = body as { email?: unknown; password?: unknown }
  if (typeof email !== 'string' || typeof password !== 'string') return null
  if (email.length < 3 || email.length > 254) return null
  if (password.length < 1 || password.length > 1024) return null
  return { email: email.trim().toLowerCase(), password }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Bad origin' })
  }

  const rl = rateLimit(req, 10, 5 * 60 * 1000)
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
  if (!rl.allowed) {
    return res.status(429).json({ error: 'Too many attempts, try later' })
  }

  const creds = sanitizeBody(req.body)
  if (!creds) {
    return res.status(400).json({ error: 'Missing or invalid fields' })
  }

  ensureAdminFromEnv()
  // Re-read after possible bootstrap so we compare against the same email
  // shape on disk.
  const admin = readAdmin()
  const emailForCheck = admin?.email ? admin.email : creds.email

  const outcome = verifyCredentials(creds.email, creds.password)
  if (!outcome.ok) {
    if (outcome.reason === 'locked') {
      res.setHeader('Retry-After', String(Math.ceil(outcome.retryAfterMs / 1000)))
      return res.status(429).json({
        error: 'Account temporarily locked due to repeated failed attempts. Try again later.',
      })
    }
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  // Token carries the admin's email so a stolen + revoked record can be
  // distinguished from the active one later. `iat` and `exp` come from
  // jsonwebtoken.
  const token = jwt.sign(
    { sub: 'cv-admin', role: 'admin', email: emailForCheck },
    getJwtSecret(),
    { expiresIn: '7d' },
  )
  setCookie('cv_admin_token', token, {
    req,
    res,
    httpOnly: true,
    sameSite: 'strict',
    secure: isProd(),
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return res.status(200).json({ ok: true })
}
