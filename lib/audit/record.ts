import type { NextApiRequest, NextApiResponse } from 'next'
import { readAdminContext, requestOrigin } from '../auth'
import { isInternalJobRequest } from '../internalJobs'
import { log } from '../log'
import type { SnapshotKind } from './context'
import { AUDITED_ROUTES, isAuditArea, type AuditArea } from './describe'
import { recordAudit } from './store'

/**
 * recordAdminAudit — the activity log for an admin write that withApi's
 * automatic capture does not describe (SERVER-ONLY).
 *
 * Two ways to put a write in the log:
 *   1. Preferred for a whole route: name it in withApi('admin/<route>', …),
 *      add a case to describeAdminWrite and the route to AUDITED_ROUTES
 *      (lib/audit/describe) — every successful write is then recorded with
 *      the version snapshots it took.
 *   2. This helper, called by the route after a write SUCCEEDED, for routes
 *      whose action is only known while handling (a bulk job, a scheduler):
 *
 *        recordAdminAudit(req, res, {
 *          action: 'redirect.create',            // "<area-ish>.<verb>", lowercase
 *          area: 'page',                          // one of AUDIT_AREAS
 *          target: '/old-path',                   // slug / path / count — never personal data
 *          summary: 'Added a redirect from /old-path',
 *        })
 *
 * The signed-in browser (session, coarse device, network prefix, country)
 * comes from the request; requests without a valid admin session are not
 * recorded. It never throws and never blocks the action: it returns whether
 * an entry was written. Do not call it from a route the automatic capture
 * already covers (that would record the write twice).
 *
 * The server's own jobs record what they do with `{ actor: 'scheduler' }`
 * (H5: scheduled publishing): no session — the entry names the scheduler
 * as the actor ("Scheduler · this server") — and only for a request that
 * really is the server calling itself (lib/internalJobs: loopback peer and
 * the per-process token), so no outside request can write as the scheduler.
 */

export type AdminAuditEntry = {
  /** Stable machine name, e.g. "redirect.create". */
  action: string
  area: AuditArea
  /** Slug, path, page name, count or host — never message text, addresses or tokens. */
  target?: string | null
  /** One readable line in the past tense: "Added a redirect from /old-path". */
  summary: string
}

export type AdminAuditOptions = {
  /** The route name as given to withApi; derived from the URL when absent. */
  route?: string
  /** The response status the write answered (default 200). */
  status?: number
  /** Version-history files the write took (so the history views can say what replaced them). */
  snapshots?: Array<{ kind: SnapshotKind; file: string }>
  /** Who acted when it was not a signed-in browser: the scheduler (an internal job request only). */
  actor?: 'scheduler'
}

/** How the activity log names the scheduler (device column; network "loopback" reads "this server"). */
export const SCHEDULER_ACTOR = { device: 'Scheduler', ipPrefix: 'loopback' } as const

const ACTION_RE = /^[a-z][a-z0-9-]{0,31}\.[a-z][a-z0-9-]{0,47}$/

/** "admin/redirects" from "/api/admin/redirects?x=1". */
export function routeFromUrl(url: string | undefined): string {
  const pathname = String(url || '').split('?')[0]
  return pathname.replace(/^\/api\//, '').replace(/\/+$/, '').slice(0, 120) || 'unknown'
}

const line = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max) : '')

/** Validate an entry; null when it cannot be recorded as given. */
export function cleanAuditEntry(entry: AdminAuditEntry): { action: string; area: AuditArea; target: string | null; summary: string } | null {
  if (!entry || !ACTION_RE.test(String(entry.action)) || !isAuditArea(entry.area)) return null
  const summary = line(entry.summary, 200)
  if (!summary) return null
  return { action: entry.action, area: entry.area, target: line(entry.target ?? '', 200) || null, summary }
}

export function recordAdminAudit(req: NextApiRequest, res: NextApiResponse, entry: AdminAuditEntry, opts: AdminAuditOptions = {}): boolean {
  try {
    const clean = cleanAuditEntry(entry)
    if (!clean) {
      log.warn('activity log: entry refused (bad action, area or summary)', { action: String(entry?.action || '') })
      return false
    }
    const route = opts.route ?? routeFromUrl(req.url)
    if (AUDITED_ROUTES.has(route)) {
      log.warn('activity log: route is already recorded automatically', { route, action: clean.action })
      return false
    }
    let who: { sessionId: string | null; device: string | null; ipPrefix: string | null; country: string | null }
    if (opts.actor === 'scheduler') {
      if (!isInternalJobRequest(req)) {
        log.warn('activity log: a scheduler entry from outside the server was refused', { action: clean.action })
        return false
      }
      who = { sessionId: null, device: SCHEDULER_ACTOR.device, ipPrefix: SCHEDULER_ACTOR.ipPrefix, country: null }
    } else {
      const ctx = readAdminContext(req, res)
      if (!ctx) return false
      const origin = requestOrigin(req)
      who = { sessionId: ctx.session?.id ?? null, device: origin.device, ipPrefix: origin.ipPrefix, country: origin.country }
    }
    const requestId = res.getHeader?.('X-Request-Id')
    recordAudit({
      ...clean,
      ...who,
      method: String(req.method || '').toUpperCase(),
      route,
      status: opts.status ?? 200,
      requestId: typeof requestId === 'string' ? requestId : null,
      snapshots: opts.snapshots,
    })
    return true
  } catch (err) {
    log.warn('activity log: entry not recorded', { action: String(entry?.action || ''), err })
    return false
  }
}
