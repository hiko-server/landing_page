import type { NextApiRequest, NextApiResponse } from 'next'
import { isAdminRequest } from '../../../lib/auth'
import { sendMail } from '../../../lib/mailer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  // The proxy gates /api/admin/* too; this is the route's own session check (lib/auth.ts).
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')
  try {
    const to = process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL || process.env.SMTP_USER
    if (!to) return res.status(400).json({ error: 'No recipient configured (NOTIFY_EMAIL/ADMIN_EMAIL/SMTP_USER)' })
    const result = await sendMail({ to, subject: 'Test email from admin dashboard', text: 'This is a test email.' })
    if (result.skipped) return res.status(200).json({ ok: false, skipped: true, message: 'SMTP not configured; skipped send' })
    return res.status(200).json({ ok: true })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Send failed' })
  }
}
