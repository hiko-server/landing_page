import { withApi } from '../../../lib/apiHandler'
import { isInternalJobRequest } from '../../../lib/internalJobs'
import { recordAdminAudit } from '../../../lib/audit/record'
import { mdxProblem, refreshCollection } from '../../../lib/mdx-admin'
import { ScheduleBusyError, runDueSchedules } from '../../../lib/schedule/run'
import { rearmPublishScheduler } from '../../../lib/schedule/scheduler'

/**
 * POST /api/internal/scheduled-publish — one pass of scheduled publishing
 * (H5, lib/schedule/run), called by this server on itself
 * (lib/schedule/scheduler; loopback only, with the per-process token —
 * lib/internalJobs). Every due draft, pending revision and unpublish runs;
 * its pages, feeds and sitemap are regenerated / purged like an admin save
 * (refreshCollection), and each action is recorded in the activity log with
 * the scheduler as the actor. 409 while another pass runs. Everyone else
 * gets a plain 404.
 */
export default withApi('internal/scheduled-publish', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST' || !isInternalJobRequest(req)) return res.status(404).json({ error: 'Not found' })
  try {
    const out = await runDueSchedules({
      refresh: (collection, slug, previousKeys) => refreshCollection(res, collection, slug, previousKeys),
      record: (entry, snapshots) => {
        recordAdminAudit(req, res, entry, { actor: 'scheduler', snapshots, route: 'internal/scheduled-publish' })
      },
      compile: async (body) => {
        const problem = await mdxProblem(body)
        return problem ? { error: problem.error } : null
      },
    })
    return res.status(200).json(out)
  } catch (err) {
    if (err instanceof ScheduleBusyError) return res.status(409).json({ error: err.message })
    throw err
  } finally {
    // A pass may leave a later slot (a window's end) or a retry: wake for it.
    rearmPublishScheduler()
  }
})
