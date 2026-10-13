import fs from 'fs'
import path from 'path'
import { safeFetch } from '../security/safeFetch'
import { isValidUploadName } from '../security/uploadName'
import { isR2Configured, r2GetRange } from '../r2'
import type { ImageSize } from './images'

/**
 * Intrinsic image sizes without an image library: only the file header is
 * read (PNG IHDR, GIF logical screen, JPEG SOFn + EXIF orientation, WebP
 * VP8/VP8L/VP8X). Used when articles are compiled (build / ISR / preview) so
 * every <img> carries width/height and never shifts the layout:
 *
 *   /uploads/<name>   public/uploads on disk, else a ranged read of the R2 copy
 *   /images/… etc.    other files under public/
 *   https://…         a ranged request for the first bytes, through
 *                     lib/security/safeFetch (no internal addresses, short
 *                     timeout, byte cap, image/* only)
 *
 * Results are kept in a bounded LRU; failures are remembered briefly so a
 * dead host is not retried on every revalidation.
 */

const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1]
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)
const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3])
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...Array.from(b.subarray(o, o + n)))

function valid(width: number, height: number): ImageSize | null {
  return width > 0 && height > 0 && width < 100_000 && height < 100_000 ? { width, height } : null
}

/** EXIF orientation (1–8) from an APP1 segment body starting at `o`; 1 when absent. */
function exifOrientation(b: Uint8Array, o: number, end: number): number {
  if (ascii(b, o, 4) !== 'Exif') return 1
  const tiff = o + 6
  if (tiff + 8 > end) return 1
  const little = ascii(b, tiff, 2) === 'II'
  const r16 = (x: number) => (little ? u16le(b, x) : u16be(b, x))
  const r32 = (x: number) => (little ? (u16le(b, x) | (u16le(b, x + 2) << 16)) >>> 0 : u32be(b, x))
  const ifd = tiff + r32(tiff + 4)
  if (ifd + 2 > end) return 1
  const entries = r16(ifd)
  for (let i = 0; i < entries; i++) {
    const e = ifd + 2 + i * 12
    if (e + 12 > end) break
    if (r16(e) === 0x0112) {
      const v = r16(e + 8)
      return v >= 1 && v <= 8 ? v : 1
    }
  }
  return 1
}

function jpegSize(b: Uint8Array): ImageSize | null {
  let o = 2
  let orientation = 1
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) {
      o++
      continue
    }
    const marker = b[o + 1]
    if (marker === 0xff) {
      o++
      continue
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      o += 2
      continue
    }
    const len = u16be(b, o + 2)
    if (marker === 0xe1) orientation = exifOrientation(b, o + 4, Math.min(b.length, o + 2 + len))
    // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = u16be(b, o + 5)
      const width = u16be(b, o + 7)
      // Orientations 5–8 rotate by 90°: the displayed box is height × width.
      return orientation >= 5 ? valid(height, width) : valid(width, height)
    }
    if (len < 2) return null
    o += 2 + len
  }
  return null
}

function webpSize(b: Uint8Array): ImageSize | null {
  const chunk = ascii(b, 12, 4)
  if (chunk === 'VP8 ' && b.length >= 30) return valid(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff)
  if (chunk === 'VP8L' && b.length >= 25 && b[20] === 0x2f) {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
    return valid((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1)
  }
  if (chunk === 'VP8X' && b.length >= 30) return valid(u24le(b, 24) + 1, u24le(b, 27) + 1)
  return null
}

/** Intrinsic display size from the first bytes of a PNG / GIF / JPEG / WebP file. */
export function imageSizeFromBytes(b: Uint8Array): ImageSize | null {
  if (b.length < 16) return null
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && b.length >= 24) return valid(u32be(b, 16), u32be(b, 20))
  if (ascii(b, 0, 3) === 'GIF' && b.length >= 10) return valid(u16le(b, 6), u16le(b, 8))
  if (b[0] === 0xff && b[1] === 0xd8) return jpegSize(b)
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return webpSize(b)
  return null
}

const HEADER_BYTES = 512 * 1024
const cache = new Map<string, { mtimeMs: number; size: ImageSize | null }>()

/**
 * Size of a same-site image (`/uploads/x.jpg`, `/images/y.png`) read from
 * public/. Remote, protocol-relative and path-escaping sources return null.
 */
