import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { sendMail } from '../../../lib/mailer'
import { checkFromAlignment, checkReplyAlignment, notificationFrom } from '../../../lib/mailAlignment'

/**
 * POST /api/admin/test-mail — send a test e-mail to NOTIFY_EMAIL /
 * ADMIN_EMAIL / SMTP_USER (admin only).
 *
 *   → { ok: true, alignment }            sent
 *   → { ok: false, skipped: true }       SMTP not configured
 *   → 500 { error, alignment }           the server refused it
 *
 * `alignment` warns before mail goes missing: { notifications, replies },
 * each a DMARC verdict (lib/mailAlignment) for the address that kind of mail
 * is sent From — notifications From FROM_EMAIL, Inbox replies From the SMTP
 * account's own address (or REPLY_FROM_EMAIL).
 */
export default withApi('admin/test-mail', async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  // The proxy gates /api/admin/* too; this is the route's own session check (lib/auth.ts).
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')
  const alignment = await Promise.all([checkFromAlignment(notificationFrom()), checkReplyAlignment()])
    .then(([notifications, replies]) => ({ notifications, replies }))
    .catch(() => ({ notifications: null, replies: null }))
  try {
    const to = process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL || process.env.SMTP_USER
    if (!to) return res.status(400).json({ error: 'No recipient configured (NOTIFY_EMAIL/ADMIN_EMAIL/SMTP_USER)' })
    const result = await sendMail({ to, subject: 'Test email from admin dashboard', text: 'This is a test email.' })
    if (result.skipped) return res.status(200).json({ ok: false, skipped: true, message: 'SMTP not configured; skipped send' })
    return res.status(200).json({ ok: true, alignment })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Send failed', alignment })
  }
})
