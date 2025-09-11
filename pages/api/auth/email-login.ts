import type { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
import { setCookie } from 'cookies-next'
import { ensureAdminFromEnv, readAdmin, verifyPassword } from '../../../lib/admin'
import { getJwtSecret, isProd } from '../../../lib/env'
import { rateLimit } from '../../../lib/rateLimit'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' })
  const rl = rateLimit(req, 10, 5 * 60 * 1000)
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
  if (!rl.allowed) return res.status(429).json({ error: 'Too many attempts, try later' })
  ensureAdminFromEnv()
  const admin = readAdmin()
  if (!admin || admin.email !== email || !verifyPassword(email, password)) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }
  const token = jwt.sign({ sub: 'cv-admin', role: 'admin', email }, getJwtSecret(), { expiresIn: '7d' })
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
