import { withApi } from '../../../lib/apiHandler'
import {
  checkIfMatch,
  isPageName,
  mdxProblem,
  readPage,
  versionEtag,
  writePage,
} from '../../../lib/mdx-admin'
import { rateLimit } from '../../../lib/rateLimit'
import { isAdminRequest } from '../../../lib/auth'
import { sendVersionedJson } from '../../../lib/http'
import { pageRevalidatePaths, revalidatePaths } from '../../../lib/revalidate'
import { ensurePosters } from '../../../lib/videoPoster'

/**
 * Admin CRUD for the single MDX pages (/now, /uses, the /about bio and the
 * Chinese bio of /zh/about — lib/pageNames).
 *
 *   GET /api/admin/page?name=now  → { name, frontmatter, body, updatedAt }, ETag = its version
 *   PUT /api/admin/page           → { name, frontmatter, body } write; optional If-Match
 *                                   (409 VERSION_CONFLICT); the body must compile
 *                                   (422 MDX_INVALID). An empty body switches /now
 *                                   and /uses back to their automatic version and
 *                                   takes the bio off /about.
 *
 * Snapshots into data/page_snapshots/ on every write; the public page is
 * regenerated immediately and the response lists it under `revalidated`.
 */
export default withApi('admin/page', async (req, res) => {
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET') {
    const name = req.query.name
    if (!isPageName(name)) return res.status(400).json({ error: 'Invalid page name' })
    const page = readPage(name)
    return sendVersionedJson(res, 200, page, versionEtag(page.updatedAt))
  }

  if (req.method === 'PUT') {
    const rl = rateLimit(req, 30, 10 * 60 * 1000)
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
    if (!rl.allowed) return res.status(429).json({ error: 'Too many writes, try later' })
    const { name, frontmatter, body } = (req.body || {}) as {
      name?: unknown
      frontmatter?: unknown
      body?: unknown
    }
    if (!isPageName(name)) return res.status(400).json({ error: 'Invalid page name' })
    if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter))
      return res.status(400).json({ error: 'Missing frontmatter' })
    const fm = frontmatter as Record<string, any>
    if (!fm.title) return res.status(400).json({ error: 'frontmatter.title required' })
    if (body !== undefined && typeof body !== 'string') return res.status(400).json({ error: 'body must be a string' })
    const text = body || ''

    if (text.trim()) {
      const problem = await mdxProblem(text)
      if (problem) return res.status(422).json(problem)
      await ensurePosters(text)
    }

    if (!checkIfMatch(req, res, readPage(name).updatedAt)) return
    const result = await writePage(name, fm, text)
    if (!result.ok) return res.status(400).json({ error: result.error })
    const etag = versionEtag(readPage(name).updatedAt)
    // /now, /uses, /about and /zh/about are statically generated: regenerate the edited one now
    // (the Chinese bio publishes /zh/about: /about and the Chinese pages follow, lib/revalidate).
    const paths = pageRevalidatePaths(name)
    const failed = await revalidatePaths(res, paths)
    return sendVersionedJson(
      res,
      200,
      {
        ...result,
        etag,
        revalidated: paths.filter((p) => !failed.includes(p)),
        ...(failed.length ? { revalidateFailed: failed } : {}),
      },
      etag,
    )
  }

  res.setHeader('Allow', 'GET,PUT')
  return res.status(405).json({ error: 'Method not allowed' })
})

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } }
