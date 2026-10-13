import type { NextApiRequest } from 'next'
import { BOT_UA, browserOf } from '../analytics/ingest'
import { networkOf, takeUnits } from '../analytics/limits'
import { ipFromReq } from '../rateLimit'
import { ipBucket } from '../security/ip'
import { sharedLimiter } from '../security/rateLimitCore'
import {
  fingerprintOf,
  groupingMessage,
  isExtensionNoise,
  normalizeErrorPath,
  normalizeRelease,
  scrubStack,
  scrubText,
  stripQuery,
  topFrame,
} from './scrub'
import { recordError, type ErrorEventInput } from './store'

/**
 * POST /api/e — browser error reports and Content-Security-Policy violation
 * reports (lib/errors/client.ts sends the first; browsers send the second to
 * the CSP `report-uri`).
 *
 * Privacy: nothing is recorded when the browser sends DNT: 1 or Sec-GPC: 1,
 * for bots, or for cross-site posts. No IP address, user agent, cookie,
 * query string or request body is stored: the event keeps a scrubbed message
 * and stack (lib/errors/scrub.ts), the page path, the build, and the
 * browser family. The client address is used only, in memory, for the rate
 * limits below.
 *
 * Abuse budgets (per minute, in memory): CLIENT_EVENTS per client (IPv4 /
 * IPv6 /64), NETWORK_EVENTS per network (IPv4 /24, IPv6 /48); plus the
 * store's caps (lib/errors/store.ts ERROR_LIMITS).
 */

export const CLIENT_EVENTS_PER_MIN = 20
export const NETWORK_EVENTS_PER_MIN = 60
const MAX_BODY = 8192
const MAX_CSP_REPORTS = 5

export type ClientErrorReport = {
  kind: 'error' | 'unhandledrejection' | 'boundary'
  name: string | null
  message: string
  stack: string
  file: string | null
  path: string | null
  release: string | null
  boundary: string | null
}

export type CspViolation = {
  directive: string
  blocked: string
  source: string | null
  path: string | null
  disposition: 'enforce' | 'report'
}

const KINDS = new Set(['error', 'unhandledrejection', 'boundary'])
const NAME_RE = /^[A-Za-z_$][\w$.]{0,63}$/
const BOUNDARY_RE = /^[a-z0-9][a-z0-9/_-]{0,63}$/i

