import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { getGoalsReport } from '../../../lib/analytics/goalsQuery'
import { parseRange } from '../../../lib/analytics/shared'

/**
 * GET /api/admin/goals?range=7d|30d|12m&source=<referrer host> — the admin
 * Analytics panel's goal events (lib/analytics/goalsQuery): per goal the
 * events, visitor-days, conversion rate and the change vs the previous
 * period; the Source → CV → Download conversion over the raw window (35
 * days at most; `source` empty = every visitor); and the ⌘K searches that
 * found nothing (35 days at most). Admin only, never cached.
 */
export default withApi('admin/goals', (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  return res.status(200).json(getGoalsReport(parseRange(first(req.query.range)), first(req.query.source) ?? null))
})
