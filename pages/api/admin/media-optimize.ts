import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { getPage, listItems } from '../../../lib/contentStore'
import { readPublicHome } from '../../../lib/home'
import { PAGE_NAMES } from '../../../lib/mdx-admin'
import { pathsReferencingUploads, revalidatePaths, type ContentSource } from '../../../lib/revalidate'
import { UPLOAD_NAME_RE, isValidUploadName } from '../../../lib/security/uploadName'
import { isVariantName, variantName, variantWidthsFor } from '../../../lib/uploadVariants'
import { MAX_INPUT_PIXELS, apngFrameCount, makeVariants, mirrorUpload, uploadsDir, writeVariantFile } from '../../../lib/imageVariants'

/**
 * POST /api/admin/media-optimize
 *   → { processed, skipped, errors, remaining, revalidated, revalidateFailed? }
 *
 * Backfills responsive WebP variants for uploads made before the upload
 * pipeline existed: every original in public/uploads wider than the smallest
 * variant width gets the variants it is missing (written locally and, only
 * when this run wrote them, mirrored to R2). Originals are never rewritten —
 * they are referenced by content and served `immutable`. GIFs and animated
 * images (WebP, APNG) are skipped.
 *
 * Published pages embed an upload's srcset when they are generated, so every
 * page whose content references an image that got new variants is
 * regenerated right away (`revalidated`); the compile memo in lib/mdx.ts is
 * keyed on the variant state, so the new tree carries the srcset.
 *
 * One run at a time (409 while busy). A run stops after RUN_BUDGET_MS so the
 * request finishes well inside proxy timeouts; `remaining` > 0 means "call
 * again" (the client loops).
 */

const RUN_BUDGET_MS = 45_000
const EXTENSIONS = /\.(png|jpe?g|webp)$/i
const MAX_ERRORS = 20

const state = globalThis as typeof globalThis & { __mediaOptimizeBusy?: boolean }

/** Every published page (ISR) with the content that can reference uploads: bodies and covers. */
function publicUploadSources(): ContentSource[] {
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
    if (page) out.push({ path: `/${name}`, text: page.body })
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

export default withApi('admin/media-optimize', async (req, res, ctx) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')
  if (state.__mediaOptimizeBusy) return res.status(409).json({ error: 'An optimisation run is already in progress' })
  state.__mediaOptimizeBusy = true
  try {
    const dir = uploadsDir()
    let names: string[] = []
    try {
      names = fs.readdirSync(dir)
    } catch {
      names = []
    }
    const originals = names.filter((n) => UPLOAD_NAME_RE.test(n) && !isVariantName(n) && EXTENSIONS.test(n)).sort()
    const existing = new Set(names)
    const started = Date.now()
    let processed = 0
    let skipped = 0
    let remaining = 0
    const errors: Array<{ name: string; error: string }> = []
    // Originals that got at least one new variant file in this run.
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
        const missing = variantWidthsFor(width)
          .map((w) => variantName(name, w))
          .filter((v) => isValidUploadName(v) && !existing.has(v))
        if ((meta.pages ?? 1) > 1 || apngFrameCount(buf) > 0 || !missing.length) {
          skipped++
          continue
        }
        // Variants are made from the upright pixels; the original stays as stored.
        const upright = meta.orientation && meta.orientation !== 1 ? await sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().toBuffer() : buf
        const variants = await makeVariants(upright, name, width, (v) => existing.has(v))
        for (const v of variants) {
          // An existing file is left alone, and so is its R2 copy.
          if (!writeVariantFile(v)) continue
          existing.add(v.name)
          optimized.add(name)
          await mirrorUpload(v.name, v.buf, 'image/webp')
        }
        processed++
      } catch (err) {
        if (errors.length < MAX_ERRORS) errors.push({ name, error: err instanceof Error ? err.message : String(err) })
      }
    }
    let paths: string[] = []
    try {
      paths = optimized.size ? pathsReferencingUploads(optimized, publicUploadSources()) : []
    } catch (err) {
      // The variants are stored either way; the pages' ISR window still applies.
      ctx.log.warn('could not list the pages that use the optimised uploads', { err })
    }
    const failed = paths.length ? await revalidatePaths(res, paths) : []
    ctx.log.info('media optimisation run', { processed, skipped, errors: errors.length, remaining, revalidated: paths.length - failed.length })
    return res.status(200).json({
      processed,
      skipped,
      errors,
      remaining,
      revalidated: paths.filter((p) => !failed.includes(p)),
      ...(failed.length ? { revalidateFailed: failed } : {}),
    })
  } finally {
    state.__mediaOptimizeBusy = false
  }
})
