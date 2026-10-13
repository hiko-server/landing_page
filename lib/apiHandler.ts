import crypto from 'node:crypto'
import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next'
import { log, type Logger } from './log'

/**
 * Wrap every API route's default export:
 *
 *   export default withApi('admin/posts', async (req, res, ctx) => { … })
 *
 *   - request id: reuses a sane incoming `x-request-id`, else generates one;
 *     echoed as the `X-Request-Id` response header and available as
 *     ctx.requestId / ctx.log (a child logger carrying it)
 *   - uncaught errors are logged with the route, method and request id,
 *     reported to Sentry when a DSN is configured, and answered with a
 *     generic 500 JSON body that carries only the request id (no internals)
 *   - 5xx responses and slow requests (> 2 s) are logged; everything else is
 *     logged at debug level only
 *
 * `export const config = …` stays a separate named export as Next requires.
 */

export type ApiContext = { requestId: string; log: Logger }
export type ApiHandler = (req: NextApiRequest, res: NextApiResponse, ctx: ApiContext) => unknown | Promise<unknown>

const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/
const SLOW_MS = 2000

function requestIdOf(req: NextApiRequest): string {
  const incoming = req.headers['x-request-id']
  const value = Array.isArray(incoming) ? incoming[0] : incoming
  return typeof value === 'string' && REQUEST_ID_RE.test(value) ? value : crypto.randomUUID()
}

async function reportToSentry(err: unknown, tags: Record<string, string>) {
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return
  try {
    const Sentry = await import('@sentry/nextjs')
    Sentry.withScope((scope) => {
      for (const [k, v] of Object.entries(tags)) scope.setTag(k, v)
      Sentry.captureException(err)
    })
  } catch {
    /* reporting must never break the response */
  }
}

export function withApi(route: string, handler: ApiHandler): NextApiHandler {
  return async (req, res) => {
    const started = Date.now()
    const requestId = requestIdOf(req)
    const rlog = log.child({ route, requestId })
    try {
      res.setHeader('X-Request-Id', requestId)
    } catch {
      /* headers already sent by a misbehaving middleware: keep going */
    }
    try {
      await handler(req, res, { requestId, log: rlog })
    } catch (err) {
      rlog.error('unhandled API error', { method: req.method, err })
      await reportToSentry(err, { route, requestId, method: String(req.method) })
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error', requestId })
      } else if (!res.writableEnded) {
        res.end()
      }
    } finally {
      const ms = Date.now() - started
      const status = res.statusCode
      const fields = { method: req.method, status, ms }
      if (status >= 500) rlog.error('API responded 5xx', fields)
      else if (ms > SLOW_MS) rlog.warn('slow API request', fields)
      else rlog.debug('API request', fields)
    }
  }
}
