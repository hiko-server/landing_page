import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { MAX_INPUT_PIXELS } from './imageVariants'
import { uploadNameOf } from './uploadVariants'
import { uploadR2Key } from './contentStore'
import { isR2Configured, r2GetBuffer } from './r2'
import { fetchRemoteImage } from './remoteImage'
import { analyzeLogoPixels, parseLogoMetrics, type LogoMetrics } from './logoSize'
import type { HomeBrand } from './homeShape'
import { log as defaultLog, type Logger } from './log'

/**
 * Measure affiliation logos when the home document is saved (SERVER-ONLY):
 * the content box, aspect ratio and ink density that lib/logoSize.ts sizes
 * the brand strip with. The numbers are stored on each brand entry
 * (`metrics`), so visitors never pay for the measurement.
 *
 * Sources:
 *   - site files: `/images/…` and other paths under public/ (SVG included —
 *     these are the repository's own files);
 *   - uploads: `/uploads/<name>` from the disk, else from R2;
 *   - remote https images through lib/remoteImage (safeFetch: public hosts
 *     only, redirects re-checked, size and time limits; raster formats only,
 *     never a remote SVG).
 *
 * The image is decoded with sharp (pixel limit as for uploads), rasterised
 * to at most 400 px on its long side and handed to analyzeLogoPixels.
 * Metrics already stored for the same URL (and, for local files, the same
 * content hash) are reused, so a save only measures new or changed logos.
 * A logo that cannot be read keeps no metrics and renders with the fixed
 * fallback box.
 */

const ANALYSIS_EDGE = 400
const REMOTE_MAX_BYTES = 5 * 1024 * 1024
const REMOTE_TIMEOUT_MS = 8_000
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg|avif)$/i

export type LogoSource = { buf: Buffer; local: boolean }

function publicDir(): string {
  return path.join(process.cwd(), 'public')
}

/** A site-relative image path → its file under public/, or null (traversal, not an image). */
export function publicImagePath(url: string): string | null {
  let pathname: string
  try {
    pathname = decodeURIComponent(url.split(/[?#]/)[0])
  } catch {
    return null
  }
  if (!pathname.startsWith('/') || pathname.startsWith('//') || pathname.includes('\0') || !IMAGE_EXT.test(pathname)) return null
  const root = publicDir()
  const abs = path.resolve(root, `.${pathname}`)
  return abs.startsWith(root + path.sep) ? abs : null
}

/** The bytes of a logo URL (see the module comment for the allowed sources). */
export async function readLogoSource(url: string): Promise<LogoSource | null> {
  const src = url.trim()
  if (!src) return null
  if (/^https:\/\//i.test(src)) {
    const remote = await fetchRemoteImage(src, { maxBytes: REMOTE_MAX_BYTES, timeoutMs: REMOTE_TIMEOUT_MS })
    return { buf: remote.buf, local: false }
  }
  const upload = uploadNameOf(src)
  if (upload) {
    const file = path.join(publicDir(), 'uploads', upload)
    if (fs.existsSync(file)) return { buf: fs.readFileSync(file), local: true }
    if (isR2Configured()) {
      const buf = await r2GetBuffer(uploadR2Key(upload))
      return buf ? { buf, local: true } : null
    }
    return null
  }
  if (src.startsWith('/uploads/')) return null
  const file = publicImagePath(src)
  if (!file || !fs.existsSync(file)) return null
  return { buf: fs.readFileSync(file), local: true }
}

/** Short content hash of a local file (detects a file replaced at the same path). */
export function contentHash(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)
}

/** Decode, rasterise and analyse one image. Null when it has no inked pixels or cannot be decoded. */
export async function measureLogoBuffer(buf: Buffer): Promise<Pick<LogoMetrics, 'aspect' | 'density' | 'crop'> | null> {
  const isSvg = /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(buf.subarray(0, 2048).toString('utf8'))
  let density: number | undefined
  if (isSvg) {
    // Rasterise vectors large enough to measure thin strokes.
    const meta = await sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()
    const longest = Math.max(meta.width || 0, meta.height || 0) || 100
    density = Math.min(2400, Math.max(72, Math.round((72 * ANALYSIS_EDGE * 2) / longest)))
  }
  const { data, info } = await sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', ...(density ? { density } : {}), pages: 1 })
    .rotate()
    .resize({ width: ANALYSIS_EDGE, height: ANALYSIS_EDGE, fit: 'inside', withoutEnlargement: !isSvg })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return analyzeLogoPixels(new Uint8Array(data.buffer, data.byteOffset, data.length), info.width, info.height)
}

/** Measure a logo URL. */
export async function measureLogo(url: string): Promise<LogoMetrics | null> {
  const source = await readLogoSource(url)
  if (!source) return null
  const result = await measureLogoBuffer(source.buf)
  if (!result) return null
  return { ...result, source: url.trim(), ...(source.local ? { hash: contentHash(source.buf) } : {}) }
}

/**
 * The brands with up-to-date `metrics`: stored metrics are kept when they
 * were measured from the same URL (and, for a local file, the same
 * content); otherwise the logo is measured. Brands without an image, and
 * logos that cannot be measured, carry no metrics.
 */
export async function withLogoMetrics(
  brands: HomeBrand[],
  previous: HomeBrand[] | null | undefined,
  logger: Logger = defaultLog,
): Promise<HomeBrand[]> {
  const known = new Map<string, LogoMetrics>()
  for (const b of [...(previous || []), ...brands]) {
    const m = parseLogoMetrics(b?.metrics)
    if (m && typeof b?.image === 'string' && m.source === b.image.trim()) known.set(m.source, m)
  }
  const out: HomeBrand[] = []
  for (const brand of brands) {
    if (!brand || typeof brand !== 'object') {
      out.push(brand)
      continue
    }
    const rest: HomeBrand = { ...brand }
    delete rest.metrics
    const image = typeof brand.image === 'string' ? brand.image.trim() : ''
    if (!image) {
      out.push(rest)
      continue
    }
    try {
      const stored = known.get(image)
      if (stored && stored.hash) {
        // Local file: reuse only while its content is unchanged.
        const source = await readLogoSource(image)
        if (source && contentHash(source.buf) === stored.hash) {
          out.push({ ...rest, metrics: stored })
          continue
        }
      } else if (stored) {
        out.push({ ...rest, metrics: stored })
        continue
      }
      const measured = await measureLogo(image)
      out.push(measured ? { ...rest, metrics: measured } : rest)
    } catch (err) {
      logger.warn('logo could not be measured', { image, err })
      out.push(rest)
    }
  }
  return out
}
