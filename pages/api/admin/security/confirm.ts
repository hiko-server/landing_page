import { withApi } from '../../../../lib/apiHandler'
import { recentAuthWindowMs, requireRecentAuth } from '../../../../lib/adminAuth/stepUp'

/**
 * POST /api/admin/security/confirm → { ok, recentUntil } — changes nothing;
 * answers 403 STEP_UP_REQUIRED unless this browser verified recently. The
 * Security page's "Confirm it's me now" uses it to verify ahead of a batch
 * of dangerous actions.
 */
export default withApi('admin/security/confirm', (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  const ctx = requireRecentAuth(req, res)
  if (!ctx) return
  return res.status(200).json({ ok: true, recentUntil: (ctx.session?.verifiedAt ?? Date.now()) + recentAuthWindowMs() })
})
