import { withApi } from '../../lib/apiHandler'
import { ingestErrorReport } from '../../lib/errors/ingest'

/**
 * POST /api/e — first-party error reports: browser errors (lib/errors/client
 * sends JSON as text/plain, no CORS preflight) and Content-Security-Policy
 * violation reports (the CSP `report-uri`). Always 204: a dropped report is
 * indistinguishable from a recorded one. Privacy rules and budgets:
 * lib/errors/ingest.ts.
 */
export const config = { api: { bodyParser: { sizeLimit: '8kb' } } }

export default withApi('e', (req, res, ctx) => {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }
  try {
    const outcome = ingestErrorReport(req)
    if (outcome.dropped) ctx.log.debug('error report not recorded', { reason: outcome.dropped })
  } catch (err) {
    // Not ctx.log.error: an error recorded about recording errors would loop.
    ctx.log.warn('error report ingest failed', { reason: err instanceof Error ? err.message : String(err) })
  }
  return res.status(204).end()
})
