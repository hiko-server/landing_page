import type { NextApiRequest, NextApiResponse } from 'next'
import { createResetToken, ensureAdminFromEnv, readAdmin } from '../../../lib/admin'
import { sendMail, siteUrl } from '../../../lib/mailer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { email } = req.body || {}
  if (!email) return res.status(400).json({ error: 'Missing email' })
  ensureAdminFromEnv()
  const admin = readAdmin()
  if (!admin || admin.email !== email) {
    // do not leak existence
    return res.status(200).json({ ok: true })
  }
  const { token } = createResetToken()
  const url = `${siteUrl()}/admin/reset?token=${token}`
  await sendMail({ to: email, subject: 'Password Reset', text: `Reset your password: ${url}\nExpires in 30 minutes.` })
  return res.status(200).json({ ok: true })
}
