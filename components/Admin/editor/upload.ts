import { fileToDataUrl, readJsonObject, uploadFilename } from '../shell/http'

/**
 * Client helpers for the upload pipeline: POST /api/admin/upload-image and
 * POST /api/admin/import-image both answer { url, width, height, variants }.
 * Every failure rejects with an Error whose message is ready for a toast.
 */

export type UploadedImage = {
  url: string
  width: number | null
  height: number | null
  /** WebP variant URLs (lib/uploadVariants), narrowest first. */
  variants: string[]
  /** AVIF variant URLs, narrowest first. */
  avifVariants: string[]
  warning?: string
}

/** "5 sizes · WebP + AVIF" for an upload toast, or undefined when no variant was made. */
export function responsiveSummary(img: Pick<UploadedImage, 'variants' | 'avifVariants'>): string | undefined {
  const sizes = Math.max(img.variants.length, img.avifVariants.length)
  if (!sizes) return undefined
  const formats = [img.variants.length ? 'WebP' : '', img.avifVariants.length ? 'AVIF' : ''].filter(Boolean).join(' + ')
  return `Responsive sizes: ${sizes} · ${formats}`
}

/** Types the upload API accepts (also the file pickers' `accept`). */
export const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'
export const UPLOAD_MAX_BYTES = 8 * 1024 * 1024

export function uploadErrorMessage(status: number, body: Record<string, unknown>): string {
  // Refusals that carry a code (pixel limit, unreadable image, import errors) explain themselves.
  if (typeof body.code === 'string' && typeof body.error === 'string' && body.error) return body.error
  if (status === 413) return 'Image is too large — the limit is 8 MB.'
  if (status === 401) return 'Session expired — sign in again to upload.'
  if (status === 415) return 'Unsupported image type. Use JPEG, PNG, WebP or GIF.'
  if (status === 429) return 'Too many uploads — wait a moment and try again.'
  return typeof body.error === 'string' && body.error ? body.error : `Upload failed (HTTP ${status}).`
}

function parseUploaded(body: Record<string, unknown>): UploadedImage {
  if (typeof body.url !== 'string' || !body.url) throw new Error('Upload failed — the server returned no URL.')
  const dim = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
  return {
    url: body.url,
    width: dim(body.width),
    height: dim(body.height),
    variants: Array.isArray(body.variants) ? body.variants.filter((v): v is string => typeof v === 'string') : [],
    avifVariants: Array.isArray(body.avifVariants) ? body.avifVariants.filter((v): v is string => typeof v === 'string') : [],
    warning: typeof body.r2Warning === 'string' ? body.r2Warning : undefined,
  }
}

async function postJson(endpoint: string, payload: unknown): Promise<UploadedImage> {
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new Error('Network error — check your connection and try again.')
  }
  const body = await readJsonObject(res)
  if (!res.ok) throw new Error(uploadErrorMessage(res.status, body))
  return parseUploaded(body)
}

/** Upload a picked / dropped / pasted file. */
export async function uploadImage(file: File): Promise<UploadedImage> {
  if (!UPLOAD_ACCEPT.split(',').includes(file.type)) throw new Error('Unsupported image type. Use JPEG, PNG, WebP or GIF.')
  if (file.size > UPLOAD_MAX_BYTES) throw new Error('Image is too large — the limit is 8 MB.')
  let dataUrl: string
  try {
    dataUrl = await fileToDataUrl(file)
  } catch {
    throw new Error('Could not read that file.')
  }
  return postJson('/api/admin/upload-image', { filename: uploadFilename(file.name || 'image'), dataUrl })
}

/** Copy a remote https image into the uploads (SSRF-safe server fetch). */
export async function importRemoteImage(url: string): Promise<UploadedImage> {
  return postJson('/api/admin/import-image', { url })
}

/** Default alt text from a file name ("team-photo_2024.jpg" → "team photo 2024"), '' when it says nothing. */
export function altFromFileName(name: string): string {
  const stem = name.replace(/\.[^.]+$/, '').replace(/^\d{10,}-/, '')
  const words = stem.replace(/[-_.]+/g, ' ').replace(/[[\]]/g, '').trim()
  return /^(img|image|dsc|screenshot|photo|pxl)?\s*\d*$/i.test(words) ? '' : words
}
