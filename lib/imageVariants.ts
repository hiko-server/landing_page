import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import sharp, { type Sharp } from 'sharp'
import { log } from './log'
import { isR2Configured, r2PutBuffer } from './r2'
import { uploadR2Key } from './contentStore'
import { imageSizeFromBytes } from './rehype/imageSize'
import { isValidUploadName, sanitizeUploadName, withHashSuffix } from './security/uploadName'
import {
  MAX_VARIANT_WIDTH,
  PLACEHOLDER_WIDTH,
  asOriginalName,
  placeholderName,
  variantFilesOf,
  variantFormatsAt,
  variantName,
  variantWidthsFor,
  type VariantFormat,
} from './uploadVariants'

/**
 * Upload-time image processing (sharp) — the replacement for the disabled
 * Next image optimizer. SERVER-ONLY.
 *
 *   - storeUpload first measures the image (header only) and refuses one
 *     that decodes to more than MAX_INPUT_PIXELS (all frames together) or
 *     cannot be measured at all — ImageRejectedError, HTTP 413 / 415. Such a
 *     file would crash visitors' (mobile) tabs even though it is small.
 *   - All metadata (EXIF GPS, camera serials, XMP, IPTC, PNG text) is
 *     dropped from every original; only the ICC profile is kept. An upright
 *     JPEG / WebP within MAX_EDGE keeps its compressed data byte for byte
 *     (stripJpegMetadata / stripWebpMetadata). Anything that needs rotating
 *     (EXIF orientation) or downscaling to MAX_EDGE, and every PNG, is
 *     re-encoded in its own format (JPEG mozjpeg q82, PNG palette when it has
 *     ≤256 colours else zlib level 9, WebP q82 or lossless when the input was
 *     lossless).
 *   - Variants (lib/uploadVariants.ts names them): for every VARIANT_WIDTHS
 *     entry narrower than the original and for the original's own width, a
 *     WebP (q72) and an AVIF (q50, effort 2 — cheap enough for the one-vCPU
 *     server, within ~1% of effort 4's size), plus a 16 px WebP blur
 *     placeholder (C8). Made here, at upload, or by the media-optimize
 *     backfill — never while a page renders.
 *   - Animated WebPs and PNGs keep their frames with the metadata chunks
 *     removed, GIFs are stored untouched; none of them get variants.
 *   - A re-encode failure of an image under the pixel limit stores the
 *     original unchanged: an upload is never blocked by the optimizer.
 */

export const MAX_EDGE = MAX_VARIANT_WIDTH
/**
 * Decompression-bomb guard: the most decoded pixels (width × height × frames)
 * an upload may have. Enforced by storeUpload before anything is stored, and
 * the input limit sharp itself is opened with.
 */
export const MAX_INPUT_PIXELS = 80e6

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

