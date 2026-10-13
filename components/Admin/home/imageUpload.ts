import { fileToDataUrl, uploadFilename, uploadImageDataUrl } from '../shell/http'

/**
 * Browser-side image upload for the Home editor: downscale to 1600 px
 * (JPEG stays JPEG; PNG / WebP become WebP so transparency survives; GIF is
 * uploaded untouched), POST through the shared upload helper, and return the
 * URL with a `__ts` cache-buster so the preview shows the new file (the
 * buster is stripped again by serializeHome on save).
 */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const MAX_EDGE = 1600

export function withCacheBust(url: string, now = Date.now()): string {
  return url + (url.includes('?') ? '&' : '?') + '__ts=' + now
}

function compressImageDataUrl(srcDataUrl: string, quality: number, type: 'image/jpeg' | 'image/webp'): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      const ratio = Math.min(MAX_EDGE / img.naturalWidth, MAX_EDGE / img.naturalHeight, 1)
      const width = Math.max(1, Math.round(img.naturalWidth * ratio))
      const height = Math.max(1, Math.round(img.naturalHeight * ratio))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(srcDataUrl)
      ctx.drawImage(img, 0, 0, width, height)
      const out = canvas.toDataURL(type, quality)
      // Browsers that can't encode WebP silently return PNG — keep the original then.
      resolve(out.startsWith(`data:${type}`) ? out : srcDataUrl)
    }
    img.onerror = () => resolve(srcDataUrl)
    img.src = srcDataUrl
  })
}

/**
 * Compress and upload one image. Rejects with an Error whose message is
 * ready to show (too large, unreadable, network, server refusal).
 */
export async function uploadHomeImage(file: File): Promise<{ url: string; warning?: string }> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name || 'Image'} is too large — the limit is 8 MB.`)
  if (file.type && !file.type.startsWith('image/')) throw new Error(`${file.name || 'That file'} is not an image.`)
  let dataUrl: string
  try {
    dataUrl = await fileToDataUrl(file)
  } catch {
    throw new Error(`Could not read ${file.name || 'that file'}.`)
  }
  if (file.type === 'image/jpeg') dataUrl = await compressImageDataUrl(dataUrl, 0.82, 'image/jpeg')
  else if (file.type === 'image/png' || file.type === 'image/webp') dataUrl = await compressImageDataUrl(dataUrl, 0.9, 'image/webp')
  const ext = (dataUrl.match(/^data:image\/(\w+)/)?.[1] || 'png').replace('jpeg', 'jpg')
  const { url, warning } = await uploadImageDataUrl(uploadFilename(file.name || 'image', ext), dataUrl)
  return { url: withCacheBust(url), warning }
}
