import type { NextApiRequest, NextApiResponse } from 'next'
import { deleteCookie } from 'cookies-next'
import { consumeResetToken, ensureAdminFromEnv, readAdmin, updatePassword } from '../../../lib/admin'
import { ADMIN_COOKIE } from '../../../lib/auth'
import { rateLimit } from '../../../lib/rateLimit'

/**
 * POST /api/auth/reset-password { token, password }
 *
 * A successful reset also bumps the session version (lib/admin
 * updatePassword), which signs out every device — including whoever may have
 * been holding a stolen session.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  // Throttle per IP so a reset token can't be brute-forced.
  const rl = rateLimit(req, 5, 10 * 60 * 1000)
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests, try later' })
  const { token, password } = req.body || {}
  if (typeof token !== 'string' || !/^[0-9a-f]{48}$/.test(token)) {
    return res.status(400).json({ error: 'Invalid or expired token' })
  }
  // Validate BEFORE consuming the single-use token, so a rejected password
  // doesn't burn the reset link.
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) {
    return res.status(400).json({ error: 'Password must be 12–1024 characters' })
  }
  ensureAdminFromEnv()
  const admin = readAdmin()
  if (!admin) return res.status(500).json({ error: 'Admin not configured' })
  const ok = consumeResetToken(token)
  if (!ok) return res.status(400).json({ error: 'Invalid or expired token' })
  updatePassword(password)
  deleteCookie(ADMIN_COOKIE, { req, res, path: '/' })
  return res.status(200).json({ ok: true })
}