/** Accepted upload / import types: canonical extension and magic-number check. */
export const IMAGE_TYPES: Record<ImageMime, { ext: string; magic: (b: Buffer) => boolean }> = {
  'image/png': { ext: '.png', magic: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  'image/jpeg': { ext: '.jpg', magic: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/webp': {
    ext: '.webp',
    magic: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
  'image/gif': { ext: '.gif', magic: (b) => b.length > 6 && b.toString('ascii', 0, 4) === 'GIF8' },
}

export function isImageMime(value: unknown): value is ImageMime {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(IMAGE_TYPES, value)
}

/** The accepted type the bytes actually are (by magic number), or null. */
export function sniffImageType(buf: Buffer): ImageMime | null {
  for (const mime of Object.keys(IMAGE_TYPES) as ImageMime[]) {
    if (IMAGE_TYPES[mime].magic(buf)) return mime
  }
  return null
}

export type ImageRejectCode = 'TOO_MANY_PIXELS' | 'UNREADABLE_IMAGE'

/** An image storeUpload refuses to publish; `status` is the HTTP answer for it. */
export class ImageRejectedError extends Error {
  readonly code: ImageRejectCode
  readonly status: 413 | 415
  constructor(code: ImageRejectCode, message: string) {
    super(message)
    this.name = 'ImageRejectedError'
    this.code = code
    this.status = code === 'TOO_MANY_PIXELS' ? 413 : 415
  }
}

/** PNG chunk walk: the frame count of an animated PNG (acTL), 0 for anything else. */
export function apngFrameCount(buf: Buffer): number {
  if (!IMAGE_TYPES['image/png'].magic(buf)) return 0
  let o = 8
  while (o + 12 <= buf.length) {
    const len = buf.readUInt32BE(o)
    const type = buf.toString('latin1', o + 4, o + 8)
    if (type === 'acTL') return len >= 8 ? Math.max(1, buf.readUInt32BE(o + 8)) : 1
    if (type === 'IDAT' || type === 'IEND') return 0 // acTL must precede the image data
    o += 12 + len
  }
  return 0
}

const PNG_METADATA_CHUNKS = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME'])

/** A PNG without its metadata chunks (EXIF, text, time); unchanged when the chunk layout is malformed. */
function stripPngMetadata(buf: Buffer): Buffer {
  const keep: Buffer[] = [buf.subarray(0, 8)]
  let o = 8
  while (o + 12 <= buf.length) {
    const end = o + 12 + buf.readUInt32BE(o)
    if (end > buf.length) return buf
    const type = buf.toString('latin1', o + 4, o + 8)
    if (!PNG_METADATA_CHUNKS.has(type)) keep.push(buf.subarray(o, end))
    o = end
    if (type === 'IEND') return Buffer.concat(keep)
  }
  return buf
}

const isApp = (marker: number) => marker >= 0xe0 && marker <= 0xef
const isRst = (marker: number) => marker >= 0xd0 && marker <= 0xd7

/** JPEG segments worth keeping: everything but metadata (APPn other than JFIF / ICC / Adobe, and comments). */
function keepJpegSegment(marker: number, payload: Buffer): boolean {
  if (marker === 0xfe) return false // COM
  if (!isApp(marker)) return true // SOF, DHT, DQT, DRI, SOS, …
  if (marker === 0xe0 || marker === 0xee) return true // JFIF, Adobe (colour transform)
  return marker === 0xe2 && payload.toString('latin1', 0, 12) === 'ICC_PROFILE\0'
}

/**
 * A JPEG without its metadata, LOSSLESSLY: the compressed image data is
 * copied byte for byte; EXIF (GPS, camera serials, orientation), XMP, IPTC,
 * comments and the multi-picture images some phones append after EOI (with
 * their own EXIF) are dropped; JFIF, the ICC profile and the Adobe segment
 * stay. Null when the marker layout is malformed (the caller re-encodes).
 * Only for an upright image: the orientation tag goes with the EXIF.
 */
export function stripJpegMetadata(buf: Buffer): Buffer | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  const out: Buffer[] = [buf.subarray(0, 2)]
  let o = 2
  while (o + 2 <= buf.length) {
    if (buf[o] !== 0xff) return null
    let m = o + 1
    while (m < buf.length && buf[m] === 0xff) m++ // fill bytes
    if (m >= buf.length) return null
    const marker = buf[m]
    if (marker === 0xd9) {
      out.push(Buffer.from([0xff, 0xd9]))
      return Buffer.concat(out)
    }
    if (marker === 0x01 || isRst(marker)) {
      out.push(Buffer.from([0xff, marker]))
      o = m + 1
      continue
    }
    if (m + 3 > buf.length) return null
    const len = buf.readUInt16BE(m + 1)
    const end = m + 1 + len
    if (len < 2 || end > buf.length) return null
    if (keepJpegSegment(marker, buf.subarray(m + 3, end))) out.push(Buffer.from([0xff, marker]), buf.subarray(m + 1, end))
    o = end
    if (marker === 0xda) {
      // Entropy-coded data runs to the next real marker (not a stuffed 0xFF00, not RSTn).
      let q = o
      while (q + 1 < buf.length && !(buf[q] === 0xff && buf[q + 1] !== 0x00 && buf[q + 1] !== 0xff && !isRst(buf[q + 1]))) q++
      if (q + 1 >= buf.length) return null
      out.push(buf.subarray(o, q))
      o = q
    }
  }
  return null
}

const WEBP_FLAG_EXIF = 0x08
const WEBP_FLAG_XMP = 0x04

/**
 * A WebP (still or animated) without its EXIF and XMP chunks, LOSSLESSLY:
 * every other chunk is copied as is and the VP8X flags and RIFF size are
 * updated. Null when the chunk layout is malformed (the caller re-encodes).
 */
export function stripWebpMetadata(buf: Buffer): Buffer | null {
  if (!IMAGE_TYPES['image/webp'].magic(buf)) return null
  const riffEnd = 8 + buf.readUInt32LE(4)
  if (riffEnd > buf.length) return null
  const chunks: Buffer[] = []
  let o = 12
  while (o + 8 <= riffEnd) {
    const type = buf.toString('latin1', o, o + 4)
    const size = buf.readUInt32LE(o + 4)
    const end = o + 8 + size + (size & 1)
    if (end > riffEnd) return null
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = Buffer.from(buf.subarray(o, end))
      if (type === 'VP8X' && chunk.length > 8) chunk[8] &= ~(WEBP_FLAG_EXIF | WEBP_FLAG_XMP)
      chunks.push(chunk)
    }
    o = end
  }
  if (o !== riffEnd || chunks.length === 0) return null
  const body = Buffer.concat(chunks)
  const header = Buffer.alloc(12)
  header.write('RIFF', 0, 'latin1')
  header.writeUInt32LE(4 + body.length, 4)
  header.write('WEBP', 8, 'latin1')
  return Buffer.concat([header, body])
}

