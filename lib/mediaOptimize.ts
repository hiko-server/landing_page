import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { getPage, listItems } from './contentStore'
import { readPublicHome } from './home'
import { PAGE_NAMES } from './mdx-admin'
import { pagePublicPath } from './pageNames'
import { pathsReferencingUploads, type ContentSource } from './revalidate'
import { UPLOAD_NAME_RE, isValidUploadName } from './security/uploadName'
import { expectedVariantNames, isVariantName } from './uploadVariants'
import { MAX_INPUT_PIXELS, apngFrameCount, makeVariants, mirrorUpload, uploadsDir, writeVariantFile } from './imageVariants'
import { imageJobs } from './imageJobs'

/**
 * The responsive variants of uploads made before the current pipeline
 * (SERVER-ONLY; lib/uploadVariants expectedVariantNames): the WebP and AVIF
 * variants at every width the original should have (320 / 480 / 640 / 1280 /
 * 1920 and its own width) and the blur placeholder — only the files it is
 * missing. Used by POST /api/admin/media-optimize (every upload) and the
 * content health center's "Generate sizes" fix (only the uploads it names).
 * Originals are never rewritten; one run at a time; a run stops after
 * RUN_BUDGET_MS (AVIF encoding is the slow part on a one-vCPU server, so the
 * client calls again). pagesUsingUploads() lists the published pages whose
 * srcsets and placeholders changed, for revalidation (the compile memo in
 * lib/mdx.ts is keyed on the variant state).
 */

const RUN_BUDGET_MS = 45_000
const EXTENSIONS = /\.(png|jpe?g|webp)$/i
const MAX_ERRORS = 20

const state = globalThis as typeof globalThis & { __mediaOptimizeBusy?: boolean }

/** Every published page (ISR) with the content that can reference uploads: bodies and covers. */
export function publicUploadSources(): ContentSource[] {
  const out: ContentSource[] = []
  const workCovers: string[] = []
  for (const collection of ['blog', 'work'] as const) {
    for (const item of listItems(collection)) {
      const fm = (item.frontmatter || {}) as Record<string, unknown>
      if (fm.draft) continue
      const cover = typeof fm.cover === 'string' ? fm.cover : ''
      out.push({ path: `/${collection}/${item.slug}`, text: `${item.body}\n${cover}` })
      if (collection === 'work' && cover) workCovers.push(cover)
    }
  }
  // /work shows each case study's cover with its srcset.
  out.push({ path: '/work', text: workCovers.join('\n') })
  for (const name of PAGE_NAMES) {
    const page = getPage(name)
    if (page) out.push({ path: pagePublicPath(name), text: page.body })
  }
  // The home page ships the portrait's and the field-note photos' srcsets;
  // /about ships the portrait's.
  const home = readPublicHome()
  const avatar = typeof home?.hero?.avatarUrl === 'string' ? home.hero.avatarUrl : ''
  const photos = (Array.isArray(home?.photos) ? home.photos : []).map((p) => (typeof p?.url === 'string' ? p.url : ''))
  out.push({ path: '/', text: [avatar, ...photos].join('\n') })
  out.push({ path: '/about', text: avatar })
  return out
}

export class MediaOptimizeBusyError extends Error {
  constructor() {
    super('An optimisation run is already in progress')
    this.name = 'MediaOptimizeBusyError'
  }
}

export type OptimizeRun = {
  processed: number
  skipped: number
  errors: Array<{ name: string; error: string }>
  remaining: number
  /** Originals that got at least one new variant file in this run. */
  optimized: Set<string>
}

/**
 * One backfill run (see the module comment); `only` limits it to those
 * originals (the content health center's "Generate sizes" fix). Throws
 * MediaOptimizeBusyError while another run is in progress.
 */
export async function optimizeUploads(opts: { only?: ReadonlySet<string> } = {}): Promise<OptimizeRun> {
  if (state.__mediaOptimizeBusy) throw new MediaOptimizeBusyError()
  state.__mediaOptimizeBusy = true
  try {
    const dir = uploadsDir()
    let names: string[] = []
    try {
      names = fs.readdirSync(dir)
    } catch {
      names = []
    }
    const originals = names
      .filter((n) => UPLOAD_NAME_RE.test(n) && !isVariantName(n) && EXTENSIONS.test(n))
      .filter((n) => !opts.only || opts.only.has(n))
      .sort()
    const existing = new Set(names)
    const started = Date.now()
    let processed = 0
    let skipped = 0
    let remaining = 0
    const errors: Array<{ name: string; error: string }> = []
    const optimized = new Set<string>()

    for (let i = 0; i < originals.length; i++) {
      if (Date.now() - started > RUN_BUDGET_MS) {
        remaining = originals.length - i
        break
      }
      const name = originals[i]
      try {
        const buf = fs.readFileSync(path.join(dir, name))
        const meta = await sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()
        const width = meta.autoOrient?.width ?? meta.width ?? 0
        const missing = expectedVariantNames(name, width).filter((v) => isValidUploadName(v) && !existing.has(v))
        if ((meta.pages ?? 1) > 1 || apngFrameCount(buf) > 0 || !missing.length) {
          skipped++
          continue
        }
        // Encoded in the process-wide image queue (lib/imageJobs), one image
        // at a time, taking turns with uploads; made from the upright pixels,
        // the original stays as stored.
        const variants = await imageJobs().run(
          async () => {
            const upright = meta.orientation && meta.orientation !== 1 ? await sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().toBuffer() : buf
            return makeVariants(upright, name, width, (v) => existing.has(v))
          },
          { background: true },
        )
        for (const v of variants) {
          // An existing file is left alone, and so is its R2 copy.
          if (!writeVariantFile(v)) continue
          existing.add(v.name)
          optimized.add(name)
          await mirrorUpload(v.name, v.buf, v.contentType)
        }
        processed++
      } catch (err) {
        if (errors.length < MAX_ERRORS) errors.push({ name, error: err instanceof Error ? err.message : String(err) })
      }
    }
    return { processed, skipped, errors, remaining, optimized }
  } finally {
    state.__mediaOptimizeBusy = false
  }
}

/** Published pages that embed one of `optimized` (their srcsets changed), or [] when they cannot be listed. */
export function pagesUsingUploads(optimized: ReadonlySet<string>, log: { warn: (msg: string, fields?: Record<string, unknown>) => void }): string[] {
  try {
    return optimized.size ? pathsReferencingUploads(optimized, publicUploadSources()) : []
  } catch (err) {
    // The variants are stored either way; the pages' ISR window still applies.
    log.warn('could not list the pages that use the optimised uploads', { err })
    return []
  }
}

