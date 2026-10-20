import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { rateLimit } from '../../../lib/rateLimit'
import type { Logger } from '../../../lib/log'
import {
  applyFixes,
  MAX_FIXES_PER_REQUEST,
  type VariantRun,
} from '../../../lib/contentHealth/apply'
import { buildReport, buildSummary, linkStatus } from '../../../lib/contentHealth/collect'
import { imageInfo } from '../../../lib/contentHealth/images'
import { startLinkCheck } from '../../../lib/contentHealth/linkRunner'
import type { FixRequest } from '../../../lib/contentHealth/types'
import { MediaOptimizeBusyError, optimizeUploads, pagesUsingUploads } from '../../../lib/mediaOptimize'

/**
 * The content health center (Admin → System → Content; lib/contentHealth).
 *
 *   GET                         → the report: issues of the published posts,
 *                                 case studies, pages, the CV and the home
 *                                 page, with counts and the link checker state
 *   GET ?summary=1              → counts and link state only (System → Health)
 *   GET ?links=1                → the link checker state (polled during a run)
 *   POST {action:'check-links'} → 202, starts a link check in the background
 *                                 (409 while one runs; 6 per hour)
 *   POST {action:'fix', fixes:[{id, version}]}
 *                               → applies the safe fixes of those issues
 *                                 through the editor's save path
 *                                 (lib/contentHealth/apply): 200 when at
 *                                 least one was applied, 409 when nothing was
 *                                 (an item changed since the report, or the
 *                                 problems are already gone), 422 when every
 *                                 fix failed; per-fix results in `results`.
 *                                 20 requests per 10 minutes.
 *
 * Admin only. Writes go through withApi('admin/content-health'), so the
 * activity log records "Started a link check" / "Applied N content health
 * fixes" (lib/audit/describe).
 */

async function generateVariants(names: ReadonlySet<string>, log: Logger): Promise<VariantRun> {
  try {
    const run = await optimizeUploads({ only: names })
    const done = new Set(
      Array.from(names).filter((n) => {
        const info = imageInfo(`/uploads/${encodeURIComponent(n)}`)
        return info.exists === true && info.missingVariants.length === 0
      })
    )
    return { done, errors: run.errors, busy: false, paths: pagesUsingUploads(run.optimized, log) }
  } catch (err) {
    if (err instanceof MediaOptimizeBusyError)
      return { done: new Set(), errors: [], busy: true, paths: [] }
    throw err
  }
}

function parseFixes(raw: unknown): FixRequest[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_FIXES_PER_REQUEST) return null
  const out: FixRequest[] = []
  for (const f of raw) {
    if (!f || typeof f !== 'object') return null
    const { id, version } = f as { id?: unknown; version?: unknown }
    if (typeof id !== 'string' || !/^[a-z-]{2,24}-[a-z0-9]{1,16}$/.test(id)) return null
    if (version !== undefined && (typeof version !== 'number' || !Number.isFinite(version)))
      return null
    out.push({ id, ...(typeof version === 'number' ? { version } : {}) })
  }
  return out
}

export default withApi('admin/content-health', async (req, res, ctx) => {
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET') {
    if (req.query.links === '1') return res.status(200).json(linkStatus())
    if (req.query.summary === '1') return res.status(200).json(buildSummary())
    return res.status(200).json(buildReport())
  }

  if (req.method === 'POST') {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      action?: unknown
      fixes?: unknown
    }
    if (body.action === 'check-links') {
      const rl = rateLimit(req, 6, 60 * 60 * 1000)
      res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
      if (!rl.allowed)
        return res
          .status(429)
          .json({ error: 'Too many link checks; the next one is possible within the hour.' })
      if (!startLinkCheck('manual'))
        return res
          .status(409)
          .json({ error: 'A link check is already running.', links: linkStatus() })
      ctx.log.info('link check started', { trigger: 'manual' })
      return res.status(202).json({ started: true, links: linkStatus() })
    }
    if (body.action === 'fix') {
      const fixes = parseFixes(body.fixes)
      if (!fixes)
        return res
          .status(400)
          .json({ error: `Send 1–${MAX_FIXES_PER_REQUEST} fixes as [{ id, version }].` })
      const rl = rateLimit(req, 20, 10 * 60 * 1000)
      res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
      if (!rl.allowed)
        return res
          .status(429)
          .json({ error: 'Too many fixes at once; try again in a few minutes.' })
      const out = await applyFixes(res, fixes, {
        log: ctx.log,
        generateVariants: (names) => generateVariants(names, ctx.log),
      })
      ctx.log.info('content health fixes', { requested: fixes.length, applied: out.applied })
      if (out.applied > 0) return res.status(200).json(out)
      const conflict = out.results.some((r) => r.code === 'VERSION_CONFLICT')
      const stale = out.results.every((r) => r.ok)
      if (conflict || stale) {
        return res.status(409).json({
          ...out,
          error: conflict
            ? out.results.find((r) => r.code === 'VERSION_CONFLICT')?.error
            : 'Nothing left to fix: the report is out of date.',
        })
      }
      return res
        .status(422)
        .json({
          ...out,
          error: out.results.find((r) => !r.ok)?.error || 'The fixes could not be applied.',
        })
    }
    return res.status(400).json({ error: 'Unknown action' })
  }

  res.setHeader('Allow', 'GET,POST')
  return res.status(405).json({ error: 'Method not allowed' })
})
