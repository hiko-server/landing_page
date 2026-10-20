import { withApi } from '../../lib/apiHandler'
import { searchIndexPayload } from '../../lib/searchIndex'

/**
 * GET /api/search-index → { v: 2, availability?: { bookingUrl? }, subject?: string[], docs: SearchDoc[], ask: AskIndex }
 *
 * The public index the ⌘K palette searches and "Ask" quotes from
 * (lib/searchIndex.ts, lib/askIndex.ts): published posts and case studies,
 * /now and /uses, the /about bio, the public CV in English and Chinese — and
 * the passages "Ask" answers with. Built from public data only, once per
 * content version (every save marks it stale, lib/revalidate.ts) and reused
 * in between; at the edge it is cached for 5 minutes and served stale for a
 * day while it refreshes (every save purges it too). Next adds the ETag
 * (a browser revalidates with a 304) and gzips the JSON.
 */
export default withApi('search-index', async (req, res, ctx) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const started = Date.now()
  const payload = await searchIndexPayload()
  ctx.log.debug('search index served', { docs: payload.docs, passages: payload.passages, generation: payload.generation, ms: Date.now() - started })
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  return res.status(200).send(payload.body)
})