/** True when a WebP (still or animated) carries a lossless (VP8L) bitstream. */
function webpIsLossless(buf: Buffer): boolean {
  const walk = (start: number, end: number): boolean => {
    let o = start
    while (o + 8 <= end) {
      const type = buf.toString('latin1', o, o + 4)
      const size = buf.readUInt32LE(o + 4)
      if (type === 'VP8L') return true
      // ANMF: a 16-byte frame header, then the frame's own chunks.
      if (type === 'ANMF' && walk(o + 24, Math.min(end, o + 8 + size))) return true
      o += 8 + size + (size & 1)
    }
    return false
  }
  return buf.length > 12 && walk(12, buf.length)
}

export type ImageGeometry = { width: number; height: number; frames: number }

/**
 * Width, (frame) height and frame count read from the header only — nothing
 * is decoded, so this is safe on a decompression bomb. Null when neither
 * sharp nor the header parser can read it.
 */
export async function imageGeometry(buf: Buffer): Promise<ImageGeometry | null> {
  let width = 0
  let height = 0
  let frames = 1
  try {
    // No pixel limit here: the point is to measure before anything decodes.
    const meta = await sharp(buf, { limitInputPixels: false, failOn: 'none' }).metadata()
    width = meta.width ?? 0
    height = meta.pageHeight ?? meta.height ?? 0
    frames = Math.max(1, meta.pages ?? 1)
  } catch {
    /* fall back to the header parser */
  }
  if (!width || !height) {
    const size = imageSizeFromBytes(buf)
    width = size?.width ?? 0
    height = size?.height ?? 0
  }
  frames = Math.max(frames, apngFrameCount(buf))
  return width > 0 && height > 0 ? { width, height, frames } : null
}

/** Refuse an image that cannot be measured or decodes to more than MAX_INPUT_PIXELS. */
export async function assertImageWithinLimits(buf: Buffer): Promise<ImageGeometry> {
  const g = await imageGeometry(buf)
  if (!g) throw new ImageRejectedError('UNREADABLE_IMAGE', 'The image could not be read (corrupt or unsupported file)')
  if (g.width * g.height * g.frames > MAX_INPUT_PIXELS) {
    const frames = g.frames > 1 ? ` × ${g.frames} frames` : ''
    throw new ImageRejectedError(
      'TOO_MANY_PIXELS',
      `Image is too large to publish: ${g.width}×${g.height}${frames} exceeds the ${MAX_INPUT_PIXELS / 1e6} megapixel limit`,
    )
  }
  return g
}

export type VariantFile = { name: string; width: number; format: VariantFormat; buf: Buffer; contentType: string; placeholder?: true }

export type ProcessedUpload = {
  /** Bytes to store as the original (re-encoded without metadata; unchanged only for GIFs and on failure). */
  buf: Buffer
  width: number | null
  height: number | null
  variants: VariantFile[]
}

const open = (input: Buffer) => sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })

/** True when the raw pixels use at most `max` distinct colours. */
async function fitsPalette(img: Sharp, max = 256): Promise<boolean> {
  const { data, info } = await img.clone().raw().toBuffer({ resolveWithObject: true })
  const step = info.channels
  const seen = new Set<number>()
  for (let i = 0; i < data.length; i += step) {
    const r = data[i]
    const g = step > 1 ? data[i + 1] : r
    const b = step > 2 ? data[i + 2] : r
    const a = step === 4 ? data[i + 3] : step === 2 ? data[i + 1] : 255
    seen.add(((r << 24) | (g << 16) | (b << 8) | a) >>> 0)
    if (seen.size > max) return false
  }
  return true
}

/** Encoder settings per variant format (G4). */
const ENCODERS: Record<VariantFormat, (img: Sharp) => Sharp> = {
  webp: (img) => img.webp({ quality: 72 }),
  avif: (img) => img.avif({ quality: 50, effort: 2 }),
}

/**
 * The variants of an (upright) image `width` px wide, for the stored name
 * `safeName`: WebP and AVIF at every width variantWidthsFor() lists, and the
 * blur placeholder. `skip(name)` leaves out files that exist already.
 */
