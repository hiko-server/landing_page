import path from 'path'
import { parseIp } from './security/ip'
import { safeFetch, SafeFetchError } from './security/safeFetch'
import { sniffImageType, type ImageMime } from './imageVariants'

/**
 * Download a remote image an admin asked to import ("Import & optimize" in
 * the publish checklist). SERVER-ONLY. Built on lib/security/safeFetch, so:
 *
 *   - https only, and the URL host must be a name, not an IP literal
 *   - every resolved address of every hop must be public (no loopback,
 *     private, link-local, metadata …), the connection is pinned to the
 *     vetted address, at most 3 redirects, each re-validated
 *   - 10 s budget, 25 MB cap
 *   - the body must really be JPEG, PNG, WebP or GIF (magic number); an
 *     HTML or SVG answer is refused whatever its Content-Type says
 */

export const REMOTE_IMAGE_TIMEOUT_MS = 10_000
export const REMOTE_IMAGE_MAX_BYTES = 25 * 1024 * 1024

export type RemoteImageCode = 'BAD_URL' | 'BLOCKED_HOST' | 'FETCH_FAILED' | 'HTTP_STATUS' | 'TOO_LARGE' | 'NOT_AN_IMAGE'

export class RemoteImageError extends Error {
  readonly code: RemoteImageCode
  constructor(code: RemoteImageCode, message: string) {
    super(message)
    this.name = 'RemoteImageError'
    this.code = code
  }
}

export type RemoteImage = {
  buf: Buffer
  mime: ImageMime
  /** Filename hint taken from the URL path (sanitised later by the store). */
  name: string
  /** Final URL after redirects. */
  url: string
}

export type RemoteImageOptions = {
  /** Test seam: hostname → addresses (defaults to the system resolver). */
  resolve?: (host: string) => Promise<string[]>
  timeoutMs?: number
  maxBytes?: number
}

/** Validate an import URL before any network access; returns the parsed URL. */
export function checkRemoteImageUrl(raw: unknown): URL {
  if (typeof raw !== 'string' || !raw.trim()) throw new RemoteImageError('BAD_URL', 'Enter an image URL')
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    throw new RemoteImageError('BAD_URL', 'Not a valid URL')
  }
  if (u.protocol !== 'https:') throw new RemoteImageError('BAD_URL', 'Only https:// image URLs can be imported')
  if (u.username || u.password) throw new RemoteImageError('BAD_URL', 'Credentials in URLs are not allowed')
  if (parseIp(u.hostname.replace(/^\[|\]$/g, ''))) {
    throw new RemoteImageError('BLOCKED_HOST', 'IP-address URLs cannot be imported; use the image’s hostname')
  }
  return u
}

function nameFromUrl(u: URL): string {
  let base = ''
  try {
    base = path.posix.basename(decodeURIComponent(u.pathname))
  } catch {
    base = ''
  }
  return base && base !== '/' ? base : `${u.hostname}-image`
}

export async function fetchRemoteImage(rawUrl: unknown, opts: RemoteImageOptions = {}): Promise<RemoteImage> {
  const u = checkRemoteImageUrl(rawUrl)
  let res
  try {
    res = await safeFetch(u.toString(), {
      method: 'GET',
      headers: { accept: 'image/webp,image/png,image/jpeg,image/gif' },
      timeoutMs: opts.timeoutMs ?? REMOTE_IMAGE_TIMEOUT_MS,
      maxBytes: opts.maxBytes ?? REMOTE_IMAGE_MAX_BYTES,
      maxRedirects: 3,
      resolve: opts.resolve,
    })
  } catch (err) {
    if (err instanceof SafeFetchError) {
      if (err.code === 'BLOCKED_HOST') throw new RemoteImageError('BLOCKED_HOST', 'That host is not a public internet address')
      if (err.code === 'BAD_URL') throw new RemoteImageError('BAD_URL', err.message)
      if (err.code === 'TOO_LARGE') throw new RemoteImageError('TOO_LARGE', 'The image is larger than 25 MB')
      throw new RemoteImageError('FETCH_FAILED', `Download failed (${err.code.toLowerCase()}): ${err.message}`)
    }
    throw new RemoteImageError('FETCH_FAILED', err instanceof Error ? err.message : String(err))
  }
  if (res.status !== 200) throw new RemoteImageError('HTTP_STATUS', `The server answered HTTP ${res.status}`)
  const declared = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
  if (declared && !declared.startsWith('image/') && declared !== 'application/octet-stream') {
    throw new RemoteImageError('NOT_AN_IMAGE', `The URL returned ${declared}, not an image`)
  }
  const mime = sniffImageType(res.body)
  if (!mime) throw new RemoteImageError('NOT_AN_IMAGE', 'Only JPEG, PNG, WebP and GIF images can be imported')
  let finalUrl: URL
  try {
    finalUrl = new URL(res.url)
  } catch {
    finalUrl = u
  }
  return { buf: res.body, mime, name: nameFromUrl(finalUrl), url: res.url }
}
