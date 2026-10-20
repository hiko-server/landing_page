import { withApi } from '../../lib/apiHandler'
import { ingestGoal } from '../../lib/analytics/events'

/**
 * POST /api/g — first-party, cookieless goal events sent by the browser
 * (lib/analytics/goalBeacon): a mailto: or outbound link clicked, the CV
 * printed, a post read to the end, a ⌘K search that found nothing. The body
 * is one event `{ n, p, v? }` as JSON in text/plain (navigator.sendBeacon /
 * fetch keepalive, no CORS preflight). Always 204: a dropped or invalid
 * event is indistinguishable from a recorded one. Allow-list, properties,
 * privacy rules and budgets: lib/analytics/events.ts. CV downloads, vCard
 * saves and sent contact messages are counted on the server instead and
 * cannot be sent here.
 */
export const config = { api: { bodyParser: { sizeLimit: '2kb' } } }

export default withApi('g', (req, res, ctx) => {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }
  try {
    const outcome = ingestGoal(req)
    if (outcome.dropped) ctx.log.debug('goal event not recorded', { reason: outcome.dropped })
  } catch (err) {
    ctx.log.warn('goal event ingest failed', { err })
  }
  return res.status(204).end()
})
