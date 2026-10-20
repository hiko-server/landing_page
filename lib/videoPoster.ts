import fs from 'fs'
import path from 'path'
import { log } from './log'
import { safeFetch } from './security/safeFetch'
import type { RemoteImage } from './remoteImage'
import type { StoredUpload } from './imageVariants'
import { VARIANT_WIDTHS, placeholderName, variantAvifSrcSet, variantName, variantSrcSet } from './uploadVariants'
import { imageSizeFromBytes } from './rehype/imageSize'
import type { ImageSize } from './rehype/images'
import { parseVideoUrl, type VideoRef } from './videoUrl'

/**
 * Still images ("posters") for the click-to-load video facade. SERVER-ONLY.
 *
 * The facade must not contact YouTube or Vimeo before the visitor presses
 * play: a thumbnail hot-linked from i.ytimg.com sends every reader's IP
 * address to Google on page load (and is blocked in mainland China). So the
 * thumbnail is imported ONCE into the uploads — through lib/remoteImage
 * (safeFetch: https, public hosts only, pinned DNS, size and time limits;
 * the bytes must really be an image) and the upload pipeline (metadata
 * stripped, WebP variants, R2 mirror) — under a fixed name per video:
 *
 *   /uploads/video-youtube-<id>.jpg     /uploads/video-vimeo-<id>.jpg
 *
 * Imports happen when an article is saved in the admin (ensurePosters,
 * awaited with a deadline) and, for content that was never saved since, in
 * the background the first time the running server compiles it
 * (posterForCompile — never during `next build`). Until a poster exists the
 * facade shows a neutral panel. A failed import is retried after an hour.
 *
 *   YouTube  maxresdefault.jpg (1280×720), else hqdefault.jpg (480×360)
 *   Vimeo    the thumbnail_url of vimeo.com/api/oembed.json (i.vimeocdn.com)
 */

export type VideoPoster = { src: string; srcSet?: string; avifSrcSet?: string; width: number; height: number }

export type PosterDeps = {
  /** Download an image (defaults to lib/remoteImage fetchRemoteImage). */
  fetchImage?: (url: string) => Promise<RemoteImage>
  /** GET a small JSON document (defaults to safeFetch). */
  fetchJson?: (url: string) => Promise<unknown>
  /** Store the image as an upload (defaults to lib/imageVariants storeUpload). */
  store?: (buf: Buffer, mime: RemoteImage['mime'], name: string) => Promise<StoredUpload>
  /** The uploads directory (defaults to public/uploads). */
  dir?: string
  now?: () => number
}

/** Extensions a stored poster can have (storeUpload keeps the source format). */
const POSTER_EXTS = ['.jpg', '.webp', '.png'] as const
/** A failed import is not retried before this long. */
export const POSTER_RETRY_MS = 60 * 60 * 1000
/** Most videos one save imports posters for. */
export const MAX_POSTERS_PER_BODY = 8
/** How long a save waits for its poster imports (they continue in the background). */
export const POSTER_SAVE_BUDGET_MS = 8000

const VIMEO_THUMB_HOST_RE = /^i\.vimeocdn\.com$/i

/** public/uploads (as lib/imageVariants uploadsDir, without loading sharp on every page render). */
function uploadsDir(): string {
  return path.join(process.cwd(), 'public', 'uploads')
}

/** File stem of a video's poster: `video-youtube-<id>` / `video-vimeo-<id>`. */
export function posterStem(v: VideoRef): string {
  return `video-${v.provider}-${v.id}`
}

/** Intrinsic size of an image file (its header; stored posters carry no metadata), null when unreadable. */
function fileImageSize(file: string): ImageSize | null {
  let fd: number | null = null
  try {
    fd = fs.openSync(file, 'r')
    const buf = Buffer.alloc(64 * 1024)
    const n = fs.readSync(fd, buf, 0, buf.length, 0)
    return imageSizeFromBytes(buf.subarray(0, n))
  } catch {
    return null
  } finally {
    if (fd !== null) fs.closeSync(fd)
  }
}

