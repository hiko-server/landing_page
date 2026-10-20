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
 * the CSP's `report-to` endpoint or its `report-uri`, lib/csp.js).
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
 * store's caps (lib/errors/store.ts ERROR_LIMITS). Trusted Types reports
 * come from a report-only policy that fires on ordinary page views, so each
 * of their groups records at most REPORT_ONLY_PER_GROUP_PER_DAY events a UTC
 * day: enough to see which sinks fire and how widely, without spending the
 * daily budget real errors need.
 */

export const CLIENT_EVENTS_PER_MIN = 20
export const NETWORK_EVENTS_PER_MIN = 60
export const REPORT_ONLY_PER_GROUP_PER_DAY = 50
/** Largest browser error report (lib/errors/client.ts sends a few hundred bytes). */
const MAX_BODY = 8192
/**
 * Largest violation-report upload. The Reporting API batches a minute of a
 * page's reports into one POST (≈ 0.4–0.9 KB each, the enforced ones carry
 * the whole policy), so a busy minute exceeds the client-error limit; a
 * refused upload would lose its enforced violations too (pages/api/e.ts
 * accepts bodies up to this size).
 */
export const MAX_REPORTS_BODY = 65536
/** Reports kept from one upload, enforced violations first. */
export const MAX_CSP_REPORTS = 20
/** Entries of one Reporting API batch looked at (a 64 KB body holds fewer). */
const MAX_BATCH_ENTRIES = 500
/** Distinct report-only groups sampled per day (beyond that, new ones are dropped). */
const MAX_REPORT_ONLY_GROUPS = 200

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
  /**
   * Trusted Types only: the sink that got a plain string ("Element
   * innerHTML", "HTMLScriptElement src") or the refused policy name — never
   * the sample text that follows it.
   */
  sink?: string
}

/**
 * Directives only the report-only policy carries (lib/csp.js
 * buildReportOnlyCsp): a violation of one is report-only even when the
 * browser leaves `disposition` out (WebKit's report-uri bodies do).
 */
