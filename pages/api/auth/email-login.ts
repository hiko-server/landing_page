import type { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
import { setCookie } from 'cookies-next'
import { ensureAdminFromEnv, readAdmin, verifyPassword } from '../../../lib/admin'

const JWT_SECRET = process.env.JWT_SECRET || 'change-me'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' })
  ensureAdminFromEnv()
  const admin = readAdmin()
  if (!admin || admin.email !== email || !verifyPassword(email, password)) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }
  const token = jwt.sign({ sub: 'cv-admin', role: 'admin', email }, JWT_SECRET, { expiresIn: '7d' })
  setCookie('cv_admin_token', token, { req, res, httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 })
  return res.status(200).json({ ok: true })
}

