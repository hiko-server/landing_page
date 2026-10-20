import type { NextApiRequest, NextApiResponse } from 'next'
import type { ApiContext } from '../apiHandler'
import { isAdminRequest } from '../auth'
import { rateLimit } from '../rateLimit'
import { recordAdminAudit } from '../audit/record'
import { safeFetch } from '../security/safeFetch'
import { normalizeOrcidId } from './id'
import { ORCID_API_HOST, fetchOrcidWorks, type Fetcher } from './fetch'

/**
 * POST /api/admin/orcid/works { orcid } → { orcid, fetchedAt, candidates, detailsFailed }
 * (SERVER-ONLY; pages/api/admin/orcid/works.ts mounts it).
 *
 * The CV Studio's "Import from ORCID": reads the public works of the
 * owner's ORCID record (lib/orcid/fetch — server-side only, through
 * safeFetch, the one allow-listed host pub.orcid.org) and maps them to
 * publication candidates (lib/orcid/works). It stores nothing: the Studio
 * shows the candidates, the owner ticks the ones to add, and they become
 * entries of the document the owner saves as usual.
 *
 * Admin only, READS_PER_WINDOW reads per browser per WINDOW_MS, and every
 * read that went out to ORCID is in the activity log (`orcid.read-works`,
 * with the status it answered — the iD itself is not logged).
 *
 *   400 BAD_ORCID       the iD is missing or fails its checksum
 *   404 NOT_FOUND       ORCID has no public record for it
 *   429 RATE_LIMITED    too many reads from this browser (Retry-After)
 *   502 MALFORMED       ORCID's answer could not be read as the works JSON
 *   502 UNREACHABLE     DNS / network / a redirect off the allow-listed host
 *   503 UPSTREAM_BUSY   ORCID rate-limited or is down (`retryAfter` seconds when it said)
 *   504 TIMEOUT         ORCID did not answer in time
 *
 * `fetcher` is the transport (safeFetch in production; tests inject one).
 */

export const READS_PER_WINDOW = 10
export const WINDOW_MS = 10 * 60 * 1000

export type OrcidWorksErrorCode = 'BAD_ORCID' | 'NOT_FOUND' | 'RATE_LIMITED' | 'MALFORMED' | 'UNREACHABLE' | 'UPSTREAM_BUSY' | 'TIMEOUT'

export function orcidWorksRoute(fetcher: Fetcher = safeFetch) {
  return async function handler(req: NextApiRequest, res: NextApiResponse, ctx: ApiContext) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: 'Method not allowed' })
    }
    if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
    res.setHeader('Cache-Control', 'no-store')

    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
    const orcid = normalizeOrcidId(body.orcid)
    if (!orcid) return res.status(400).json({ error: 'The ORCID iD is missing or not valid. Set it in Personal Info first.', code: 'BAD_ORCID' })

    const rl = rateLimit(req, READS_PER_WINDOW, WINDOW_MS, 'orcid-works')
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
    if (!rl.allowed) {
      const wait = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
      res.setHeader('Retry-After', String(wait))
      return res.status(429).json({ error: 'Too many ORCID reads in a short time — try again in a few minutes.', code: 'RATE_LIMITED', retryAfter: wait })
    }

    const result = await fetchOrcidWorks(orcid, fetcher)
    const audit = (status: number, summary: string) =>
      recordAdminAudit(req, res, { action: 'orcid.read-works', area: 'cv', target: ORCID_API_HOST, summary }, { status })

    switch (result.kind) {
      case 'not-found':
        audit(404, 'Tried to read works from ORCID: no public record for the iD')
        return res.status(404).json({ error: 'ORCID has no public record for this iD. Check the iD in Personal Info.', code: 'NOT_FOUND' })
      case 'busy':
        ctx.log.info('orcid works: upstream busy', { status: result.status })
        audit(503, `Tried to read works from ORCID: ORCID answered ${result.status}`)
        if (result.retryAfterS !== null) res.setHeader('Retry-After', String(result.retryAfterS))
        return res.status(503).json({
          error: 'ORCID is busy or unavailable right now. Try again in a minute.',
          code: 'UPSTREAM_BUSY',
          ...(result.retryAfterS !== null ? { retryAfter: result.retryAfterS } : {}),
        })
      case 'timeout':
        ctx.log.info('orcid works: timeout')
        audit(504, 'Tried to read works from ORCID: no answer in time')
        return res.status(504).json({ error: 'ORCID did not answer in time. Try again.', code: 'TIMEOUT' })
      case 'malformed':
        ctx.log.warn('orcid works: malformed answer', { detail: result.detail })
        audit(502, 'Tried to read works from ORCID: the answer could not be read')
        return res.status(502).json({ error: 'ORCID’s answer could not be read. Try again later.', code: 'MALFORMED' })
      case 'unreachable':
        ctx.log.warn('orcid works: unreachable', { detail: result.detail })
        audit(502, 'Tried to read works from ORCID: not reachable from the server')
        return res.status(502).json({ error: 'ORCID could not be reached from the server.', code: 'UNREACHABLE' })
      default:
        break
    }

    const n = result.candidates.length
    audit(200, `Read ${n} work${n === 1 ? '' : 's'} from ORCID for the CV Studio import`)
    ctx.log.info('orcid works read', { count: n, detailsFailed: result.detailsFailed })
    return res.status(200).json({ orcid, fetchedAt: new Date().toISOString(), candidates: result.candidates, detailsFailed: result.detailsFailed })
  }
}
