import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { rateLimit } from '../../../lib/rateLimit'
import { compileMdx } from '../../../lib/mdx'
import { DrillBusyError, listRestoreDrills, restoreDrillSchedule, runRestoreDrill } from '../../../lib/restoreDrill'

/**
 * Restore drills (lib/restoreDrill.ts), admin only, never cached:
 *
 *   GET  → { drills: [newest first, ≤ 10], schedule }
 *   POST → { drill }   run one now (409 while a drill, backup or restore runs)
 *
 * A drill only reads the snapshot into a scratch directory; it never touches
 * the live site, so it needs no recent re-verification.
 */
export default withApi('admin/restore-drill', async (req, res, ctx) => {
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET') {
    return res.status(200).json({ drills: listRestoreDrills(10), schedule: restoreDrillSchedule() })
  }
  if (req.method === 'POST') {
    const rl = rateLimit(req, 6, 60 * 60_000, 'admin:restore-drill')
    if (!rl.allowed) return res.status(429).json({ error: 'Six drills an hour is the limit — try again later.' })
    try {
      const drill = await runRestoreDrill('manual', (body) => compileMdx(body))
      return res.status(200).json({ drill })
    } catch (err) {
      if (err instanceof DrillBusyError) return res.status(409).json({ error: err.message })
      ctx.log.error('restore drill crashed', { err })
      return res.status(500).json({ error: 'The drill could not run; the error is in the System panel.' })
    }
  }
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
})
