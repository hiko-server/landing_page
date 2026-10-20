import crypto from 'node:crypto'
import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next'
import { log, type Logger } from './log'
import { AUDITED_ROUTES, isWriteMethod } from './audit/describe'

/**
 * Wrap every API route's default export:
 *
 *   export default withApi('admin/posts', async (req, res, ctx) => { … })
 *
 *   - request id: Cloudflare's `cf-ray` when present (so a log line can be
 *     matched to the edge request), else a sane incoming `x-request-id`, else
 *     a fresh UUID; echoed as the `X-Request-Id` response header and
 *     available as ctx.requestId / ctx.log (a child logger carrying it)
 *   - uncaught errors are logged with the route, method and request id, and
 *     answered with a generic 500 JSON body that carries only the request id
 *     (no internals)
 *   - 5xx responses and slow requests (> 1 s) are logged; everything else is
 *     logged at debug level only
 *   - admin writes are recorded in the activity log (lib/audit): a write to a
 *     route lib/audit/describe names runs inside an audit scope and, when it
 *     answers 2xx, gets an entry (who, what, when). The capture loads only
 *     for such requests and can never fail or change the response.
 *
 * `export const config = …` stays a separate named export as Next requires.
 */

export type ApiContext = { requestId: string; log: Logger }
export type ApiHandler = (req: NextApiRequest, res: NextApiResponse, ctx: ApiContext) => unknown | Promise<unknown>

const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/
export const SLOW_MS = 1000

function header(req: NextApiRequest, name: string): string | undefined {
  const value = req.headers?.[name]
  return Array.isArray(value) ? value[0] : value
}

/** cf-ray → x-request-id → random UUID; anything malformed is ignored. */
export function requestIdOf(req: NextApiRequest): string {
  for (const name of ['cf-ray', 'x-request-id']) {
    const value = header(req, name)
    if (typeof value === 'string' && REQUEST_ID_RE.test(value)) return value
  }
  return crypto.randomUUID()
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
    let audit: import('./audit/capture').AuditCapture | null = null
    if (AUDITED_ROUTES.has(route) && isWriteMethod(req.method)) {
      try {
        audit = (await import('./audit/capture')).beginAudit(route, req, res)
      } catch (err) {
        rlog.warn('activity log unavailable', { err })
      }
    }
    try {
      if (audit) await audit.run(() => handler(req, res, { requestId, log: rlog }))
      else await handler(req, res, { requestId, log: rlog })
    } catch (err) {
      rlog.error('unhandled API error', { method: req.method, err })
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error', requestId })
      } else if (!res.writableEnded) {
        res.end()
      }
    } finally {
      audit?.finish(res.statusCode, requestId)
      const ms = Date.now() - started
      const status = res.statusCode
      const fields = { method: req.method, status, ms }
      if (status >= 500) rlog.error('API responded 5xx', fields)
      else if (ms > SLOW_MS) rlog.warn('slow API request', fields)
      else rlog.debug('API request', fields)
    }
  }
}
