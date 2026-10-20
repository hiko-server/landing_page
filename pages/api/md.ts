import crypto from 'crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { withApi } from '../../lib/apiHandler'
import { sendNotModified, sendVersionedBody } from '../../lib/http'
import { absUrl } from '../../lib/schema'
import { loadMarkdownTwin } from '../../lib/llms'
import { MARKDOWN_CACHE_CONTROL } from '../../lib/markdownTwinPaths'

/**
 * GET|HEAD /api/md?collection=blog|work&slug=<slug> — the Markdown twin of
 * a published post or case study (G9). Public URLs (next.config.js
 * rewrites): /blog/<slug>.md and /work/<slug>.md.
 *
 *   - published items only: a draft, an unknown or a malformed slug is a 404;
 *   - `Link: <…/blog/<slug>>; rel="canonical"` and `X-Robots-Tag: noindex`:
 *     the HTML page stays the one search engines index;
 *   - `Content-Language` is the piece's language;
 *   - an ETag over the Markdown (304 on a match) and five minutes at the
 *     edge; every save of a post or case study purges the twin with its
 *     page (lib/revalidate derivedPurgePaths).
 */
export default withApi('md', async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const collection = req.query.collection
  const slug = typeof req.query.slug === 'string' ? req.query.slug : ''
  if (collection !== 'blog' && collection !== 'work') return res.status(400).json({ error: 'Use collection=blog|work' })

  const twin = loadMarkdownTwin(collection, slug)
  if (!twin) {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('X-Robots-Tag', 'noindex')
    res.statusCode = 404
    return res.end(req.method === 'HEAD' ? undefined : 'Not found\n')
  }

  const body = Buffer.from(twin.markdown, 'utf8')
  const etag = `"md-${crypto.createHash('sha1').update(body).digest('base64url').slice(0, 27)}"`
  res.setHeader('Cache-Control', MARKDOWN_CACHE_CONTROL)
  res.setHeader('Vary', 'Accept-Encoding')
  res.setHeader('Content-Language', twin.lang)
  res.setHeader('Link', `<${absUrl(twin.permalink)}>; rel="canonical"`)
  res.setHeader('X-Robots-Tag', 'noindex')
  if (twin.updatedAt > 0) res.setHeader('Last-Modified', new Date(twin.updatedAt).toUTCString())

  const inm = req.headers['if-none-match']
  const tags = (Array.isArray(inm) ? inm.join(',') : inm || '').split(',').map((t) => t.trim().replace(/^W\//, ''))
  if (tags.includes(etag) || tags.includes('*')) return sendNotModified(res, etag)

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
  return sendVersionedBody(res, 200, body, etag, req.method === 'HEAD')
})
