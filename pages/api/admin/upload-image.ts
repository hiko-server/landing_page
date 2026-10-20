import { withApi } from '../../../lib/apiHandler'
import { rateLimit } from '../../../lib/rateLimit'
import { isAdminRequest } from '../../../lib/auth'
import { IMAGE_TYPES, ImageRejectedError, isImageMime, storeUpload } from '../../../lib/imageVariants'

/**
 * POST /api/admin/upload-image { filename, dataUrl } → { url, width, height, variants }
 *
 * Accepts JPEG, PNG, WebP and GIF (AVIF is no longer accepted: the image
 * optimizer that decoded it is disabled and its decoder carried advisories).
 * The declared type must match the bytes' magic number. The image is
 * processed by lib/imageVariants (EXIF rotation, downscale above 2560 px,
 * WebP variants for srcset, metadata stripped), stored under a fresh
 * never-overwritten name in public/uploads and mirrored to R2. An image that
 * decodes to more than 80 megapixels (all frames) is refused with 413
 * { code: 'TOO_MANY_PIXELS' }, an unreadable one with 415.
 */
export default withApi('admin/upload-image', async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  const rl = rateLimit(req, 20, 10 * 60 * 1000)
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
  if (!rl.allowed) return res.status(429).json({ error: 'Too many uploads, try later' })
  const { filename, dataUrl } = req.body || {}
  if (typeof filename !== 'string' || !filename || typeof dataUrl !== 'string' || !dataUrl) {
    return res.status(400).json({ error: 'Missing fields' })
  }

  // dataUrl: data:image/png;base64,xxxx
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl)
  if (!match) return res.status(400).json({ error: 'Invalid dataUrl' })
  const contentType = match[1]
  const buf = Buffer.from(match[2], 'base64')

  // Allowlist: a known image MIME whose magic number the decoded bytes carry
  // (no text/html or SVG smuggled in under an image type), with a sane size.
  if (!isImageMime(contentType)) return res.status(415).json({ error: 'Unsupported image type. Use JPEG, PNG, WebP or GIF.' })
  const MAX_BYTES = 8 * 1024 * 1024
  if (buf.length === 0 || buf.length > MAX_BYTES) return res.status(413).json({ error: 'Image must be 1 byte to 8MB' })
  if (!IMAGE_TYPES[contentType].magic(buf)) {
    return res.status(400).json({ error: 'File content does not match its declared image type' })
  }

  // The stored name always matches UPLOAD_NAME_RE (the rule /uploads/* serves
  // and backups keep) and carries the canonical extension of the type.
  let stored
  try {
    stored = await storeUpload(buf, contentType, filename)
  } catch (err) {
    if (err instanceof ImageRejectedError) return res.status(err.status).json({ error: err.message, code: err.code })
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