export async function makeVariants(buf: Buffer, safeName: string, width: number, skip: (name: string) => boolean = () => false): Promise<VariantFile[]> {
  const out: VariantFile[] = []
  const widths = variantWidthsFor(width)
  for (const w of widths) {
    for (const format of variantFormatsAt(safeName, w, width)) {
      const name = variantName(safeName, w, format)
      // A legacy original's name can be too long for a variant suffix: no variant then.
      if (!isValidUploadName(name) || skip(name)) continue
      const data = await ENCODERS[format](open(buf).resize({ width: w, withoutEnlargement: true })).toBuffer()
      out.push({ name, width: w, format, buf: data, contentType: `image/${format}` })
    }
  }
  // C8: a 16 px WebP of the whole image, inlined by the pages as a blurred
  // placeholder while the real file loads (alpha kept for transparent PNGs).
  const lqip = placeholderName(safeName)
  if (widths.length && isValidUploadName(lqip) && !skip(lqip)) {
    const data = await open(buf).resize({ width: PLACEHOLDER_WIDTH }).webp({ quality: 50, effort: 6 }).toBuffer()
    out.push({ name: lqip, width: PLACEHOLDER_WIDTH, format: 'webp', buf: data, contentType: 'image/webp', placeholder: true })
  }
  return out
}

function headerSize(buf: Buffer): { width: number | null; height: number | null } {
  const size = imageSizeFromBytes(buf)
  return { width: size?.width ?? null, height: size?.height ?? null }
}

/**
 * Process an upload for storage under `safeName` (already sanitised, with
 * the canonical extension of its validated type). Never throws. Does not
 * enforce the pixel limit (storeUpload does, before calling it).
 */
export async function processUpload(buf: Buffer, safeName: string): Promise<ProcessedUpload> {
  try {
    if (apngFrameCount(buf) > 0) {
      // sharp would flatten an animated PNG to its first frame: keep the
      // frames as they are and drop only the metadata chunks.
      return { buf: stripPngMetadata(buf), ...headerSize(buf), variants: [] }
    }
    const meta = await open(buf).metadata()
    if (meta.format === 'gif') {
      return { buf, width: meta.width ?? null, height: meta.pageHeight ?? meta.height ?? null, variants: [] }
    }
    if ((meta.pages ?? 1) > 1) {
      if (meta.format !== 'webp') return { buf, width: meta.width ?? null, height: meta.pageHeight ?? meta.height ?? null, variants: [] }
      // Animated WebP: metadata chunks dropped losslessly; re-encoded frame by
      // frame (delays and loop kept) only when the chunk layout is malformed.
      const stripped = stripWebpMetadata(buf)
      if (stripped) return { buf: stripped, width: meta.width ?? null, height: meta.pageHeight ?? meta.height ?? null, variants: [] }
      let anim = sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', animated: true })
      if (meta.hasProfile) anim = anim.keepIccProfile()
      const { data, info } = await anim.webp(webpIsLossless(buf) ? { lossless: true } : { quality: 82 }).toBuffer({ resolveWithObject: true })
      return { buf: data, width: info.width, height: info.pageHeight ?? meta.pageHeight ?? meta.height ?? null, variants: [] }
    }
    const oriented = meta.autoOrient ?? { width: meta.width, height: meta.height }
    if (!oriented.width || !oriented.height) return { buf, ...headerSize(buf), variants: [] }

    const needsRotate = (meta.orientation ?? 1) !== 1
    const needsResize = Math.max(oriented.width, oriented.height) > MAX_EDGE

    // Upright and small enough: a JPEG / WebP keeps its exact compressed data
    // and only loses its metadata (no generation loss from re-encoding).
    if (!needsRotate && !needsResize && (meta.format === 'jpeg' || meta.format === 'webp')) {
      const stripped = meta.format === 'jpeg' ? stripJpegMetadata(buf) : stripWebpMetadata(buf)
      if (stripped) {
        const variants = await makeVariants(stripped, safeName, oriented.width)
        return { buf: stripped, width: oriented.width, height: oriented.height, variants }
      }
    }

    // Otherwise re-encoded: .rotate() applies the EXIF orientation and,
    // without withMetadata/keepExif, EXIF (GPS, camera serials), XMP, IPTC and
    // PNG text chunks are not written. Only the ICC profile is carried over.
    // PNG is always re-encoded (lossless; usually smaller with a palette).
    let img = open(buf).rotate()
    if (meta.hasProfile) img = img.keepIccProfile()
    if (needsResize) {
      img = img.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    }
    if (meta.format === 'jpeg') img = img.jpeg({ quality: 82, mozjpeg: true })
    else if (meta.format === 'png') img = (await fitsPalette(img)) ? img.png({ palette: true, compressionLevel: 9 }) : img.png({ compressionLevel: 9 })
    else if (meta.format === 'webp') img = img.webp(webpIsLossless(buf) ? { lossless: true } : { quality: 82 })
    else return { buf, width: oriented.width, height: oriented.height, variants: [] }
    const { data, info } = await img.toBuffer({ resolveWithObject: true })
    const variants = await makeVariants(data, safeName, info.width)
    return { buf: data, width: info.width, height: info.height, variants }
  } catch (err) {
    log.warn('image processing failed; storing the original unchanged', { name: safeName, err })
    return { buf, ...headerSize(buf), variants: [] }
  }
}