/** The stored poster of a video, with its size and responsive variants; null when none is stored. */
export function findPoster(v: VideoRef, dir: string = uploadsDir()): VideoPoster | null {
  const stem = posterStem(v)
  for (const ext of POSTER_EXTS) {
    const name = `${stem}${ext}`
    const file = path.join(dir, name)
    if (!fs.existsSync(file)) continue
    const src = `/uploads/${name}`
    const size = fileImageSize(file)
    if (!size) continue
    const srcSet = dir === uploadsDir() ? variantSrcSet(src) : undefined
    const avifSrcSet = srcSet ? variantAvifSrcSet(src) : undefined
    return { src, ...(srcSet ? { srcSet } : {}), ...(avifSrcSet ? { avifSrcSet } : {}), width: size.width, height: size.height }
  }
  return null
}

/** Remote thumbnail URLs to try for a video, best first. */
export async function thumbnailCandidates(v: VideoRef, fetchJson: (url: string) => Promise<unknown>): Promise<string[]> {
  if (v.provider === 'youtube') {
    return [`https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`]
  }
  const page = `https://vimeo.com/${v.id}${v.hash ? `/${v.hash}` : ''}`
  const data = await fetchJson(`https://vimeo.com/api/oembed.json?width=1280&url=${encodeURIComponent(page)}`)
  const thumb = data && typeof data === 'object' ? (data as { thumbnail_url?: unknown }).thumbnail_url : undefined
  if (typeof thumb !== 'string') return []
  try {
    const u = new URL(thumb)
    return u.protocol === 'https:' && VIMEO_THUMB_HOST_RE.test(u.hostname) ? [u.toString()] : []
  } catch {
    return []
  }
}

const defaultFetchJson = async (url: string): Promise<unknown> => {
  const res = await safeFetch(url, { headers: { accept: 'application/json' }, timeoutMs: 6000, maxBytes: 64 * 1024, maxRedirects: 2 })
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
  return JSON.parse(res.body.toString('utf8'))
}

const inflight = new Map<string, Promise<VideoPoster | null>>()
const failedUntil = new Map<string, number>()

/** Forget in-flight imports and failures (tests). */
export function resetPosterState(): void {
  inflight.clear()
  failedUntil.clear()
}

/**
 * Import a video's poster unless it is stored already. Concurrent calls for
 * the same video share one download; a failure is remembered for an hour.
 * Never throws: resolves to the poster, or null.
 */
export function importPoster(v: VideoRef, deps: PosterDeps = {}): Promise<VideoPoster | null> {
  const dir = deps.dir ?? uploadsDir()
  const existing = findPoster(v, dir)
  if (existing) return Promise.resolve(existing)
  const stem = posterStem(v)
  const now = deps.now ?? Date.now
  if ((failedUntil.get(stem) ?? 0) > now()) return Promise.resolve(null)
  const running = inflight.get(stem)
  if (running) return running
  // The download and upload pipeline (sharp) load only when an import runs.
  const fetchImage = deps.fetchImage ?? (async (url: string) => (await import('./remoteImage')).fetchRemoteImage(url))
  const fetchJson = deps.fetchJson ?? defaultFetchJson
  const store = deps.store ?? (async (buf: Buffer, mime: RemoteImage['mime'], name: string) => (await import('./imageVariants')).storeUpload(buf, mime, name))
  const job = (async (): Promise<VideoPoster | null> => {
    try {
      const candidates = await thumbnailCandidates(v, fetchJson)
      for (const url of candidates) {
        let image: RemoteImage
        try {
          image = await fetchImage(url)
        } catch {
          continue
        }
        if (image.mime === 'image/gif') continue
        // Another import may have finished meanwhile: never store a second copy.
        const raced = findPoster(v, dir)
        if (raced) return raced
        await store(image.buf, image.mime, stem)
        const stored = findPoster(v, dir)
        if (stored) {
          log.info('video poster imported', { video: stem })
          return stored
        }
      }
      throw new Error('no thumbnail could be downloaded')
    } catch (err) {
      failedUntil.set(stem, now() + POSTER_RETRY_MS)
      log.warn('video poster import failed', { video: stem, err })
      return null
    } finally {
      inflight.delete(stem)
    }
  })()
  inflight.set(stem, job)
  return job
}

