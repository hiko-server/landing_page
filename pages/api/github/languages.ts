import { withApi } from '../../../lib/apiHandler'
import { allowRead, setGhCache } from '../../../lib/github'
import { githubContext, loadLanguages, noProfileSummary, type GhLanguages } from '../../../lib/githubData'

/**
 * GET /api/github/languages — bytes per language across the owner's top 30
 * public non-fork repositories. `available: false` = GitHub unreachable;
 * `total: 0` with `available: true` = genuinely none (or no profile linked).
 */
export default withApi('github/languages', async (req, res, ctx) => {
  if (!allowRead(req, res)) return
  try {
    const { user } = githubContext()
    if (!user) {
      setGhCache(res, true, 300)
      return res.status(200).json(noProfileSummary().languages)
    }
    const data = await loadLanguages(user)
    setGhCache(res, data.available, 3600)
    return res.status(200).json(data)
  } catch (err) {
    ctx.log.warn('GitHub languages unavailable', { err })
    const unavailable: GhLanguages = { total: 0, breakdown: {}, available: false }
    setGhCache(res, false)
    return res.status(200).json(unavailable)
  }
})
