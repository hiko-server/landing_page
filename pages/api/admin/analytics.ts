import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { getAnalyticsReport } from '../../../lib/analytics/query'
import { parseRange } from '../../../lib/analytics/shared'

/**
 * GET /api/admin/analytics?range=7d|30d|12m (default 30d) — the admin
 * Analytics report (lib/analytics/query): KPIs with deltas vs the previous
 * period, a daily (monthly for 12m) series, top pages / referrers /
 * countries / devices / browsers, live visitors (last 5 min) and Web Vitals
 * p75 per route × metric over 7 and 28 days. Admin only, never cached.
 */
export default withApi('admin/analytics', (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const range = parseRange(Array.isArray(req.query.range) ? req.query.range[0] : req.query.range)
  return res.status(200).json(getAnalyticsReport(range))
})
