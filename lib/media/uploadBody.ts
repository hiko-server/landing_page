import { IMAGE_TYPES, isImageMime, type ImageMime } from '../imageVariants'

/**
 * The JSON body of an image upload — `{ filename, dataUrl }` with
 * `data:<type>;base64,…` — checked the same way for every route that takes
 * one (POST /api/admin/upload-image, POST /api/admin/media/replace):
 * an accepted image type (JPEG, PNG, WebP, GIF) whose magic number the bytes
 * really carry, 1 byte to 8 MB. Pure; unit-tested.
 */

export const UPLOAD_MAX_BYTES = 8 * 1024 * 1024

export type ParsedUpload = { ok: true; filename: string; mime: ImageMime; buf: Buffer } | { ok: false; status: 400 | 413 | 415; error: string }

export function parseImageUpload(body: unknown): ParsedUpload {
  const { filename, dataUrl } = (body && typeof body === 'object' ? body : {}) as { filename?: unknown; dataUrl?: unknown }
  if (typeof filename !== 'string' || !filename || typeof dataUrl !== 'string' || !dataUrl) return { ok: false, status: 400, error: 'Missing fields' }
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl)
  if (!match) return { ok: false, status: 400, error: 'Invalid dataUrl' }
  const contentType = match[1]
  // Allowlist: a known image MIME whose magic number the decoded bytes carry
  // (no text/html or SVG smuggled in under an image type), with a sane size.
  if (!isImageMime(contentType)) return { ok: false, status: 415, error: 'Unsupported image type. Use JPEG, PNG, WebP or GIF.' }
  const buf = Buffer.from(match[2], 'base64')
  if (buf.length === 0 || buf.length > UPLOAD_MAX_BYTES) return { ok: false, status: 413, error: 'Image must be 1 byte to 8MB' }
  if (!IMAGE_TYPES[contentType].magic(buf)) return { ok: false, status: 400, error: 'File content does not match its declared image type' }
  return { ok: true, filename, mime: contentType, buf }
}
