import fs from 'fs'
import path from 'path'
import { imageSizeFromBytes } from '../rehype/imageSize'
import { isValidUploadName } from '../security/uploadName'
import { isVariantName, variantName, variantWidthsFor } from '../uploadVariants'
import type { ImageInfo } from './analyze'

/**
 * File facts for a same-site image (SERVER-ONLY): size on disk, pixel size
 * from the header, animation, and which responsive variants an upload has —
 * the same eligibility media-optimize uses (JPEG / PNG / WebP, not animated,
 * wider than the smallest variant). Only the first HEAD_BYTES are read, and
 * results are memoised per file version (mtime + size).
 */

const HEAD_BYTES = 256 * 1024
const MEMO_MAX = 500
const VARIANT_EXT = /\.(png|jpe?g|webp)$/i

type Memo = { mtimeMs: number; size: number; info: Omit<ImageInfo, 'missingVariants'> }
const memo = new Map<string, Memo>()

function formatOf(name: string, head: Buffer): ImageInfo['format'] {
  if (head.length > 3 && head[0] === 0xff && head[1] === 0xd8) return 'jpeg'
  if (head.length > 8 && head[0] === 0x89 && head.toString('latin1', 1, 4) === 'PNG') return 'png'
  if (
    head.length > 12 &&
    head.toString('latin1', 0, 4) === 'RIFF' &&
    head.toString('latin1', 8, 12) === 'WEBP'
  )
    return 'webp'
  if (head.length > 6 && head.toString('latin1', 0, 4) === 'GIF8') return 'gif'
  if (/\.svg$/i.test(name)) return 'svg'
  if (/\.avif$/i.test(name)) return 'avif'
  return 'other'
}

/** acTL before the first IDAT (APNG), or the VP8X animation flag (WebP). */
function isAnimated(format: ImageInfo['format'], head: Buffer): boolean {
  if (format === 'gif') return true
  if (format === 'webp')
    return head.length > 20 && head.toString('latin1', 12, 16) === 'VP8X' && (head[20] & 0x02) !== 0
  if (format === 'png') {
    let o = 8
    while (o + 12 <= head.length) {
      const len = head.readUInt32BE(o)
      const type = head.toString('latin1', o + 4, o + 8)
      if (type === 'acTL') return true
      if (type === 'IDAT' || type === 'IEND') return false
      o += 12 + len
    }
  }
  return false
}

function readHead(file: string, size: number): Buffer {
  const fd = fs.openSync(file, 'r')
  try {
    const buf = Buffer.alloc(Math.min(HEAD_BYTES, size))
    fs.readSync(fd, buf, 0, buf.length, 0)
    return buf
  } finally {
    fs.closeSync(fd)
  }
}

export type ImageInfoOptions = {
  /** public/ (default: <cwd>/public). */
  publicDir?: string
  /** Uploads that are only in R2 are served from there: unknown rather than missing. */
  r2Configured?: boolean
}

const unknown = (
  kind: ImageInfo['kind'],
  upload: string | null,
  exists: boolean | null
): ImageInfo => ({
  kind,
  exists,
  bytes: null,
  width: null,
  height: null,
  format: null,
  animated: false,
  variantEligible: false,
  missingVariants: [],
  upload,
})

/** Facts about `/uploads/<name>` or another file under public/. */
export function imageInfo(src: string, opts: ImageInfoOptions = {}): ImageInfo {
  const publicDir = path.resolve(opts.publicDir ?? path.join(process.cwd(), 'public'))
  let rel: string
  try {
    rel = decodeURIComponent(src.split(/[?#]/)[0])
  } catch {
    return unknown('other', null, null)
  }
  if (!rel.startsWith('/') || rel.startsWith('//')) return unknown('other', null, null)
  const m = /^\/uploads\/([^/]+)$/.exec(rel)
  const upload = m && isValidUploadName(m[1]) ? m[1] : null
  if (m && !upload) return unknown('other', null, null)
  const kind: ImageInfo['kind'] = upload ? 'upload' : 'static'
  const file = path.resolve(publicDir, `.${rel}`)
  if (!file.startsWith(publicDir + path.sep)) return unknown('other', null, null)
  let stat: fs.Stats
  try {
    stat = fs.statSync(file)
    if (!stat.isFile()) throw new Error('not a file')
  } catch {
    return unknown(kind, upload, upload && opts.r2Configured ? null : false)
  }
  let hit = memo.get(file)
  if (!hit || hit.mtimeMs !== stat.mtimeMs || hit.size !== stat.size) {
    let head: Buffer
    try {
      head = readHead(file, stat.size)
    } catch {
      return unknown(kind, upload, null)
    }
    const format = formatOf(file, head)
    const dims = imageSizeFromBytes(head)
    const animated = isAnimated(format, head)
    const eligible =
      !!upload &&
      !isVariantName(upload) &&
      VARIANT_EXT.test(upload) &&
      !animated &&
      (format === 'jpeg' || format === 'png' || format === 'webp') &&
      !!dims &&
      variantWidthsFor(dims.width).length > 0
    hit = {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      info: {
        kind,
        exists: true,
        bytes: stat.size,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
        format,
        animated,
        variantEligible: eligible,
        upload,
      },
    }
    memo.set(file, hit)
    while (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value as string)
  }
  // Variants appear later (media-optimize, a fix), so they are looked up every time.
  const { width } = hit.info
  const missing =
    hit.info.variantEligible && width && upload
      ? variantWidthsFor(width).filter(
          (w) => !fs.existsSync(path.join(path.dirname(file), variantName(upload, w)))
        )
      : []
  return { ...hit.info, missingVariants: missing }
}