export function uploadsDir(): string {
  return path.join(process.cwd(), 'public', 'uploads')
}

/** Mirror one stored upload file to R2 (no-op without R2). Returns a warning on failure. */
export async function mirrorUpload(name: string, buf: Buffer, contentType: string): Promise<string | null> {
  if (!isR2Configured()) return null
  try {
    await r2PutBuffer(uploadR2Key(name), buf, contentType)
    return null
  } catch (err) {
    log.warn('R2 upload mirror failed', { name, err })
    return err instanceof Error ? err.message : String(err)
  }
}

/**
 * Write a variant file unless one already exists (uploads are immutable).
 * True only when this call wrote it — mirror it to R2 only then, or R2 would
 * get different bytes than the file public/uploads keeps.
 */
export function writeVariantFile(v: VariantFile): boolean {
  const fp = path.join(uploadsDir(), v.name)
  if (fs.existsSync(fp)) return false
  fs.writeFileSync(fp, v.buf as unknown as Uint8Array, { flag: 'wx' })
  return true
}

export type StoredUpload = {
  url: string
  name: string
  width: number | null
  height: number | null
  /** URLs of the stored WebP variants, narrowest first. */
  variants: string[]
  /** URLs of the stored AVIF variants, narrowest first. */
  avifVariants?: string[]
  r2Warning?: string
}

export type StoreUploadOptions = {
  /** Test seam: the R2 mirror (defaults to mirrorUpload). */
  mirror?: (name: string, buf: Buffer, contentType: string) => Promise<string | null>
}

/** True when `name` is taken in `dir`, or any variant file of that name exists (a stale one would be served for the new image). */
function nameInUse(dir: string, name: string): boolean {
  return fs.existsSync(path.join(dir, name)) || variantFilesOf(dir, name).length > 0
}

/**
 * Check, process and store a validated image under a fresh name derived
 * from `requestedName` (never overwriting: a clash on the name or on any of
 * its variant names gets a content-hash suffix; a variant-looking name is
 * renamed), write its variants and mirror what was written to R2.
 * Throws ImageRejectedError (nothing stored) for a pixel bomb or an
 * unreadable image.
 */
export async function storeUpload(raw: Buffer, mime: ImageMime, requestedName: string, opts: StoreUploadOptions = {}): Promise<StoredUpload> {
  const mirror = opts.mirror ?? mirrorUpload
  await assertImageWithinLimits(raw)
  const dir = uploadsDir()
  fs.mkdirSync(dir, { recursive: true })
  let safeName = asOriginalName(sanitizeUploadName(requestedName, IMAGE_TYPES[mime].ext))
  if (nameInUse(dir, safeName)) {
    safeName = withHashSuffix(safeName, crypto.createHash('sha256').update(raw).digest('hex'))
  }
  const processed = await processUpload(raw, safeName)
  const filePath = path.join(dir, safeName)
  const warnings: string[] = []
  // Only files this call wrote are mirrored. An existing one (the same
  // content uploaded again under its hash-suffixed name) stays as stored.
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, processed.buf as unknown as Uint8Array, { flag: 'wx' })
    const w = await mirror(safeName, processed.buf, mime)
    if (w) warnings.push(w)
  }
  const variants: string[] = []
  const avifVariants: string[] = []
  for (const v of processed.variants) {
    if (writeVariantFile(v)) {
      const w = await mirror(v.name, v.buf, v.contentType)
      if (w) warnings.push(w)
    }
    if (v.placeholder) continue
    ;(v.format === 'avif' ? avifVariants : variants).push(`/uploads/${v.name}`)
  }
  return {
    url: `/uploads/${safeName}`,
    name: safeName,
    width: processed.width,
    height: processed.height,
    variants,
    avifVariants,
    ...(warnings.length ? { r2Warning: `R2 upload failed: ${warnings[0]}` } : {}),
  }
}
