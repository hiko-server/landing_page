import { withApi } from '../../../lib/apiHandler'
import { allowRead, setGhCache } from '../../../lib/github'
import { githubContext, loadStats, noProfileSummary, type GhStats } from '../../../lib/githubData'

/**
 * GET /api/github/stats — the Open Source tiles: public repos, contributions
 * in the last year, language count, plus followers / total stars when the
 * owner opted in (`showVanity`). `available: false` = GitHub unreachable
 * (the UI shows an error state, never zeros); `user: ''` with
 * `available: true` = no GitHub profile linked.
 */
export default withApi('github/stats', async (req, res, ctx) => {
  if (!allowRead(req, res)) return
  try {
    const { home, user } = githubContext()
    if (!user) {
      setGhCache(res, true, 300)
      return res.status(200).json(noProfileSummary().stats)
    }
    const data = await loadStats(user, home)
    setGhCache(res, data.available, 1800)
    return res.status(200).json(data)
  } catch (err) {
    ctx.log.warn('GitHub stats unavailable', { err })
    const unavailable: GhStats = {
      user: '',
      public_repos: 0,
      followers: 0,
      total_stars: 0,
      languages: null,
      contributions: null,
      showVanity: false,
      available: false,
    }
    setGhCache(res, false)
    return res.status(200).json(unavailable)
  }
})
