import type { NextApiRequest, NextApiResponse } from 'next'
import { createResetToken, ensureAdminFromEnv, normalizeEmail, readAdmin } from '../../../lib/admin'
import { sendMail, siteUrl } from '../../../lib/mailer'
import { rateLimit } from '../../../lib/rateLimit'

/**
 * POST /api/auth/request-reset { email }
 *
 * Always answers `{ ok: true }` — for unknown addresses, for the real one,
 * and when the outstanding-link cap (lib/admin createResetToken) is reached —
 * and never waits for SMTP, so neither the body nor the timing reveals
 * whether the address is the admin account.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  const email = normalizeEmail((req.body || {}).email)
  if (!email || email.length > 254) return res.status(400).json({ error: 'Missing email' })
  const rl = rateLimit(req, 5, 10 * 60 * 1000)
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests, try later' })
  ensureAdminFromEnv()
  const admin = readAdmin()
  if (!admin || normalizeEmail(admin.email) !== email) {
    return res.status(200).json({ ok: true })
  }
  const issued = createResetToken()
  if (issued) {
    const url = `${siteUrl()}/admin/reset?token=${issued.token}`
    // Fire and forget: awaiting SMTP would make the real address measurably
    // slower than an unknown one. Failures are logged, never surfaced.
    sendMail({ to: admin.email, subject: 'Password Reset', text: `Reset your password: ${url}\nExpires in 30 minutes.` }).catch(
      (err) => console.error('request-reset: sendMail failed', err instanceof Error ? err.message : err),
    )
  }
  return res.status(200).json({ ok: true })
}
