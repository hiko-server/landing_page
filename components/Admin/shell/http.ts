/**
 * Small fetch helpers shared by the admin editors (pure parts are unit tested).
 */

/** Login URL that brings the admin back to `returnPath` afterwards. */
export function loginHref(returnPath: string): string {
  const path =
    returnPath && returnPath.startsWith('/') && !returnPath.startsWith('//') ? returnPath : '/admin'
  return `/admin/login?next=${encodeURIComponent(path)}`
}

/**
 * Parse a response body as a JSON object without ever throwing — proxies and
 * the body-size limiter answer 413 / 502 with HTML or plain text.
 */
export async function readJsonObject(res: Response): Promise<Record<string, any>> {
  try {
    const data = await res.json()
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  } catch {
    return {}
  }
}

/**
 * Public paths a save reported: `revalidated` (refreshed now) or
 * `revalidateFailed` (will refresh on the 60 s ISR window). Deduplicated.
 */
export function parseRevalidated(
  body: unknown,
  key: 'revalidated' | 'revalidateFailed' = 'revalidated'
): string[] {
  if (!body || typeof body !== 'object') return []
  const raw = (body as Record<string, unknown>)[key]
  if (!Array.isArray(raw)) return []
  return Array.from(
    new Set(raw.filter((p): p is string => typeof p === 'string' && p.startsWith('/')))
  )
}

/** Toast copy for a successful save, from the response's revalidation lists. */
export function saveToastCopy(body: unknown): {
  status: 'success' | 'warning'
  description?: string
} {
  const live = parseRevalidated(body)
  const late = parseRevalidated(body, 'revalidateFailed')
  if (late.length) {
    return {
      status: 'warning',
      description: `Couldn’t refresh ${late.join(', ')} right away — ${late.length === 1 ? 'it updates' : 'they update'} within 60 s.`,
    }
  }
  return {
    status: 'success',
    description: live.length ? `Refreshed ${live.join(', ')}` : undefined,
  }
}

/** Human message for a failed image upload. */
export function uploadFailureMessage(status: number, body: Record<string, any>): string {
  if (status === 413) return 'Image is too large — the limit is 8 MB.'
  if (status === 401) return 'Session expired — sign in again to upload.'
  if (status === 415) return 'Unsupported image type. Use JPEG, PNG, WebP, GIF or AVIF.'
  if (status === 429) return 'Too many uploads — wait a moment and try again.'
  const msg = typeof body?.error === 'string' ? body.error : ''
  return msg || `Upload failed (HTTP ${status}).`
}

/** Read a file as a data: URL. */
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error || new Error('Could not read the file'))
    reader.readAsDataURL(file)
  })
}

/**
 * POST an image (as a data URL) to /api/admin/upload-image and return its
 * public URL. Always rejects with an Error whose message is ready to show —
 * network failures and non-JSON error pages included.
 */
export async function uploadImageDataUrl(
  filename: string,
  dataUrl: string
): Promise<{ url: string; warning?: string }> {
  let res: Response
  try {
    res = await fetch('/api/admin/upload-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, dataUrl }),
    })
  } catch {
    throw new Error('Upload failed — network error. Check your connection and try again.')
  }
  const body = await readJsonObject(res)
  if (!res.ok) throw new Error(uploadFailureMessage(res.status, body))
  if (typeof body.url !== 'string' || !body.url)
    throw new Error('Upload failed — the server returned no URL.')
  return { url: body.url, warning: typeof body.r2Warning === 'string' ? body.r2Warning : undefined }
}

/** Safe, timestamped upload filename derived from the original name. */
export function uploadFilename(originalName: string, ext?: string, now = Date.now()): string {
  const dot = originalName.lastIndexOf('.')
  const stem =
    (dot > 0 ? originalName.slice(0, dot) : originalName)
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'image'
  const extension =
    (ext || (dot > 0 ? originalName.slice(dot + 1) : 'png'))
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'png'
  return `${now}-${stem}.${extension}`
}

/** Upload a picked / dropped / pasted image file as-is. */
export async function uploadImageFile(file: File): Promise<{ url: string; warning?: string }> {
  if (file.size > 8 * 1024 * 1024) throw new Error('Image is too large — the limit is 8 MB.')
  let dataUrl: string
  try {
    dataUrl = await fileToDataUrl(file)
  } catch {
    throw new Error('Could not read that file.')
  }
  return uploadImageDataUrl(uploadFilename(file.name || 'image'), dataUrl)
}
