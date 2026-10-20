import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { getGoalsExplore } from '../../../lib/analytics/goalsQuery'
import { parseExploreQuery } from '../../../lib/analytics/exploreShared'

/**
 * GET /api/admin/goals — the admin Analytics panel's goal events
 * (lib/analytics/goalsQuery) for an explore view (the parameters of
 * /api/admin/analytics: period, from, to, compare, f — or the earlier
 * range=7d|30d|12m): per goal the events, visitor-days, conversion rate and
 * the change vs the previous period; the Source → CV → Download conversion
 * over the raw window (35 days at most; `source` = a referrer host, empty =
 * every visitor); the paths that led to a goal (`goal`, cv_download by
 * default); and the ⌘K searches that found nothing (35 days at most).
 * Admin only, never cached.
 */
export default withApi('admin/goals', (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  return res
    .status(200)
    .json(getGoalsExplore(parseExploreQuery(req.query), { source: first(req.query.source) ?? null, goal: first(req.query.goal) ?? null }))
})
