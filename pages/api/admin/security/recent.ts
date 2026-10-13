import { withApi } from '../../../../lib/apiHandler'
import { readAdminContext } from '../../../../lib/auth'
import { hasRecentAuth, recentAuthWindowMs, stepUpMethods } from '../../../../lib/adminAuth/stepUp'

/**
 * GET /api/admin/security/recent → { recent, recentUntil, methods, recoveryRequired, windowMinutes }
 *
 * Asked by the admin right before a dangerous action, so the "Confirm it's
 * you" dialog opens first instead of after a 403 (which the browser would log
 * as a failed request). The action's route still enforces the rule itself
 * (lib/adminAuth/stepUp.ts requireRecentAuth).
 */
export default withApi('admin/security/recent', (req, res) => {
  const ctx = readAdminContext(req, res)
  if (!ctx) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  const windowMs = recentAuthWindowMs()
  const recent = hasRecentAuth(ctx)
  return res.status(200).json({
    recent,
    recentUntil: recent && ctx.session ? ctx.session.verifiedAt + windowMs : null,
    ...stepUpMethods(),
    windowMinutes: windowMs / 60_000,
  })
})
