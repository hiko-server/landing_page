import { withApi } from '../../lib/apiHandler'
import { buildSearchIndex } from '../../lib/searchIndex'

/**
 * GET /api/search-index → { v: 1, availability?: { bookingUrl? }, docs: SearchDoc[] }
 *
 * The public index the ⌘K palette searches (lib/searchIndex.ts): published
 * posts and case studies, /now and /uses, and the public website CV.
 * Built from public data only; cached at the edge for 5 minutes and served
 * stale for a day while it refreshes. Next gzips the JSON.
 */
export default withApi('search-index', async (req, res, ctx) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const started = Date.now()
  const index = buildSearchIndex()
  ctx.log.debug('search index built', { docs: index.docs.length, ms: Date.now() - started })
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400')
  return res.status(200).json(index)
})
