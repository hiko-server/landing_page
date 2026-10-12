import fs from 'fs'
import path from 'path'
import type { ImageSize } from './images'

/**
 * Intrinsic size of local images without an image library: reads only the
 * file header (PNG IHDR, GIF logical screen, JPEG SOFn + EXIF orientation,
 * WebP VP8/VP8L/VP8X). Used at build/ISR time so article <img> tags carry
 * width/height and never shift the layout.
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
