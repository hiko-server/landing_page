import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { rateLimit } from '../../../lib/rateLimit'
import {
  ERROR_STATUSES,
  deleteErrors,
  deleteResolvedErrors,
  errorTotals,
  getError,
  isFingerprint,
  listErrors,
  setErrorStatus,
  type ErrorStatus,
} from '../../../lib/errors/store'

/**
 * The admin Errors panel (admin only, never cached):
 *
 *   GET    ?status=open|resolved|ignored|all → { errors, totals }
 *   GET    ?fp=<fingerprint>                 → { error } (with a 30-day series)
 *   PATCH  { fingerprints: [...], status }   → { changed }   resolve / reopen / ignore
 *   DELETE { fingerprints: [...] }           → { deleted }
 *   DELETE { resolved: true }                → { deleted }   clear every resolved error
 */
const MAX_BATCH = 200

function fingerprintsOf(body: unknown): string[] | null {
  const list = (body as { fingerprints?: unknown } | null)?.fingerprints
  if (!Array.isArray(list) || !list.length || list.length > MAX_BATCH) return null
  return list.every(isFingerprint) ? (list as string[]) : null
}

export default withApi('admin/errors', (req, res) => {
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET') {
    const fp = req.query.fp
    if (fp !== undefined) {
      if (!isFingerprint(fp)) return res.status(400).json({ error: 'Invalid fingerprint' })
      const one = getError(fp)
      return one
        ? res.status(200).json({ error: one })
        : res.status(404).json({ error: 'Not found' })
    }
    const raw = typeof req.query.status === 'string' ? req.query.status : 'open'
    const status =
      raw === 'all' || (ERROR_STATUSES as readonly string[]).includes(raw)
        ? (raw as ErrorStatus | 'all')
        : 'open'
    return res.status(200).json({ errors: listErrors({ status }), totals: errorTotals() })
  }

  if (req.method === 'PATCH' || req.method === 'DELETE') {
    const rl = rateLimit(req, 120, 10 * 60_000, 'admin:errors:write')
    if (!rl.allowed) return res.status(429).json({ error: 'Too many changes, try again shortly' })
  }

  if (req.method === 'PATCH') {
    const fps = fingerprintsOf(req.body)
    const status = (req.body as { status?: unknown } | null)?.status
    if (
      !fps ||
      typeof status !== 'string' ||
      !(ERROR_STATUSES as readonly string[]).includes(status)
    ) {
      return res
        .status(400)
        .json({ error: 'Send { fingerprints: [...], status: "open" | "resolved" | "ignored" }' })
    }
    return res.status(200).json({ changed: setErrorStatus(fps, status as ErrorStatus) })
  }

  if (req.method === 'DELETE') {
    if ((req.body as { resolved?: unknown } | null)?.resolved === true) {
      return res.status(200).json({ deleted: deleteResolvedErrors() })
    }
    const fps = fingerprintsOf(req.body)
    if (!fps)
      return res.status(400).json({ error: 'Send { fingerprints: [...] } or { resolved: true }' })
    return res.status(200).json({ deleted: deleteErrors(fps) })
  }

  res.setHeader('Allow', 'GET, PATCH, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
})
