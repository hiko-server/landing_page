import type { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
import { setCookie } from 'cookies-next'

const ADMIN_USER = process.env.ADMIN_USER || 'admin'
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.NEXT_PUBLIC_ADMIN_PASS || ''
const JWT_SECRET = process.env.JWT_SECRET || 'change-me'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' })
  if (username !== ADMIN_USER || password !== ADMIN_PASS) return res.status(401).json({ error: 'Invalid credentials' })

  const token = jwt.sign({ sub: 'cv-admin', role: 'admin' }, JWT_SECRET, { expiresIn: '7d' })
  setCookie('cv_admin_token', token, { req, res, httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 })
  res.status(200).json({ ok: true })
}

