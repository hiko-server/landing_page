import { withApi } from '../../../lib/apiHandler'
import { allowRead, setGhCache } from '../../../lib/github'
import { githubContext, loadEvents, noProfileSummary, type GhEventsPayload } from '../../../lib/githubData'

/**
 * GET /api/github/events — recent public activity (up to 30 slim events;
 * the most recently pushed repositories when the 90-day feed is empty).
 * `available: false` = GitHub unreachable; `events: []` with
 * `available: true` = genuinely none (or no profile linked).
 */
export default withApi('github/events', async (req, res, ctx) => {
  if (!allowRead(req, res)) return
  try {
    const { user } = githubContext()
    if (!user) {
      setGhCache(res, true, 300)
      return res.status(200).json(noProfileSummary().events)
    }
    const data = await loadEvents(user)
    setGhCache(res, data.available, 300)
    return res.status(200).json(data)
  } catch (err) {
    ctx.log.warn('GitHub events unavailable', { err })
    const unavailable: GhEventsPayload = { events: [], available: false }
    setGhCache(res, false)
    return res.status(200).json(unavailable)
  }
})
