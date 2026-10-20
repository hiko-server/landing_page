import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { scheduledEntries } from '../../../lib/schedule/store'
import { publishSchedulerStatus } from '../../../lib/schedule/scheduler'

/**
 * GET /api/admin/publishing — what is scheduled (H5): every draft, set of
 * pending changes and unpublish with its time, soonest first (overdue ones
 * included until the scheduler's next pass), and the scheduler's state in
 * this process (next wake-up, last pass). Read-only; the times are changed
 * from the editors (POST /api/admin/posts|work { action: 'schedule' }).
 */
export default withApi('admin/publishing', async (req, res) => {
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  return res.status(200).json({ now: Date.now(), scheduled: scheduledEntries(), scheduler: publishSchedulerStatus() })
})
