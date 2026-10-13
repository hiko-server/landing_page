import { withApi } from '../../lib/apiHandler'
import { ingest } from '../../lib/analytics/ingest'

/**
 * POST /api/a — first-party, cookieless analytics beacon (page views and
 * Core Web Vitals). The body is JSON sent as text/plain (navigator.sendBeacon
 * / fetch keepalive without a CORS preflight). Always 204: a dropped or
 * invalid event is indistinguishable from a recorded one. Privacy rules:
 * lib/analytics/ingest.ts.
 */
export const config = { api: { bodyParser: { sizeLimit: '8kb' } } }

export default withApi('a', (req, res, ctx) => {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }
  try {
    const outcome = ingest(req)
    if (outcome.dropped) ctx.log.debug('analytics event not recorded', { reason: outcome.dropped })
  } catch (err) {
    ctx.log.warn('analytics ingest failed', { err })
  }
  return res.status(204).end()
})
