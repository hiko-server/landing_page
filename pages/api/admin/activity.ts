import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { activityPage } from '../../../lib/audit/activity'

/**
 * GET /api/admin/activity?area=&q=&before=&limit= — the Activity view (admin
 * only, never cached): who changed what and when, newest first, merged with
 * sign-ins (lib/audit/activity). `before` is the `nextBefore` cursor of the
 * previous page.
 *
 *   → { items, nextBefore, areas: { <area>: count over 30 days }, keepDays }
 */

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''

export default withApi('admin/activity', (req, res) => {
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const before = Number(one(req.query.before))
  const limit = Number(one(req.query.limit))
  try {
    return res.status(200).json(
      activityPage({
        area: one(req.query.area) || null,
        q: one(req.query.q).slice(0, 80) || null,
        before: Number.isFinite(before) && before > 0 ? before : null,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 50,
      }),
    )
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Could not read the activity log' })
  }
})