// ── Videos referenced by a body ─────────────────────────────────────────────

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/
/** A line that is only a link: `https://…` (GFM autolink), `[text](https://…)` or `[text](<https://…>)`. */
const LONE_LINK_RE = /^(?:<(https?:\/\/[^\s>]+)>|(https?:\/\/\S+)|\[(?:[^\]\\]|\\.)*\]\(\s*<?(https?:\/\/[^\s)>]+)>?(?:\s+"[^"]*")?\s*\))$/
const YOUTUBE_TAG_RE = /<YouTube\b[^>]*\bid\s*=\s*["']([A-Za-z0-9_-]{11})["']/g

/**
 * The videos a body shows as players: links alone in their paragraph
 * (blank lines around them, not indented, not in a list or quote) and
 * `<YouTube id="…">` tags; fenced code is skipped. Deduplicated, in order.
 */
export function videosIn(body: unknown): VideoRef[] {
  if (typeof body !== 'string' || !body) return []
  const lines = body.replace(/\r\n?/g, '\n').split('\n')
  const out = new Map<string, VideoRef>()
  const add = (v: VideoRef | null) => {
    if (v && !out.has(posterStem(v))) out.set(posterStem(v), v)
  }
  let fence: { char: string; len: number } | null = null
  lines.forEach((raw, i) => {
    const m = raw.match(FENCE_RE)
    if (fence) {
      if (m && m[1][0] === fence.char && m[1].length >= fence.len && !raw.slice(m[0].length).trim()) fence = null
      return
    }
    if (m) {
      fence = { char: m[1][0], len: m[1].length }
      return
    }
    for (const t of raw.matchAll(YOUTUBE_TAG_RE)) add({ provider: 'youtube', id: t[1] })
    if (/^\s/.test(raw)) return
    const blankAround = !(lines[i - 1] ?? '').trim() && !(lines[i + 1] ?? '').trim()
    if (!blankAround) return
    const link = LONE_LINK_RE.exec(raw.trim())
    if (link) add(parseVideoUrl(link[1] || link[2] || link[4]))
  })
  return Array.from(out.values())
}

/**
 * Import the posters of every video in `body` that has none yet (at most
 * MAX_POSTERS_PER_BODY), waiting at most `budgetMs`; imports still running
 * then finish in the background. Never throws.
 */
export async function ensurePosters(body: unknown, opts: { budgetMs?: number; deps?: PosterDeps } = {}): Promise<void> {
  const videos = videosIn(body).slice(0, MAX_POSTERS_PER_BODY)
  const missing = videos.filter((v) => !findPoster(v, opts.deps?.dir))
  if (!missing.length) return
  const all = Promise.all(missing.map((v) => importPoster(v, opts.deps)))
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([all, new Promise<void>((resolve) => (timer = setTimeout(resolve, opts.budgetMs ?? POSTER_SAVE_BUDGET_MS)))])
  if (timer) clearTimeout(timer)
}

/**
 * Which of the body's videos have a stored poster — part of the compile
 * cache key (lib/mdx compileMdxCached), so an article recompiles once its
 * poster arrives.
 */
export function posterState(body: unknown, dir: string = uploadsDir()): string {
  // Existence only (no file reads): this runs on every cached compile lookup.
  // Per poster: stored at all, and whether its AVIF variants and placeholder
  // exist yet (the media-optimize backfill writes them later).
  return videosIn(body)
    .map((v) => {
      const name = POSTER_EXTS.map((ext) => `${posterStem(v)}${ext}`).find((n) => fs.existsSync(path.join(dir, n)))
      if (!name) return `${posterStem(v)}:0`
      const avif = fs.existsSync(path.join(dir, variantName(name, VARIANT_WIDTHS[0], 'avif'))) ? 1 : 0
      const lqip = fs.existsSync(path.join(dir, placeholderName(name))) ? 1 : 0
      return `${posterStem(v)}:1:${avif}${lqip}`
    })
    .join('|')
}

/** True on the running server (not during `next build`, not in unit tests). */
function backgroundImportsAllowed(): boolean {
  return process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build'
}

/**
 * Poster lookup for the compiler: the stored poster, or null — and then, on
 * the running server, a background import so the next compile has it.
 */
export function posterForCompile(v: VideoRef): VideoPoster | null {
  const found = findPoster(v)
  if (found) return found
  if (backgroundImportsAllowed()) void importPoster(v)
  return null
}
