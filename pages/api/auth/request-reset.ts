import type { NextApiRequest, NextApiResponse } from 'next'
import { createResetToken, ensureAdminFromEnv, readAdmin } from '../../../lib/admin'
import { sendMail, siteUrl } from '../../../lib/mailer'
import { rateLimit } from '../../../lib/rateLimit'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { email } = req.body || {}
  if (!email) return res.status(400).json({ error: 'Missing email' })
  const rl = rateLimit(req, 5, 10 * 60 * 1000)
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests, try later' })
  ensureAdminFromEnv()
  const admin = readAdmin()
  if (!admin || admin.email !== email) {
    // do not leak existence
    return res.status(200).json({ ok: true })
  }
  const { token } = createResetToken()
  const url = `${siteUrl()}/admin/reset?token=${token}`
  try {
    await sendMail({ to: email, subject: 'Password Reset', text: `Reset your password: ${url}\nExpires in 30 minutes.` })
  } catch (err) {
    // Swallow SMTP failures: surfacing them would both leak that this address
    // is a real admin account and turn a mail outage into an uncontrolled 500.
    console.error('request-reset: sendMail failed', err)
  }
  return res.status(200).json({ ok: true })
}
