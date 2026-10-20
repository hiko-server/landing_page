import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { revalidatePaths } from '../../../lib/revalidate'
import { MediaOptimizeBusyError, optimizeUploads, pagesUsingUploads, type OptimizeRun } from '../../../lib/mediaOptimize'

/**
 * POST /api/admin/media-optimize
 *   → { processed, skipped, errors, remaining, revalidated, revalidateFailed? }
 *
 * Backfills the responsive variants of uploads made before the current
 * pipeline (lib/uploadVariants expectedVariantNames): the WebP and AVIF
 * variants at every width the original should have (320 / 480 / 640 / 1280 /
 * 1920 and its own width) and the blur placeholder — only the files it is
 * missing, written locally and, only when this run wrote them, mirrored to
 * R2. Originals are never rewritten — they are referenced by content and
 * served `immutable`. GIFs and animated images (WebP, APNG) are skipped.
 * AVIF encoding is the slow part on a one-vCPU server: the run budget below
 * keeps each request short and the client calls again.
 *
 * Published pages embed an upload's srcsets and placeholder when they are generated, so every
 * page whose content references an image that got new variants is
 * regenerated right away (`revalidated`); the compile memo in lib/mdx.ts is
 * keyed on the variant state, so the new tree carries the srcset.
 *
 * One run at a time (409 while busy). A run stops after RUN_BUDGET_MS so the
 * request finishes well inside proxy timeouts; `remaining` > 0 means "call
 * again" (the client loops).
 */

export default withApi('admin/media-optimize', async (req, res, ctx) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')
  let run: OptimizeRun
  try {
    run = await optimizeUploads()
  } catch (err) {
    if (err instanceof MediaOptimizeBusyError) return res.status(409).json({ error: err.message })
    throw err
  }
  const { processed, skipped, errors, remaining } = run
  const paths = pagesUsingUploads(run.optimized, ctx.log)
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
})
