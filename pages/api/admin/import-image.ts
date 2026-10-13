import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { rateLimit } from '../../../lib/rateLimit'
import { storeUpload } from '../../../lib/imageVariants'
import { fetchRemoteImage, RemoteImageError } from '../../../lib/remoteImage'

/**
 * POST /api/admin/import-image { url } → { url, width, height, variants }
 *
 * Downloads a remote image (lib/remoteImage: https, public hosts only,
 * re-validated redirects, 10 s / 25 MB, real JPEG/PNG/WebP/GIF bytes), runs
 * it through the upload pipeline (rotation, downscale, WebP variants) and
 * stores it as a regular upload, so posts stop hot-linking third-party
 * images. Admin-only, 20 imports per 10 minutes.
 */
export default withApi('admin/import-image', async (req, res, ctx) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')
  const rl = rateLimit(req, 20, 10 * 60 * 1000)
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
  if (!rl.allowed) return res.status(429).json({ error: 'Too many imports, try later' })

  let remote
  try {
    remote = await fetchRemoteImage((req.body || {}).url)
  } catch (err) {
    if (err instanceof RemoteImageError) {
      const status = err.code === 'BAD_URL' || err.code === 'BLOCKED_HOST' ? 400 : err.code === 'TOO_LARGE' ? 413 : err.code === 'NOT_AN_IMAGE' ? 415 : 502
      ctx.log.info('remote image import refused', { code: err.code })
      return res.status(status).json({ error: err.message, code: err.code })
    }
    throw err
  }

  const stored = await storeUpload(remote.buf, remote.mime, remote.name)
  ctx.log.info('remote image imported', { name: stored.name, bytes: remote.buf.length })
  return res.status(200).json({
    url: stored.url,
    width: stored.width,
    height: stored.height,
    variants: stored.variants,
    ...(stored.r2Warning ? { r2Warning: stored.r2Warning } : {}),
  })
})
