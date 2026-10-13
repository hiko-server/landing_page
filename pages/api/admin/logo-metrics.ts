import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { rateLimit } from '../../../lib/rateLimit'
import { measureLogo } from '../../../lib/logoMetrics'
import { RemoteImageError } from '../../../lib/remoteImage'

/**
 * GET /api/admin/logo-metrics?src=<image URL> — measure one brand logo for
 * the Home editor's live preview, before the document is saved:
 *
 *   200 { metrics: { aspect, density, crop, source, hash? } }
 *   200 { metrics: null, reason }   nothing inked, not found, or not an image
 *
 * The same measurement PUT /api/home stores (lib/logoMetrics.ts): site files
 * and uploads from disk / R2, remote https images through safeFetch (public
 * hosts only, size and time limits, raster formats only). Admin only,
 * read-only, rate-limited (each call may fetch a remote image).
 */
export default withApi('admin/logo-metrics', async (req, res, ctx) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')
  const rl = rateLimit(req, 120, 10 * 60 * 1000, 'logo-metrics')
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests, try later' })

  const src = typeof req.query.src === 'string' ? req.query.src.trim() : ''
  if (!src || src.length > 2048) return res.status(400).json({ error: 'src must be an image URL' })
  if (!src.startsWith('/') && !/^https:\/\//i.test(src)) {
    return res.status(400).json({ error: 'src must be a site path or an https:// URL' })
  }

  try {
    const metrics = await measureLogo(src)
    return res.status(200).json(metrics ? { metrics } : { metrics: null, reason: 'The image was not found or has no visible content.' })
  } catch (err) {
    if (err instanceof RemoteImageError) return res.status(200).json({ metrics: null, reason: err.message })
    ctx.log.warn('logo measurement failed', { src, err })
    return res.status(200).json({ metrics: null, reason: 'The image could not be read.' })
  }
})
