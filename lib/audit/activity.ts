import { getAuthDb } from '../adminAuth/db'
import type { AuthMethod } from '../adminAuth/store'
import { AUDIT_KEEP_DAYS, auditAreaCounts, listAudit, type AuditEntry } from './store'
import { auditTargetHref, isAuditArea } from './describe'

/**
 * The Activity view (GET /api/admin/activity): the admin's own writes from
 * the activity log, merged by time with the sign-ins and failed sign-ins of
 * the sign-in history (auth.db, which records them already — they are not
 * copied). Security changes are in both stores; the view takes them from the
 * activity log only.
 */

export type ActivityItem = {
  /** "a:<audit id>" or "s:<auth event id>". */
  id: string
  ts: number
  kind: 'write' | 'signin' | 'signin-failed'
  area: string
  action: string
  summary: string
  target: string | null
  /** Admin page for the target, when there is one. */
  href: string | null
  device: string | null
  ipPrefix: string | null
  country: string | null
  sessionId: string | null
}

export type ActivityPage = {
  items: ActivityItem[]
  /** Cursor for the next page (pass as `before`), null at the end. */
  nextBefore: number | null
  /** Entries per area over the last 30 days (sign-ins under "session"). */
  areas: Record<string, number>
  keepDays: number
}

const SIGNIN_LABEL: Record<AuthMethod, string> = {
  passkey: 'Signed in with a passkey',
  password: 'Signed in with the password',
  recovery: 'Signed in with a recovery code',
  legacy: 'Signed in (session from before passkeys)',
}

function fromAudit(e: AuditEntry): ActivityItem {
  return {
    id: `a:${e.id}`,
    ts: e.ts,
    kind: 'write',
    area: e.area,
    action: e.action,
    summary: e.summary,
    target: e.target,
    href: auditTargetHref(e.area, e.target),
    device: e.device,
    ipPrefix: e.ipPrefix,
    country: e.country,
    sessionId: e.sessionId,
  }
}

type SignInRow = {
  id: number
  at: number
  type: 'signin' | 'signin-failed'
  method: AuthMethod | null
  session_id: string | null
  device: string | null
  ip_prefix: string | null
  country: string | null
  detail: string | null
}

function signIns(before: number | null, since: number | null, limit: number, q: string): ActivityItem[] {
  const where = ["type IN ('signin', 'signin-failed')"]
  const params: unknown[] = []
  if (before) {
    where.push('at < ?')
    params.push(before)
  }
  if (since) {
    where.push('at >= ?')
    params.push(since)
  }
  const rows = getAuthDb()
    .prepare(`SELECT id, at, type, method, session_id, device, ip_prefix, country, detail FROM auth_events WHERE ${where.join(' AND ')} ORDER BY at DESC, id DESC LIMIT ?`)
    .all(...params, limit) as SignInRow[]
  const items = rows.map(
    (r): ActivityItem => ({
      id: `s:${r.id}`,
      ts: r.at,
      kind: r.type,
      area: 'session',
      action: r.type === 'signin' ? 'session.signin' : 'session.signin-failed',
      summary:
        r.type === 'signin'
          ? SIGNIN_LABEL[r.method ?? 'password'] ?? 'Signed in'
          : `Failed sign-in${r.method ? ` (${r.method})` : ''}${r.detail ? `: ${r.detail}` : ''}`,
      target: null,
      href: '/admin/security',
      device: r.device,
      ipPrefix: r.ip_prefix,
      country: r.country,
      sessionId: r.session_id,
    }),
  )
  if (!q) return items
  return items.filter((i) => `${i.summary} ${i.device || ''}`.toLowerCase().includes(q))
}

export type ActivityQuery = { area?: string | null; q?: string | null; before?: number | null; limit?: number; now?: number }

export function activityPage(query: ActivityQuery = {}): ActivityPage {
  const limit = Math.min(100, Math.max(1, Math.trunc(query.limit ?? 50)))
  const area = query.area && (isAuditArea(query.area) || query.area === 'session') ? query.area : null
  const q = (query.q || '').trim().toLowerCase().slice(0, 80)
  const before = query.before && Number.isFinite(query.before) ? Math.trunc(query.before) : null
  const now = query.now ?? Date.now()
  const since = now - AUDIT_KEEP_DAYS * 86_400_000

  const writes = listAudit({ area, q, before, since, limit: limit + 1 }).entries.map(fromAudit)
  let logins: ActivityItem[] = []
  if (!area || area === 'session') {
    try {
      logins = signIns(before, since, limit + 1, q)
    } catch {
      // auth.db unreadable: the writes still show.
    }
  }
  const merged = [...writes, ...logins].sort((a, b) => b.ts - a.ts || (a.id < b.id ? 1 : -1))
  const items = merged.slice(0, limit)
  const more = merged.length > limit
  const areas = auditAreaCounts(now)
  try {
    const n = (getAuthDb()
      .prepare("SELECT count(*) AS n FROM auth_events WHERE type IN ('signin', 'signin-failed') AND at >= ?")
      .get(now - 30 * 86_400_000) as { n: number }).n
    areas.session = (areas.session || 0) + (Number(n) || 0)
  } catch {
    // Counts are a convenience.
  }
  return { items, nextBefore: more && items.length ? items[items.length - 1].ts : null, areas, keepDays: AUDIT_KEEP_DAYS }
}
