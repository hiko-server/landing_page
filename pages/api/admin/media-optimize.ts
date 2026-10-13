import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { UPLOAD_NAME_RE } from '../../../lib/security/uploadName'
import { isVariantName, variantName, variantWidthsFor } from '../../../lib/uploadVariants'
import { MAX_INPUT_PIXELS, makeVariants, mirrorUpload, uploadsDir, writeVariantFile } from '../../../lib/imageVariants'

/**
 * POST /api/admin/media-optimize → { processed, skipped, errors, remaining }
 *
 * Backfills responsive WebP variants for uploads made before the upload
 * pipeline existed: every original in public/uploads wider than the smallest
 * variant width gets the variants it is missing (written locally and
 * mirrored to R2). Originals are never rewritten — they are referenced by
 * content and served `immutable`. GIFs and animated images are skipped.
 *
 * One run at a time (409 while busy). A run stops after RUN_BUDGET_MS so the
 * request finishes well inside proxy timeouts; `remaining` > 0 means "call
 * again" (the client loops).
 */

const RUN_BUDGET_MS = 45_000
const EXTENSIONS = /\.(png|jpe?g|webp)$/i
const MAX_ERRORS = 20

const state = globalThis as typeof globalThis & { __mediaOptimizeBusy?: boolean }

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
        const missing = variantWidthsFor(width).filter((w) => !existing.has(variantName(name, w)))
        if ((meta.pages ?? 1) > 1 || !missing.length) {
          skipped++
          continue
        }
        // Variants are made from the upright pixels; the original stays as stored.
        const upright = meta.orientation && meta.orientation !== 1 ? await sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().toBuffer() : buf
        const variants = await makeVariants(upright, name, width, (v) => existing.has(v))
        for (const v of variants) {
          if (writeVariantFile(v)) existing.add(v.name)
          await mirrorUpload(v.name, v.buf, 'image/webp')
        }
        processed++
      } catch (err) {
        if (errors.length < MAX_ERRORS) errors.push({ name, error: err instanceof Error ? err.message : String(err) })
      }
    }
    ctx.log.info('media optimisation run', { processed, skipped, errors: errors.length, remaining })
    return res.status(200).json({ processed, skipped, errors, remaining })
  } finally {
    state.__mediaOptimizeBusy = false
  }
})
