import { withApi } from '../../../lib/apiHandler'
import { isInternalJobRequest } from '../../../lib/internalJobs'
import { LinkCheckBusyError, runLinkCheck } from '../../../lib/contentHealth/linkRunner'

/**
 * POST /api/internal/content-health — the daily external-link check
 * (lib/contentHealth/schedule.ts), called by this server on itself: loopback
 * only, with the per-process token (lib/internalJobs.ts). Waits for the run
 * (it has an 8-minute budget) and answers its summary; 409 while "Check
 * links now" is running. Everyone else gets a plain 404.
 */
export default withApi('internal/content-health', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST' || !isInternalJobRequest(req))
    return res.status(404).json({ error: 'Not found' })
  try {
    const run = await runLinkCheck('scheduled')
    return res.status(200).json({ run })
  } catch (err) {
    if (err instanceof LinkCheckBusyError) return res.status(409).json({ error: err.message })
    throw err
  }
})
