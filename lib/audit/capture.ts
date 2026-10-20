import type { NextApiRequest, NextApiResponse } from 'next'
import { readAdminContext, requestOrigin } from '../auth'
import { getItem } from '../contentStore'
import { log } from '../log'
import { runInAuditScope, type AuditScope } from './context'
import { describeAdminWrite, type AuditDescription, type AuditFacts } from './describe'
import { recordAudit, type AuditActor } from './store'

/**
 * The activity log's capture, run by lib/apiHandler (withApi) around every
 * write to a route lib/audit/describe knows:
 *
 *   1. before the handler: name the action from the request, read the store
 *      facts it depends on (is the post a draft right now?) and identify the
 *      signed-in browser (session id, coarse device, network prefix, country —
 *      read before the handler, so a sign-out is attributed too);
 *   2. the handler runs inside an audit scope (lib/audit/context) where the
 *      snapshot writers note the version files they create;
 *   3. after it, a 2xx response is recorded with those snapshot links.
 *
 * Requests without a valid admin session are not recorded (the route itself
 * refuses them). Every step is wrapped: a failed insert, an unreadable
 * audit.db or a bug here is logged and never blocks or changes the action.
 */

export type AuditCapture = {
  run<T>(fn: () => T): T
  finish(status: number, requestId: string | null): void
}

function factsFor(route: string, req: NextApiRequest): AuditFacts {
  if (route !== 'admin/posts' && route !== 'admin/work') return {}
  const body = req.body as { slug?: unknown; action?: unknown } | undefined
  // A save, or a schedule change (H5: "to publish" for a draft, "its changes" for a live item).
  if (req.method !== 'PUT' && !(req.method === 'POST' && body?.action === 'schedule')) return {}
  const slug = body?.slug
  if (typeof slug !== 'string' || !slug) return {}
  const item = getItem(route === 'admin/posts' ? 'blog' : 'work', slug)
  return { existingDraft: item ? !!item.frontmatter?.draft : null }
}

export function beginAudit(route: string, req: NextApiRequest, res: NextApiResponse): AuditCapture | null {
  let description: AuditDescription | null = null
  let actor: AuditActor | null = null
  try {
    description = describeAdminWrite(
      route,
      { method: String(req.method || ''), query: req.query || {}, body: req.body },
      factsFor(route, req),
    )
    if (!description) return null
    const ctx = readAdminContext(req, res)
    if (!ctx) return null
    const origin = requestOrigin(req)
    actor = {
      sessionId: ctx.session?.id ?? null,
      device: origin.device,
      ipPrefix: origin.ipPrefix,
      country: origin.country,
    }
  } catch (err) {
    log.warn('activity log: could not describe a write', { route, err })
    return null
  }
  const scope: AuditScope = { snapshots: [] }
  const what = description
  const who = actor
  return {
    run: (fn) => runInAuditScope(scope, fn),
    finish: (status, requestId) => {
      if (!(status >= 200 && status < 300)) return
      try {
        recordAudit({
          ...what,
          ...who,
          method: String(req.method || '').toUpperCase(),
          route,
          status,
          requestId,
          snapshots: scope.snapshots,
        })
      } catch (err) {
        log.warn('activity log: entry not recorded', { route, action: what.action, err })
      }
    },
  }
}
