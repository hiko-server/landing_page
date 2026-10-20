import { withApi } from '../../../../lib/apiHandler'
import { isAdminRequest } from '../../../../lib/auth'
import { rateLimit } from '../../../../lib/rateLimit'
import { revalidatePaths } from '../../../../lib/revalidate'
import { recordAdminAudit } from '../../../../lib/audit/record'
import { runInAuditScope, type AuditScope } from '../../../../lib/audit/context'
import { ImageRejectedError } from '../../../../lib/imageVariants'
import { ImageQueueFullError } from '../../../../lib/imageJobs'
import { parseImageUpload } from '../../../../lib/media/uploadBody'
import { replaceUpload } from '../../../../lib/media/replace'
import { listLibrary } from '../../../../lib/media/list'

/**
 * POST /api/admin/media/replace { name, filename, dataUrl } — replace an
 * upload's file (H7, lib/media/replace): the new image goes through the
 * upload pipeline under a new name, every post, case study, page, the home
 * page and the CV that use the old one are pointed at it (a history
 * snapshot each), the old address redirects to it, the old file waits in
 * the trash, and the pages that show it are regenerated.
 *
 *   → { ok, from, url, name, width, height, rewrites, revalidated,
 *       revalidateFailed?, warnings?, skipped?, library } — `skipped`: the
 *       documents left on the old address (it redirects) because their
 *       new text would not render
 *
 * The body is checked like an upload (lib/media/uploadBody) and shares the
 * upload rate limit. Admin only.
 */
export default withApi('admin/media/replace', async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')
  const rl = rateLimit(req, 20, 10 * 60 * 1000, '/api/admin/upload-image')
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))))
    return res.status(429).json({ error: 'Too many uploads, try later' })
  }
  const name = typeof req.body?.name === 'string' ? req.body.name : ''
  const parsed = parseImageUpload(req.body)
  if (!parsed.ok) return res.status(parsed.status).json({ error: parsed.error })

  const scope: AuditScope = { snapshots: [] }
  let out
  try {
    out = await runInAuditScope(scope, () => replaceUpload({ name, raw: parsed.buf, mime: parsed.mime, filename: parsed.filename }))
  } catch (err) {
    if (err instanceof ImageRejectedError) return res.status(err.status).json({ error: err.message, code: err.code })
    if (err instanceof ImageQueueFullError) {
      res.setHeader('Retry-After', String(err.retryAfterSeconds))
      return res.status(err.status).json({ error: err.message, code: 'BUSY' })
    }
    throw err
  }
  if (!out.ok) return res.status(out.status).json({ error: out.error, code: out.code })

  const references = out.rewrites.reduce((n, r) => n + r.references, 0)
  recordAdminAudit(
    req,
    res,
    {
      action: 'media.replace',
      area: 'media',
      target: out.upload.name,
      summary: `Replaced image “${out.from}” with “${out.upload.name}”${references ? ` (${references} reference${references === 1 ? '' : 's'} updated)` : ''}`,
    },
    { snapshots: scope.snapshots },
  )
  const failed = out.paths.length ? await revalidatePaths(res, out.paths) : []
  return res.status(200).json({
    ok: true,
    from: out.from,
    name: out.upload.name,
    url: out.upload.url,
    width: out.upload.width,
    height: out.upload.height,
    rewrites: out.rewrites,
    revalidated: out.paths.filter((p) => !failed.includes(p)),
    ...(failed.length ? { revalidateFailed: failed } : {}),
    ...(out.warnings.length ? { warnings: out.warnings } : {}),
    ...(out.skipped.length ? { skipped: out.skipped } : {}),
    library: listLibrary(),
  })
})

// The new image arrives as a base64 data URL, like an upload.
export const config = {
  api: {
    bodyParser: { sizeLimit: '12mb' },
  },
}
