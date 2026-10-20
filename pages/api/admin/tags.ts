import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { rateLimit } from '../../../lib/rateLimit'
import { revalidatePaths } from '../../../lib/revalidate'
import { emitEditorialEvent } from '../../../lib/editorialEvents'
import { recordAdminAudit } from '../../../lib/audit/record'
import { applyTagChange, planTagChange, readTagInventory, type TagChangeRequest } from '../../../lib/tagAdminServer'

/**
 * Tag management for posts and case studies (H16).
 *
 *   GET  → { blog: TagEntry[], work: TagEntry[] } — every tag (post tags,
 *          case-study stack) grouped by slug with its spellings, usage count
 *          and the items carrying it (lib/tagAdmin)
 *   POST { collection, from: string[] (tag slugs), to, dryRun? }
 *        → dryRun: { ok, items, mergesInto } — what would change
 *        → else rename (one tag) or merge (several) into `to` on every item
 *          (a history snapshot per item; unpublished changes follow), then
 *          the public pages are regenerated:
 *          { ok, items, mergesInto, revalidated, revalidateFailed?, warnings? }
 *
 * Admin-only (middleware gate plus the session check here), never cached;
 * writes are rate-limited like the editors' saves.
 */
export default withApi('admin/tags', async (req, res) => {
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET') {
    return res.status(200).json({ blog: readTagInventory('blog'), work: readTagInventory('work') })
  }

  if (req.method === 'POST') {
    const b = (req.body || {}) as Record<string, unknown>
    const request: TagChangeRequest = {
      collection: b.collection === 'work' ? 'work' : b.collection === 'blog' ? 'blog' : (String(b.collection) as TagChangeRequest['collection']),
      from: Array.isArray(b.from) ? (b.from as string[]) : [],
      to: typeof b.to === 'string' ? b.to : '',
    }
    if (b.dryRun === true) {
      const plan = planTagChange(request)
      return res.status(plan.ok ? 200 : plan.status).json(plan.ok ? plan : { error: plan.error })
    }
    const rl = rateLimit(req, 30, 10 * 60 * 1000, 'admin-tags')
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
    if (!rl.allowed) return res.status(429).json({ error: 'Too many changes in a short time — try again in a few minutes' })
    const out = await applyTagChange(request)
    if (!out.ok) return res.status(out.status).json({ error: out.error })
    if (out.items.length) {
      const merge = request.from.length > 1
      emitEditorialEvent({ action: merge ? 'tag-merge' : 'tag-rename', collection: request.collection, from: request.from, to: request.to.trim(), items: out.items.length }, { req })
      // The activity log (H13): the tag names and the number of items touched — never content.
      recordAdminAudit(req, res, {
        action: merge ? 'tag.merge' : 'tag.rename',
        area: request.collection === 'work' ? 'work' : 'post',
        target: request.to.trim(),
        summary: `${merge ? 'Merged' : 'Renamed'} ${request.from.join(', ')} → ${request.to.trim()} on ${out.items.length} ${request.collection === 'work' ? 'case stud' + (out.items.length === 1 ? 'y' : 'ies') : 'post' + (out.items.length === 1 ? '' : 's')}`,
      })
    }
    const failed = out.paths.length ? await revalidatePaths(res, out.paths) : []
    return res.status(200).json({
      ok: true,
      items: out.items,
      mergesInto: out.mergesInto,
      revalidated: out.paths.filter((p) => !failed.includes(p)),
      ...(failed.length ? { revalidateFailed: failed } : {}),
      ...(out.warnings.length ? { warnings: out.warnings } : {}),
    })
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
})
