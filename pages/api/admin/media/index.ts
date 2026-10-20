import type { NextApiRequest, NextApiResponse } from 'next'
import { withApi, type ApiContext } from '../../../../lib/apiHandler'
import { isAdminRequest } from '../../../../lib/auth'
import { rateLimit } from '../../../../lib/rateLimit'
import { revalidatePaths } from '../../../../lib/revalidate'
import { recordAdminAudit } from '../../../../lib/audit/record'
import { isValidUploadName } from '../../../../lib/security/uploadName'
import { isVariantName } from '../../../../lib/uploadVariants'
import { MediaOptimizeBusyError, optimizeUploads, pagesUsingUploads } from '../../../../lib/mediaOptimize'
import { listLibrary } from '../../../../lib/media/list'
import { rebuildUsage } from '../../../../lib/media/library'
import { saveMediaMeta } from '../../../../lib/media/metaStore'
import { moveToTrash, purgeFromTrash, restoreFromTrash } from '../../../../lib/media/trash'
import { mirrorToR2, pullFromR2, scanR2 } from '../../../../lib/media/r2sync'
import { applyDefaultAlt } from '../../../../lib/media/applyAltServer'
import { runInAuditScope, type AuditScope } from '../../../../lib/audit/context'

/**
 * The media library (H7) — admin only, never cached.
 *
 *   GET  → MediaLibraryResponse (lib/media/types): every upload with its
 *          facts, variants, R2 state, where it is used and its default
 *          texts, plus the trash.
 *   POST { action, … }
 *     meta      { name, alt?, altZh?, caption?, captionZh?, expectedUpdatedAt? }
 *               → { ok, meta } · 409 { current } when the texts changed elsewhere
 *     apply-alt { name } → the default alt text filled in wherever a post,
 *               case study or page shows the image without one (a history
 *               snapshot each; lib/media/applyAltServer)
 *     delete    { names } → moved to the 30-day trash; a used upload is
 *               refused (`blocked`, with where it is used)
 *     restore   { names } · purge { names } (delete for good, from the trash)
 *     optimize  { names } → responsive versions for those uploads
 *               (lib/mediaOptimize; `remaining` > 0: call again) and the
 *               pages that show them regenerated
 *     r2-scan   → list R2's uploads/ into the index
 *     r2-mirror { names } · r2-pull { names }
 *     refresh   → rebuild the usage index now
 *   Writes answer with the fresh library (`library`) where the grid changes.
 *
 * Every change is in the activity log (recordAdminAudit). Replacing a file
 * is POST /api/admin/media/replace (its body is an image).
 */

const MAX_BATCH = 100

function names(body: Record<string, unknown>): string[] | null {
  const raw = body.names
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_BATCH) return null
  const out = Array.from(new Set(raw.filter((n): n is string => typeof n === 'string')))
  return out.length === raw.length && out.every((n) => isValidUploadName(n) && !isVariantName(n)) ? out : null
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const quote = (s: string) => `“${s}”`
const subject = (list: readonly string[]) => (list.length === 1 ? `image ${quote(list[0])}` : plural(list.length, 'image'))

