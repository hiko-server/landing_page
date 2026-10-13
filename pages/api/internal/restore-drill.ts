import { withApi } from '../../../lib/apiHandler'
import { isInternalJobRequest } from '../../../lib/internalJobs'
import { compileMdx } from '../../../lib/mdx'
import { DrillBusyError, runRestoreDrill } from '../../../lib/restoreDrill'

/**
 * POST /api/internal/restore-drill — the scheduled restore drill
 * (lib/restoreDrill.ts startRestoreDrillSchedule), called by this server on
 * itself: loopback only, with the per-process token (lib/internalJobs.ts).
 * Everyone else gets a plain 404, as if the route did not exist.
 */
export default withApi('internal/restore-drill', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST' || !isInternalJobRequest(req))
    return res.status(404).json({ error: 'Not found' })
  try {
    const drill = await runRestoreDrill('scheduled', (body) => compileMdx(body))
    return res.status(200).json({ drill })
  } catch (err) {
    if (err instanceof DrillBusyError) return res.status(409).json({ error: err.message })
    throw err
  }
})
