import type { NextApiRequest, NextApiResponse } from 'next'
import { consumeResetToken, ensureAdminFromEnv, readAdmin, updatePassword } from '../../../lib/admin'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
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