function parseBody(body: unknown): unknown {
  if (typeof body !== 'string') return body
  if (body.length > MAX_BODY) return null
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

/** One browser error report (lib/errors/client.ts payload), or null when unusable or not ours. */
export function parseClientError(body: unknown): ClientErrorReport | null {
  const data = parseBody(body)
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const o = data as Record<string, unknown>
  if (typeof o.k !== 'string' || !KINDS.has(o.k)) return null
  const rawMessage = typeof o.m === 'string' ? o.m.slice(0, 2000) : ''
  const rawStack = typeof o.s === 'string' ? o.s.slice(0, 16_000) : ''
  const rawFile = typeof o.f === 'string' ? o.f.slice(0, 2000) : ''
  if (!rawMessage.trim() && !rawStack.trim()) return null
  // Cross-origin scripts report only "Script error." — nothing actionable, and never ours.
  if (/^script error\.?$/i.test(rawMessage.trim()) && !rawStack.trim()) return null
  if (isExtensionNoise(rawFile, rawStack.split('\n').find((l) => /\bat\s|@/.test(l)) || ''))
    return null
  const line = Number.isInteger(o.l) && (o.l as number) > 0 ? (o.l as number) : null
  const col = Number.isInteger(o.c) && (o.c as number) > 0 ? (o.c as number) : null
  const file = rawFile ? stripQuery(rawFile) : ''
  return {
    kind: o.k as ClientErrorReport['kind'],
    name: typeof o.n === 'string' && NAME_RE.test(o.n) ? o.n : null,
    message: rawMessage,
    // A report without a stack still has its file position: keep it as a one-frame stack.
    stack: rawStack || (file && line ? `    at ${file}:${line}:${col ?? 0}` : ''),
    file: file || null,
    path: normalizeErrorPath(o.p),
    release: normalizeRelease(o.r),
    boundary: typeof o.b === 'string' && BOUNDARY_RE.test(o.b) ? o.b : null,
  }
}

/**
 * CSP violation reports from a `report-uri` POST (application/csp-report:
 * { "csp-report": {...} }) or the Reporting API (application/reports+json:
 * [{ type: "csp-violation", body: {...} }]). Extension-caused and
 * report-only violations are dropped.
 */
export function parseCspReports(body: unknown): CspViolation[] {
  const data = parseBody(body)
  const raw: Record<string, unknown>[] = []
  if (Array.isArray(data)) {
    for (const r of data.slice(0, MAX_CSP_REPORTS)) {
      const rec = r as Record<string, unknown>
      if (rec && rec.type === 'csp-violation' && rec.body && typeof rec.body === 'object')
        raw.push(rec.body as Record<string, unknown>)
    }
  } else if (data && typeof data === 'object') {
    const legacy = (data as Record<string, unknown>)['csp-report']
    if (legacy && typeof legacy === 'object') raw.push(legacy as Record<string, unknown>)
  }
  const out: CspViolation[] = []
  for (const r of raw) {
    const str = (...keys: string[]) => {
      for (const k of keys) if (typeof r[k] === 'string') return (r[k] as string).slice(0, 2000)
      return ''
    }
    const directive = str(
      'effective-directive',
      'effectiveDirective',
      'violated-directive',
      'violatedDirective'
    )
      .split(' ')[0]
      .toLowerCase()
    if (!/^[a-z-]{3,40}$/.test(directive)) continue
    const blockedRaw = str('blocked-uri', 'blockedURL')
    const source = str('source-file', 'sourceFile')
    const doc = str('document-uri', 'documentURL')
    const disposition = str('disposition') === 'report' ? 'report' : 'enforce'
    if (disposition === 'report') continue
    if (isExtensionNoise(blockedRaw, source)) continue
    out.push({
      directive,
      blocked: describeBlocked(blockedRaw),
      source: source ? scrubText(stripQuery(source), 300) : null,
      path: normalizeErrorPath(doc),
      disposition,
    })
  }
  return out
}

/** "inline", "eval", "data", or the blocked URL's origin + path (no query). */
export function describeBlocked(raw: string): string {
  const s = raw.trim()
  if (!s || s === 'inline' || s === 'eval' || s === 'wasm-eval' || s === 'trusted-types-policy')
    return s || 'inline'
  if (/^(data|blob|about|filesystem):?$/i.test(s) || /^(data|blob|about|filesystem):/i.test(s))
    return s.split(':')[0].toLowerCase()
  try {
    const u = new URL(s)
    return scrubText(`${u.origin}${u.pathname}`, 300)
  } catch {
    return scrubText(stripQuery(s), 300)
  }
}

export function clientErrorEvent(r: ClientErrorReport, ua: string, siteHost = ''): ErrorEventInput {
  const message = scrubText(r.message) || '(no message)'
  const stack = scrubStack(r.stack, siteHost ? [`https://${siteHost}`, `http://${siteHost}`] : [])
  const frame =
    topFrame(stack) || (r.file ? stripQuery(r.file).replace(/^https?:\/\/[^/]+/, '') : '')
  return {
    fingerprint: fingerprintOf(['client', r.kind, r.name, groupingMessage(message), frame]),
    source: 'client',
    kind: r.kind,
    name: r.name,
    message,
    stack: stack || null,
    path: r.path,
    route: r.boundary,
    release: r.release,
    browser: ua ? browserOf(ua) : null,
  }
}

export function cspEvent(v: CspViolation, ua: string, release: string | null): ErrorEventInput {
  const message = `Refused ${v.directive}: ${v.blocked}`
  return {
    fingerprint: fingerprintOf(['csp', v.directive, v.blocked, v.source]),
    source: 'csp',
    kind: 'csp',
    name: 'CSPViolation',
    message,
    stack: v.source,
    path: v.path,
    route: null,
    release,
    browser: ua ? browserOf(ua) : null,
  }
}

const header = (req: Pick<NextApiRequest, 'headers'>, name: string): string => {
  const v = req.headers[name]
  return (Array.isArray(v) ? v[0] : v) || ''
}

/** Why the report must not be recorded, or null. */
export function errorDropReason(req: Pick<NextApiRequest, 'headers'>): string | null {
  if (header(req, 'dnt') === '1') return 'dnt'
  if (header(req, 'sec-gpc') === '1') return 'gpc'
  const ua = header(req, 'user-agent')
  if (!ua || BOT_UA.test(ua)) return 'bot'
  const site = header(req, 'sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return 'cross-site'
  const origin = header(req, 'origin')
  if (origin && origin !== 'null') {
    try {
      if (new URL(origin).host.toLowerCase() !== header(req, 'host').toLowerCase())
        return 'cross-site'
    } catch {
      return 'cross-site'
    }
  }
  return null
}

function isCspContentType(type: string): boolean {
  return /^application\/(csp-report|reports\+json)\b/i.test(type)
}

/** Ingest one POST. Returns how many events were stored and why the rest were not. */
export function ingestErrorReport(
  req: NextApiRequest,
  now = Date.now()
): { recorded: number; dropped?: string } {
  const drop = errorDropReason(req)
  if (drop) return { recorded: 0, dropped: drop }
  const ua = header(req, 'user-agent')
  const csp = isCspContentType(header(req, 'content-type'))
  const events: ErrorEventInput[] = []
  if (csp) {
    const release = normalizeRelease(process.env.NEXT_PUBLIC_BUILD_SHA)
    for (const v of parseCspReports(req.body)) events.push(cspEvent(v, ua, release))
  } else {
    const r = parseClientError(req.body)
    if (r) events.push(clientErrorEvent(r, ua, header(req, 'host').toLowerCase()))
  }
  if (!events.length) return { recorded: 0, dropped: 'invalid' }

  const ip = ipFromReq(req)
  const limiter = sharedLimiter('errors', 5_000)
  let allowed = takeUnits(
    limiter,
    `c|${ipBucket(ip)}`,
    CLIENT_EVENTS_PER_MIN,
    events.length,
    60_000,
    now
  )
  const net = networkOf(ip)
  if (net && allowed)
    allowed = takeUnits(limiter, `n|${net}`, NETWORK_EVENTS_PER_MIN, allowed, 60_000, now)
  if (!allowed) return { recorded: 0, dropped: 'rate-limited' }

  let recorded = 0
  for (const e of events.slice(0, allowed)) {
    const outcome = recordError(e, now)
    if (outcome === 'recorded' || outcome === 'new') recorded++
  }
  return recorded === events.length ? { recorded } : { recorded, dropped: 'capped' }
}
