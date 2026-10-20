import { withApi } from '../../../lib/apiHandler'
import { rateLimit } from '../../../lib/rateLimit'
import { isAdminRequest } from '../../../lib/auth'
import { ImageRejectedError, storeUpload } from '../../../lib/imageVariants'
import { ImageQueueFullError } from '../../../lib/imageJobs'
import { parseImageUpload } from '../../../lib/media/uploadBody'

/**
 * POST /api/admin/upload-image { filename, dataUrl } → { url, width, height, variants }
 *
 * Accepts JPEG, PNG, WebP and GIF (AVIF is no longer accepted: the image
 * optimizer that decoded it is disabled and its decoder carried advisories).
 * The declared type must match the bytes' magic number (lib/media/uploadBody,
 * shared with the media library's "Replace file"). The image is
 * processed by lib/imageVariants (EXIF rotation, downscale above 2560 px,
 * WebP variants for srcset, metadata stripped), stored under a fresh
 * never-overwritten name in public/uploads and mirrored to R2. An image that
 * decodes to more than 80 megapixels (all frames) is refused with 413
 * { code: 'TOO_MANY_PIXELS' }, an unreadable one with 415. Images are encoded
 * one at a time across the server (lib/imageJobs); when too many already
 * wait, the answer is 503 { code: 'BUSY' } with Retry-After.
 */
export default withApi('admin/upload-image', async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  const rl = rateLimit(req, 20, 10 * 60 * 1000)
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
  if (!rl.allowed) {
    // The media library's upload queue waits this long, then carries on.
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))))
    return res.status(429).json({ error: 'Too many uploads, try later' })
  }
  const parsed = parseImageUpload(req.body)
  if (!parsed.ok) return res.status(parsed.status).json({ error: parsed.error })

  // The stored name always matches UPLOAD_NAME_RE (the rule /uploads/* serves
  // and backups keep) and carries the canonical extension of the type.
  let stored
  try {
    stored = await storeUpload(parsed.buf, parsed.mime, parsed.filename)
  } catch (err) {
    if (err instanceof ImageRejectedError) return res.status(err.status).json({ error: err.message, code: err.code })
    // Too many images already wait to be encoded (lib/imageJobs): try again shortly.
    if (err instanceof ImageQueueFullError) {
      res.setHeader('Retry-After', String(err.retryAfterSeconds))
      return res.status(err.status).json({ error: err.message, code: 'BUSY' })
    }
    throw err
  }
  return res.status(200).json({
    url: stored.url,
    width: stored.width,
    height: stored.height,
    variants: stored.variants,
    avifVariants: stored.avifVariants ?? [],
    ...(stored.r2Warning ? { r2Warning: stored.r2Warning } : {}),
  })
})

// Images arrive as base64 data URLs (~1.37× the file size); the default 1mb
// body limit rejected anything over ~750KB before the 8MB check could run.
export const config = {
  api: {
    bodyParser: { sizeLimit: '12mb' },
  },
}