const TRUSTED_TYPES_DIRECTIVES = new Set(['require-trusted-types-for', 'trusted-types'])
const SINK_RE = /^[A-Z][A-Za-z]{1,40} [A-Za-z][A-Za-z.]{1,40}$/
const POLICY_NAME_RE = /^[A-Za-z0-9#=_/@.%-]{1,40}$/

const KINDS = new Set(['error', 'unhandledrejection', 'boundary'])
const NAME_RE = /^[A-Za-z_$][\w$.]{0,63}$/
const BOUNDARY_RE = /^[a-z0-9][a-z0-9/_-]{0,63}$/i

function parseBody(body: unknown, max = MAX_BODY): unknown {
  if (typeof body !== 'string') return body
  if (body.length > max) return null
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
 * CSP violation reports, in every shape browsers send them:
 *   - `report-uri` (application/csp-report): { "csp-report": {...} };
 *   - the Reporting API (application/reports+json): [{ type: "csp-violation",
 *     body: {...} }, …];
 *   - WebKit's Reporting API upload: one such report object, not an array.
 * Extension-caused violations are dropped, and so are report-only ones —
 * except Trusted Types (only the report-only policy has those directives).
 * At most MAX_CSP_REPORTS per upload; the enforced violations come first,
 * so the per-client budget never spends itself on report-only ones.
 */
export function parseCspReports(body: unknown): CspViolation[] {
  const data = parseBody(body, MAX_REPORTS_BODY)
  const raw: Record<string, unknown>[] = []
  const pushReport = (rec: unknown) => {
    const r = rec as Record<string, unknown> | null
    if (r && r.type === 'csp-violation' && r.body && typeof r.body === 'object')
      raw.push(r.body as Record<string, unknown>)
  }
  if (Array.isArray(data)) {
    for (const r of data.slice(0, MAX_BATCH_ENTRIES)) pushReport(r)
  } else if (data && typeof data === 'object') {
    const legacy = (data as Record<string, unknown>)['csp-report']
    if (legacy && typeof legacy === 'object') raw.push(legacy as Record<string, unknown>)
    else pushReport(data)
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
    const trustedTypes = TRUSTED_TYPES_DIRECTIVES.has(directive)
    const disposition = trustedTypes || str('disposition') === 'report' ? 'report' : 'enforce'
    if (disposition === 'report' && !trustedTypes) continue
    if (isExtensionNoise(blockedRaw, source)) continue
    const violation: CspViolation = {
      directive,
      blocked: describeBlocked(blockedRaw),
      source: source ? scrubText(stripQuery(source), 300) : null,
      path: normalizeErrorPath(doc),
      disposition,
    }
    if (trustedTypes) {
      const sink = trustedTypesSink(directive, str('script-sample', 'sample'))
      if (sink) violation.sink = sink
    }
    out.push(violation)
  }
  // Stable: report order is kept within each disposition.
  return out
    .sort((a, b) => Number(a.disposition === 'report') - Number(b.disposition === 'report'))
    .slice(0, MAX_CSP_REPORTS)
}

/**
 * What a Trusted Types report names, without its sample text: the sink
 * ("Element innerHTML|<b>…" → "Element innerHTML") for
 * require-trusted-types-for, the policy name for trusted-types. Null when
 * the sample does not look like one.
 */
export function trustedTypesSink(directive: string, sample: string): string | null {
  if (directive === 'trusted-types') {
    const name = sample.trim()
    return POLICY_NAME_RE.test(name) ? name : null
  }
  const sink = sample.split('|')[0].trim()
  return SINK_RE.test(sink) ? sink : null
}

/**
 * A script URL that stays the same across builds: Next's build id and the
 * content hashes in chunk names are removed, so one problem keeps one group
 * from deploy to deploy ("/_next/static/chunks/main-d3d3956a96cec5ec.js" →
 * "/_next/static/chunks/main.js").
 */
export function stableScriptUrl(url: string): string {
  return url
    .replace(/\/_next\/static\/[A-Za-z0-9_-]{10,}\/(_buildManifest|_ssgManifest)\b/, '/_next/static/$1')
    .replace(/[-.][0-9a-f]{8,20}(?=\.(?:m?js|cjs)(?::\d+)*$)/i, '')
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
  const source = v.source ? stableScriptUrl(v.source) : null
  if (v.disposition === 'report') {
    const what =
      v.directive === 'trusted-types'
        ? `policy ${v.sink ? `"${v.sink}" ` : ''}is not allowed`
        : `${v.sink || 'a DOM sink'} got a plain string`
    return {
      fingerprint: fingerprintOf(['csp-report', v.directive, v.blocked, v.sink, source]),
      source: 'csp',
      kind: 'trusted-types',
      name: 'TrustedTypesViolation',
      message: `Trusted Types (report-only): ${what}`,
      stack: source,
      path: v.path,
      route: null,
      release,
      browser: ua ? browserOf(ua) : null,
    }
  }
  const message = `Refused ${v.directive}: ${v.blocked}`
  return {
    fingerprint: fingerprintOf(['csp', v.directive, v.blocked, source]),
    source: 'csp',
    kind: 'csp',
    name: 'CSPViolation',
    message,
    stack: source,
    path: v.path,
    route: null,
    release,
    browser: ua ? browserOf(ua) : null,
  }
}

type ReportOnlyGlobal = typeof globalThis & {
  __reportOnlySamples?: { day: string; counts: Map<string, number> }
}

/**
 * True while a report-only group may record another event today: at most
 * REPORT_ONLY_PER_GROUP_PER_DAY per group, for at most MAX_REPORT_ONLY_GROUPS
 * groups a UTC day (in memory; a restart starts the day's samples again).
 */
export function takeReportOnlySample(fingerprint: string, now = Date.now()): boolean {
  const g = globalThis as ReportOnlyGlobal
  const day = new Date(now).toISOString().slice(0, 10)
  if (!g.__reportOnlySamples || g.__reportOnlySamples.day !== day)
    g.__reportOnlySamples = { day, counts: new Map() }
  const { counts } = g.__reportOnlySamples
  const n = counts.get(fingerprint)
  if (n === undefined && counts.size >= MAX_REPORT_ONLY_GROUPS) return false
  if ((n ?? 0) >= REPORT_ONLY_PER_GROUP_PER_DAY) return false
  counts.set(fingerprint, (n ?? 0) + 1)
  return true
}

/** Test helper: forget today's report-only samples. */
export function resetReportOnlySamples(): void {
  delete (globalThis as ReportOnlyGlobal).__reportOnlySamples
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
  let sampledOut = 0
  if (csp) {
    const release = normalizeRelease(process.env.NEXT_PUBLIC_BUILD_SHA)
    for (const v of parseCspReports(req.body)) {
      const e = cspEvent(v, ua, release)
      // Sampled before the rate limits, so report-only noise never uses up a client's budget.
      if (v.disposition === 'report' && !takeReportOnlySample(e.fingerprint, now)) sampledOut++
      else events.push(e)
    }
  } else {
    const r = parseClientError(req.body)
    if (r) events.push(clientErrorEvent(r, ua, header(req, 'host').toLowerCase()))
  }
  if (!events.length) return { recorded: 0, dropped: sampledOut ? 'sampled' : 'invalid' }

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