export function localImageSize(src: string, publicDir = path.join(process.cwd(), 'public')): ImageSize | null {
  if (!/^\/(?!\/)/.test(src)) return null
  let rel: string
  try {
    rel = decodeURIComponent(src.split(/[?#]/)[0])
  } catch {
    return null
  }
  const root = path.resolve(publicDir)
  const file = path.resolve(root, `.${rel}`)
  if (!file.startsWith(root + path.sep)) return null
  try {
    const stat = fs.statSync(file)
    if (!stat.isFile()) return null
    const hit = cache.get(file)
    if (hit && hit.mtimeMs === stat.mtimeMs) return hit.size
    const fd = fs.openSync(file, 'r')
    try {
      const buf = Buffer.alloc(Math.min(HEADER_BYTES, stat.size))
      fs.readSync(fd, buf, 0, buf.length, 0)
      const size = imageSizeFromBytes(buf)
      cache.set(file, { mtimeMs: stat.mtimeMs, size })
      return size
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return null
  }
}

// ── Uploads, R2 and remote images ──────────────────────────────────────────

const UPLOAD_PREFIX = '/uploads/'
/** First request: the header of almost every PNG/GIF/WebP and most JPEGs. */
export const REMOTE_HEAD_BYTES = 64 * 1024
/** Hard ceiling for one remote image (a JPEG whose SOF sits behind big EXIF/ICC blocks). */
export const REMOTE_MAX_BYTES = 128 * 1024
export const REMOTE_TIMEOUT_MS = 3000
export const SIZE_CACHE_MAX = 500
const FAILURE_TTL_MS = 10 * 60 * 1000

export type RemoteResponse = { status: number; headers: Record<string, string | string[] | undefined>; body: Uint8Array }
export type RemoteFetcher = (
  url: string,
  init: { headers: Record<string, string>; timeoutMs: number; maxBytes: number },
) => Promise<RemoteResponse>

export type SizeResolverDeps = {
  /** Remote GET (defaults to safeFetch). */
  fetchRemote?: RemoteFetcher
  /** Header bytes of public/uploads/<name>, null when absent (defaults to disk). */
  readUpload?: (name: string) => ImageSize | null
  /** Bytes of the R2 copy of an upload, null when absent (defaults to lib/r2). */
  readR2?: (name: string) => Promise<Uint8Array | null>
  /** Same-site files outside /uploads (defaults to localImageSize). */
  readLocal?: (src: string) => ImageSize | null
  timeoutMs?: number
  cacheSize?: number
  now?: () => number
}

const defaultFetchRemote: RemoteFetcher = async (url, init) => {
  const res = await safeFetch(url, { headers: init.headers, timeoutMs: init.timeoutMs, maxBytes: init.maxBytes, maxRedirects: 3 })
  return { status: res.status, headers: res.headers, body: res.body }
}

/**
 * Header bytes of an upload's R2 copy (only used when the file is missing on
 * disk, e.g. before the boot sync restored it). Ranged reads, like remote
 * images: the first REMOTE_HEAD_BYTES, and up to HEADER_BYTES (the amount
 * read from disk) only when a JPEG's SOF sits behind large EXIF/ICC blocks.
 * The resolver caches the result.
 */
async function defaultReadR2(name: string): Promise<Uint8Array | null> {
  if (!isR2Configured()) return null
  const key = `uploads/${name}`
  const head = await r2GetRange(key, REMOTE_HEAD_BYTES)
  if (!head || head.length < REMOTE_HEAD_BYTES || imageSizeFromBytes(head)) return head
  return await r2GetRange(key, HEADER_BYTES)
}

function header(headers: RemoteResponse['headers'], name: string): string {
  const v = headers[name] ?? headers[name.toLowerCase()]
  return (Array.isArray(v) ? v[0] : v) || ''
}

/** Upload file name for a same-site `/uploads/<name>` URL; null for anything else. */
export function uploadNameOf(src: string): string | null {
  if (!src.startsWith(UPLOAD_PREFIX)) return null
  let name: string
  try {
    name = decodeURIComponent(src.slice(UPLOAD_PREFIX.length).split(/[?#]/)[0])
  } catch {
    return null
  }
  return isValidUploadName(name) ? name : null
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      },
    )
  })
}

/**
 * Size resolver for compileMdx: `(src) => Promise<ImageSize | null>`.
 * Never throws; unknown or unreachable images resolve to null.
 */
export function createImageSizeResolver(deps: SizeResolverDeps = {}): (src: string) => Promise<ImageSize | null> {
  const fetchRemote = deps.fetchRemote || defaultFetchRemote
  const readUpload = deps.readUpload || ((name: string) => localImageSize(`${UPLOAD_PREFIX}${name}`))
  const readR2 = deps.readR2 || defaultReadR2
  const readLocal = deps.readLocal || ((src: string) => localImageSize(src))
  const timeoutMs = deps.timeoutMs ?? REMOTE_TIMEOUT_MS
  const max = deps.cacheSize ?? SIZE_CACHE_MAX
  const now = deps.now || Date.now
  const lru = new Map<string, { size: ImageSize | null; expires: number }>()

  const remember = (key: string, size: ImageSize | null) => {
    lru.delete(key)
    lru.set(key, { size, expires: size ? Infinity : now() + FAILURE_TTL_MS })
    while (lru.size > max) lru.delete(lru.keys().next().value as string)
  }

  const remote = async (url: string): Promise<ImageSize | null> => {
    for (const bytes of [REMOTE_HEAD_BYTES, REMOTE_MAX_BYTES]) {
      const res = await withTimeout(
        fetchRemote(url, { headers: { Range: `bytes=0-${bytes - 1}`, Accept: 'image/*' }, timeoutMs, maxBytes: REMOTE_MAX_BYTES }),
        timeoutMs,
      )
      if (!res || (res.status !== 200 && res.status !== 206)) return null
      if (!/^image\//i.test(header(res.headers, 'content-type'))) return null
      const size = imageSizeFromBytes(res.body.subarray(0, REMOTE_MAX_BYTES))
      if (size) return size
      // Only a ranged answer can be extended; a full body that did not parse never will.
      if (res.status !== 206 || res.body.length < bytes) return null
    }
    return null
  }

  return async (src: string) => {
    const key = src.trim()
    if (!key) return null
    const hit = lru.get(key)
    if (hit && hit.expires > now()) {
      lru.delete(key)
      lru.set(key, hit)
      return hit.size
    }
    let size: ImageSize | null = null
    const upload = uploadNameOf(key)
    if (upload) {
      size = readUpload(upload)
      if (!size) {
        const bytes = await withTimeout(readR2(upload), timeoutMs * 3)
        size = bytes ? imageSizeFromBytes(bytes) : null
      }
    } else if (/^https:\/\//i.test(key)) {
      size = await remote(key)
    } else if (/^\/(?!\/)/.test(key)) {
      // Same-site files are cheap to re-check: not cached (they can change on deploy).
      return readLocal(key)
    } else {
      return null
    }
    remember(key, size)
    return size
  }
}

/** The process-wide resolver used by lib/mdx.ts. */
export const resolveImageSize = createImageSizeResolver()
