import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { getDimensionValues, getExploreReport } from '../../../lib/analytics/explore'
import { isExploreDimension, parseExploreQuery } from '../../../lib/analytics/exploreShared'

/**
 * GET /api/admin/analytics — the admin Analytics explore report
 * (lib/analytics/explore): KPIs with deltas vs the previous period, the
 * series (and the previous period's with compare=1), top pages / referrers /
 * countries / devices / browsers / page languages, publish marks, live
 * visitors, Web Vitals p75 and their attribution over 7 and 28 days, and —
 * with one page chosen — that page's goals.
 *
 *   ?period=7d|30d|…|custom&from=&to=&compare=1&f=<dim>:<is|not>:<value>
 *   ?range=7d|30d|12m                 the earlier form (still answered)
 *   ?values=<dimension>               the values to offer in the filter
 *                                     picker for the same view: { dim, values }
 *
 * Admin only, never cached.
 */
export default withApi('admin/analytics', (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const query = parseExploreQuery(req.query)
  const values = Array.isArray(req.query.values) ? req.query.values[0] : req.query.values
  if (values !== undefined) {
    if (!isExploreDimension(values)) return res.status(400).json({ error: 'Unknown dimension' })
    return res.status(200).json({ dim: values, values: getDimensionValues(query, values) })
  }
  return res.status(200).json(getExploreReport(query))
})
