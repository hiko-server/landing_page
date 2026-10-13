import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import sharp, { type Sharp } from 'sharp'
import { log } from './log'
import { isR2Configured, r2PutBuffer } from './r2'
import { uploadR2Key } from './contentStore'
import { imageSizeFromBytes } from './rehype/imageSize'
import { sanitizeUploadName, withHashSuffix } from './security/uploadName'
import { variantName, variantWidthsFor } from './uploadVariants'

/**
 * Upload-time image processing (sharp) — the replacement for the disabled
 * Next image optimizer. SERVER-ONLY.
 *
 *   - EXIF orientation is applied (the stored pixels are upright).
 *   - An original whose long edge exceeds MAX_EDGE is downscaled to it and
 *     re-encoded in its own format (JPEG mozjpeg q82, PNG palette when it has
 *     ≤256 colours else zlib level 9, WebP q82). Otherwise the bytes are kept.
 *   - WebP q72 variants are made for every VARIANT_WIDTHS entry narrower than
 *     the original (lib/uploadVariants.ts names them).
 *   - GIFs and other animated images are stored untouched, without variants.
 *   - Any processing failure stores the original unchanged: an upload is
 *     never blocked by the optimizer.
 */

export const MAX_EDGE = 2560
/** Decompression-bomb guard (pixels). */
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

export type VariantFile = { name: string; width: number; buf: Buffer }

export type ProcessedUpload = {
  /** Bytes to store as the original (re-encoded only when it had to change). */
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

/** WebP variants of an (upright) image `width` px wide, for the stored name `safeName`. */
export async function makeVariants(buf: Buffer, safeName: string, width: number, skip: (name: string) => boolean = () => false): Promise<VariantFile[]> {
  const out: VariantFile[] = []
  for (const w of variantWidthsFor(width)) {
    const name = variantName(safeName, w)
    if (skip(name)) continue
    const data = await open(buf).resize({ width: w, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer()
    out.push({ name, width: w, buf: data })
  }
  return out
}

function headerSize(buf: Buffer): { width: number | null; height: number | null } {
  const size = imageSizeFromBytes(buf)
  return { width: size?.width ?? null, height: size?.height ?? null }
}

/**
 * Process an upload for storage under `safeName` (already sanitised, with
 * the canonical extension of its validated type). Never throws.
 */
export async function processUpload(buf: Buffer, safeName: string): Promise<ProcessedUpload> {
  try {
    const meta = await open(buf).metadata()
    const animated = (meta.pages ?? 1) > 1
    if (meta.format === 'gif' || animated) {
      return { buf, width: meta.width ?? null, height: meta.pageHeight ?? meta.height ?? null, variants: [] }
    }
    const oriented = meta.autoOrient ?? { width: meta.width, height: meta.height }
    let width = oriented.width
    let height = oriented.height
    if (!width || !height) return { buf, ...headerSize(buf), variants: [] }

    const needsRotate = !!meta.orientation && meta.orientation !== 1
    const needsResize = Math.max(width, height) > MAX_EDGE
    let original = buf
    if (needsRotate || needsResize) {
      let img = open(buf).rotate()
      if (needsResize) img = img.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      if (meta.format === 'jpeg') img = img.jpeg({ quality: 82, mozjpeg: true })
      else if (meta.format === 'png') img = (await fitsPalette(img)) ? img.png({ palette: true, compressionLevel: 9 }) : img.png({ compressionLevel: 9 })
      else if (meta.format === 'webp') img = img.webp({ quality: 82 })
      else return { buf, width, height, variants: [] }
      const { data, info } = await img.toBuffer({ resolveWithObject: true })
      original = data
      width = info.width
      height = info.height
    }
    const variants = await makeVariants(original, safeName, width)
    return { buf: original, width, height, variants }
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

/** Write a variant file unless one already exists (uploads are immutable). */
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
  r2Warning?: string
}

/**
 * Process and store a validated image under a fresh name derived from
 * `requestedName` (never overwriting: a clash gets a content-hash suffix),
 * write its variants and mirror everything to R2.
 */
export async function storeUpload(raw: Buffer, mime: ImageMime, requestedName: string): Promise<StoredUpload> {
  const dir = uploadsDir()
  fs.mkdirSync(dir, { recursive: true })
  let safeName = sanitizeUploadName(requestedName, IMAGE_TYPES[mime].ext)
  if (fs.existsSync(path.join(dir, safeName))) {
    safeName = withHashSuffix(safeName, crypto.createHash('sha256').update(raw).digest('hex'))
  }
  const processed = await processUpload(raw, safeName)
  const filePath = path.join(dir, safeName)
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, processed.buf as unknown as Uint8Array, { flag: 'wx' })
  const warnings: string[] = []
  const mainWarning = await mirrorUpload(safeName, processed.buf, mime)
  if (mainWarning) warnings.push(mainWarning)
  const variants: string[] = []
  for (const v of processed.variants) {
    writeVariantFile(v)
    variants.push(`/uploads/${v.name}`)
    const w = await mirrorUpload(v.name, v.buf, 'image/webp')
    if (w) warnings.push(w)
  }
  return {
    url: `/uploads/${safeName}`,
    name: safeName,
    width: processed.width,
    height: processed.height,
    variants,
    ...(warnings.length ? { r2Warning: `R2 upload failed: ${warnings[0]}` } : {}),
  }
}