async function post(req: NextApiRequest, res: NextApiResponse, ctx: ApiContext) {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
  const action = typeof body.action === 'string' ? body.action : ''
  const rl = rateLimit(req, 120, 10 * 60 * 1000, 'admin-media')
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
  if (!rl.allowed) return res.status(429).json({ error: 'Too many changes in a short time — try again in a few minutes' })

  if (action === 'meta') {
    const name = typeof body.name === 'string' ? body.name : ''
    if (!isValidUploadName(name) || isVariantName(name)) return res.status(400).json({ error: 'Invalid name' })
    const expected = typeof body.expectedUpdatedAt === 'number' && Number.isFinite(body.expectedUpdatedAt) ? Math.trunc(body.expectedUpdatedAt) : undefined
    const input: Record<string, unknown> = {}
    for (const k of ['alt', 'altZh', 'caption', 'captionZh'] as const) {
      if (k in body) {
        if (typeof body[k] !== 'string') return res.status(400).json({ error: `${k} must be text` })
        input[k] = body[k]
      }
    }
    const out = await saveMediaMeta(name, input, expected)
    if (!out.ok) return res.status(out.status).json(out.status === 409 ? { error: out.error, code: 'CONFLICT', current: out.current } : { error: out.error })
    recordAdminAudit(req, res, { action: 'media.texts', area: 'media', target: name, summary: `Updated the alt text and caption of image ${quote(name)}` })
    return res.status(200).json({ ok: true, meta: out.meta, ...(out.r2Warning ? { r2Warning: out.r2Warning } : {}) })
  }

  if (action === 'apply-alt') {
    const name = typeof body.name === 'string' ? body.name : ''
    const scope: AuditScope = { snapshots: [] }
    const out = await runInAuditScope(scope, () => applyDefaultAlt(name))
    if (!out.ok) return res.status(out.status).json({ error: out.error })
    if (out.places) {
      recordAdminAudit(
        req,
        res,
        { action: 'media.apply-alt', area: 'media', target: name, summary: `Filled in the alt text of image ${quote(name)} in ${plural(out.places, 'place')}` },
        { snapshots: scope.snapshots },
      )
    }
    const failed = out.paths.length ? await revalidatePaths(res, out.paths) : []
    return res.status(200).json({
      ok: true,
      places: out.places,
      rewrites: out.rewrites,
      revalidated: out.paths.filter((p) => !failed.includes(p)),
      ...(failed.length ? { revalidateFailed: failed } : {}),
      ...(out.warnings.length ? { warnings: out.warnings } : {}),
      library: listLibrary(),
    })
  }

  if (action === 'delete' || action === 'restore' || action === 'purge') {
    const list = names(body)
    if (!list) return res.status(400).json({ error: `Send 1–${MAX_BATCH} upload names` })
    const done: string[] = []
    const failed: Array<{ name: string; code: string; error: string; usage?: unknown }> = []
    const warnings: string[] = []
    for (const name of list) {
      if (action === 'purge') {
        if (purgeFromTrash(name)) done.push(name)
        else failed.push({ name, code: 'NOT_FOUND', error: 'Not in the trash' })
        continue
      }
      const out = action === 'delete' ? await moveToTrash(name) : await restoreFromTrash(name)
      if (out.ok) {
        done.push(name)
        if (out.r2Warning) warnings.push(out.r2Warning)
      } else failed.push({ name, code: out.code, error: out.error, ...('usage' in out && out.usage ? { usage: out.usage } : {}) })
    }
    if (done.length) {
      const summary =
        action === 'delete'
          ? `Moved ${subject(done)} to the trash`
          : action === 'restore'
            ? `Restored ${subject(done)} from the trash`
            : `Deleted ${subject(done)} for good`
      recordAdminAudit(req, res, { action: `media.${action === 'delete' ? 'trash' : action}`, area: 'media', target: done.length === 1 ? done[0] : String(done.length), summary })
    }
    return res.status(200).json({ ok: failed.length === 0, done, failed, ...(warnings.length ? { warnings: Array.from(new Set(warnings)) } : {}), library: listLibrary() })
  }

  if (action === 'optimize') {
    const list = names(body)
    if (!list) return res.status(400).json({ error: `Send 1–${MAX_BATCH} upload names` })
    let run
    try {
      run = await optimizeUploads({ only: new Set(list) })
    } catch (err) {
      if (err instanceof MediaOptimizeBusyError) return res.status(409).json({ error: err.message, code: 'BUSY' })
      throw err
    }
    const paths = pagesUsingUploads(run.optimized, ctx.log)
    const failedPaths = paths.length ? await revalidatePaths(res, paths) : []
    if (run.optimized.size) {
      recordAdminAudit(req, res, {
        action: 'media.optimize',
        area: 'media',
        target: run.optimized.size === 1 ? Array.from(run.optimized)[0] : String(run.optimized.size),
        summary: `Generated responsive versions of ${subject(Array.from(run.optimized))}`,
      })
    }
    return res.status(200).json({
      ok: true,
      processed: run.processed,
      skipped: run.skipped,
      errors: run.errors,
      remaining: run.remaining,
      revalidated: paths.filter((p) => !failedPaths.includes(p)),
      ...(failedPaths.length ? { revalidateFailed: failedPaths } : {}),
      library: run.remaining ? undefined : listLibrary(),
    })
  }

  if (action === 'r2-scan') {
    const out = await scanR2()
    if (!out.ok) return res.status(502).json({ error: out.error })
    return res.status(200).json({ ...out, library: listLibrary() })
  }

  if (action === 'r2-mirror' || action === 'r2-pull') {
    const list = names(body)
    if (!list) return res.status(400).json({ error: `Send 1–${MAX_BATCH} upload names` })
    const out = action === 'r2-mirror' ? await mirrorToR2(list) : await pullFromR2(list)
    if (out.done.length) {
      recordAdminAudit(req, res, {
        action: action === 'r2-mirror' ? 'media.r2-mirror' : 'media.r2-pull',
        area: 'media',
        target: out.done.length === 1 ? out.done[0] : String(out.done.length),
        summary: action === 'r2-mirror' ? `Copied ${subject(out.done)} to R2` : `Downloaded ${subject(out.done)} from R2 to the server`,
      })
    }
    return res.status(200).json({ ok: out.failed.length === 0, ...out, library: listLibrary() })
  }

  if (action === 'refresh') {
    rebuildUsage(true)
    return res.status(200).json({ ok: true, library: listLibrary() })
  }

  return res.status(400).json({ error: 'Unknown action' })
}

export default withApi('admin/media', async (req, res, ctx) => {
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'GET') return res.status(200).json(listLibrary())
  if (req.method === 'POST') return post(req, res, ctx)
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
})
