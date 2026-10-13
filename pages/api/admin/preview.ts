import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { rateLimit } from '../../../lib/rateLimit'
import { compileForAdmin } from '../../../lib/mdx-admin'

/**
 * POST /api/admin/preview { body } — compile an unsaved MDX body with the
 * public renderer and return what the article page would render:
 *
 *   200 { tree, toc }  (hast tree for <ArticleBody tree toc />)
 *   422 { code:'MDX_INVALID', line, column, reason, error }
 *
 * Used by the editors' live preview (debounced) and as the dry run behind
 * the Publish checklist. Nothing is stored. Admin-only (middleware gate plus
 * the session check here), rate-limited per client.
 */
export default withApi('admin/preview', async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')
  const rl = rateLimit(req, 120, 10 * 60 * 1000)
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))))
    return res.status(429).json({ error: 'Too many previews, try again shortly' })
  }
  const body = (req.body || {}).body
  if (typeof body !== 'string') return res.status(400).json({ error: 'body must be a string' })

  const out = await compileForAdmin(body)
  if (!out.ok) return res.status(422).json(out.problem)
  return res.status(200).json({ tree: out.tree, toc: out.toc })
})

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } }
