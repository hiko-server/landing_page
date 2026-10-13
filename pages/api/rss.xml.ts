import { withApi } from '../../lib/apiHandler'
import { buildBlogRss } from '../../lib/feedHtml'
import { SITE_URL } from '../../lib/schema'
import { FEED_CACHE_CONTROL } from '../../lib/feeds'

/**
 * RSS 2.0 feed for the blog at /api/rss.xml (same document as /feed.xml).
 * Escaping and full-content rendering live in lib/feedHtml.ts.
 */
export default withApi('rss.xml', async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const xml = await buildBlogRss(SITE_URL, `${SITE_URL}/api/rss.xml`)
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', FEED_CACHE_CONTROL)
  res.status(200).send(xml)
})
