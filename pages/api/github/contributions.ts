import { withApi } from '../../../lib/apiHandler'
import { allowRead } from '../../../lib/github'
import { githubContext, loadContributions, type GhContributions } from '../../../lib/githubData'

const CACHE_OK = 'public, s-maxage=3600, stale-while-revalidate=86400'
/** An outage answer is not pinned for the full hour, so a retry can recover. */
const CACHE_UNAVAILABLE = 'public, max-age=15, s-maxage=30'

/**
 * GET /api/github/contributions — the last year's contribution calendar:
 * `{available: true, total, weeks: [{days: [{date, count, level 0–4}]}]}`
 * (GraphQL with GITHUB_TOKEN, else the public calendar API, server-side), or
 * `{available: false}` with status 200 when it cannot be loaded or no GitHub
 * profile is linked. Cached in memory for an hour.
 */
export default withApi('github/contributions', async (req, res, ctx) => {
  if (!allowRead(req, res)) return
  let data: GhContributions = { available: false }
  try {
    const { user } = githubContext()
    if (user) data = await loadContributions(user)
  } catch (err) {
    ctx.log.warn('GitHub contributions unavailable', { err })
  }
  res.setHeader('Cache-Control', data.available ? CACHE_OK : CACHE_UNAVAILABLE)
  return res.status(200).json(data)
})
