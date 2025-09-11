import type { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
import { setCookie } from 'cookies-next'
import { getJwtSecret, isProd } from '../../../lib/env'
import { rateLimit } from '../../../lib/rateLimit'

const ADMIN_USER = process.env.ADMIN_USER
const ADMIN_PASS = process.env.ADMIN_PASS

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { username, password } = req.body || {}
  if (!ADMIN_USER || !ADMIN_PASS) return res.status(500).json({ error: 'Admin not configured' })
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' })
  const rl = rateLimit(req, 10, 5 * 60 * 1000)
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
  if (!rl.allowed) return res.status(429).json({ error: 'Too many attempts, try later' })
  if (username !== ADMIN_USER || password !== ADMIN_PASS) return res.status(401).json({ error: 'Invalid credentials' })

  const token = jwt.sign({ sub: 'cv-admin', role: 'admin' }, getJwtSecret(), { expiresIn: '7d' })
  setCookie('cv_admin_token', token, {
    req,
    res,
    httpOnly: true,
    sameSite: 'strict',
    secure: isProd(),
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  res.status(200).json({ ok: true })
}
