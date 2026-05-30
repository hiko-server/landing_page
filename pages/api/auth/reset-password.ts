import type { NextApiRequest, NextApiResponse } from 'next'
import { consumeResetToken, ensureAdminFromEnv, readAdmin, updatePassword } from '../../../lib/admin'
import { rateLimit } from '../../../lib/rateLimit'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  // Throttle per IP so a reset token can't be brute-forced. Mirrors the limit
  // on request-reset; every other auth route is rate-limited but this wasn't.
  const rl = rateLimit(req, 5, 10 * 60 * 1000)
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests, try later' })
  const { token, password } = req.body || {}
  if (!token || !password) return res.status(400).json({ error: 'Missing fields' })
  ensureAdminFromEnv()
  const admin = readAdmin()
  if (!admin) return res.status(500).json({ error: 'Admin not configured' })
  const ok = consumeResetToken(token)
  if (!ok) return res.status(400).json({ error: 'Invalid or expired token' })
  updatePassword(password)
  return res.status(200).json({ ok: true })
}

