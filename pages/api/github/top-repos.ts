import { withApi } from '../../../lib/apiHandler'
import { allowRead, setGhCache } from '../../../lib/github'
import { githubContext, loadRepoChoices, loadTopRepos, noProfileSummary, type GhTopRepos } from '../../../lib/githubData'

/**
 * GET /api/github/top-repos — the owner's featured repositories first (home
 * `openSource.featured`, in their order, with blurbs), then the rest of their
 * own work by stars / recency, six in all.
 *
 * GET /api/github/top-repos?all=1 — every public non-fork repository as
 * `{name, description, language, stargazers_count, pushed_at}` for the admin
 * featured-repo picker.
 *
 * `available: false` = GitHub unreachable; `repos: []` with
 * `available: true` = genuinely none (or no profile linked).
 */
export default withApi('github/top-repos', async (req, res, ctx) => {
  if (!allowRead(req, res)) return
  const all = req.query.all === '1'
  try {
    const { home, user } = githubContext()
    if (!user) {
      setGhCache(res, true, 300)
      return res.status(200).json(all ? { repos: [], available: true } : noProfileSummary().topRepos)
    }
    const data = all ? await loadRepoChoices(user) : await loadTopRepos(user, home)
    setGhCache(res, data.available, 600)
    return res.status(200).json(data)
  } catch (err) {
    ctx.log.warn('GitHub repositories unavailable', { err, all })
    const unavailable: GhTopRepos = { repos: [], available: false }
    setGhCache(res, false)
    return res.status(200).json(unavailable)
  }
})
