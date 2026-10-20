import { withApi } from '../../../../lib/apiHandler'
import { isAdminRequest } from '../../../../lib/auth'
import { rateLimit } from '../../../../lib/rateLimit'
import { recordAdminAudit } from '../../../../lib/audit/record'
import { digestStatus, sendDigest, setDigestEnabled } from '../../../../lib/analytics/digest'

/**
 * The weekly analytics digest (lib/analytics/digest), admin only:
 *
 *   GET                         → status: SMTP set?, the (masked) recipient,
 *                                 on/off, schedule, last sent, last error, next
 *   PUT  { enabled: boolean }   → switch it on or off → status
 *   POST { action: 'send' }     → send last week's digest now, as a preview
 *                                 → 200 { ok, skipped?, error?, status } (a
 *                                 refused or unreachable mail server is
 *                                 ok: false with the error, not a 5xx)
 *
 * Never cached. Changes and previews are recorded in the activity log.
 */
export default withApi('admin/analytics/digest', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })

  if (req.method === 'GET') return res.status(200).json(digestStatus())

  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}

  if (req.method === 'PUT') {
    if (typeof body.enabled !== 'boolean') return res.status(400).json({ error: 'Expected { enabled: true | false }' })
    setDigestEnabled(body.enabled)
    recordAdminAudit(req, res, {
      action: body.enabled ? 'analytics.digest-on' : 'analytics.digest-off',
      area: 'system',
      target: 'weekly digest',
      summary: body.enabled ? 'Turned on the weekly analytics digest' : 'Turned off the weekly analytics digest',
    })
    return res.status(200).json(digestStatus())
  }

  if (req.method === 'POST') {
    if (body.action !== 'send') return res.status(400).json({ error: 'Expected { action: "send" }' })
    const rl = rateLimit(req, 5, 10 * 60 * 1000, 'admin-analytics-digest')
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))))
      return res.status(429).json({ error: 'Too many previews in a short time — try again in a few minutes' })
    }
    const outcome = await sendDigest('manual')
    if (outcome.ok) {
      recordAdminAudit(req, res, {
        action: 'analytics.digest-preview',
        area: 'system',
        target: `week of ${outcome.week}`,
        summary: 'Sent a preview of the weekly analytics digest',
      })
    }
    // The request worked whatever the mail server said: the outcome is in the body.
    return res.status(200).json({ ...outcome, status: digestStatus() })
  }

  res.setHeader('Allow', 'GET, PUT, POST')
  return res.status(405).json({ error: 'Method not allowed' })
})
