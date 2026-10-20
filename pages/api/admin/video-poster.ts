import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { rateLimit } from '../../../lib/rateLimit'
import { parseVideoUrl } from '../../../lib/videoUrl'
import { findPoster } from '../../../lib/videoPoster'

/**
 * GET /api/admin/video-poster?url=<YouTube / Vimeo URL> — the poster the
 * site has stored for a video, for the visual editor's video block:
 *
 *   200 { poster: { src, width, height } }   stored in /uploads
 *   200 { poster: null }                     not imported yet (it is when the article is saved)
 *   400                                      not a YouTube / Vimeo link
 *
 * Read-only: it never imports or contacts YouTube / Vimeo (lib/videoPoster
 * findPoster only looks in /uploads). Admin only, rate-limited.
 */
export default withApi('admin/video-poster', async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')
  const rl = rateLimit(req, 300, 10 * 60 * 1000, 'video-poster')
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests, try later' })

  const url = typeof req.query.url === 'string' ? req.query.url.trim() : ''
  const ref = url.length <= 2048 ? parseVideoUrl(url) : null
  if (!ref) return res.status(400).json({ error: 'url must be a YouTube or Vimeo link' })
  const poster = findPoster(ref)
  return res.status(200).json({ poster: poster ? { src: poster.src, width: poster.width, height: poster.height } : null })
})
