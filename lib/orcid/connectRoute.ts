import type { NextApiRequest, NextApiResponse } from 'next'
import { setCookie } from 'cookies-next'
import type { ApiContext } from '../apiHandler'
import { getJwtSecret, isProd } from '../env'
import { readAdminContext, readCookie, requestOrigin } from '../auth'
import { getSessionVersion } from '../admin'
import { liveSession } from '../adminAuth/sessions'
import { readCvData } from '../cvdata'
import { rateLimit } from '../rateLimit'
import { sharedReplayGuard, type ReplayGuard } from '../security/replayGuard'
import { safeFetch } from '../security/safeFetch'
import { cleanAuditEntry, recordAdminAudit, type AdminAuditEntry } from '../audit/record'
import { recordAudit } from '../audit/store'
import { runInAuditScope, type AuditScope } from '../audit/context'
import { log } from '../log'
import { canonicalOrcid } from './uri'
import type { Fetcher } from './fetch'
import { ORCID_FLOW_COOKIE, ORCID_FLOW_TTL_S, checkOrcidCallbackState, newOrcidFlow } from './flow'
import {
  OAUTH_CODE_RE,
  exchangeOrcidCode,
  oauthErrorCode,
  orcidAuthorizeUrl,
  readOrcidOAuthConfig,
  type EnvLike,
  type OrcidExchangeResult,
} from './oauth'
import { connectOrcidInCv, disconnectOrcidInCv } from './connection'
import { changeStoredCv } from './cvWrite'
import { ORCID_CALLBACK_PATH, studioReturnPath, type OrcidConnectOutcome, type OrcidConnectReason, type OrcidConnectStatus } from './connectUi'

/**
 * The three routes of "Connect your ORCID iD" (SERVER-ONLY; mounted by
 * pages/api/admin/orcid/{connect,callback,connection}.ts). The OAuth details
 * are in lib/orcid/oauth, the state and its browser binding in
 * lib/orcid/flow, the CV marker in lib/orcid/marker and lib/orcid/connection.
 *
 *   GET  /api/admin/orcid/connect     signed-in admin → 302 to ORCID's
 *        sign-in page with a fresh state (flow cookie set); a reason to go
 *        back to the Studio instead (not configured, wrong host, …).
 *   GET  /api/admin/orcid/callback    ORCID → here with code + state. The
 *        proxy lets this one /api/admin route through without the session
 *        cookie (that cookie is SameSite=Strict and is not sent on the
 *        navigation back from orcid.org); the route itself acts only for
 *        the flow its own signed, single-use Lax cookie names, and only
 *        while that flow's admin session is still live and current. It
 *        exchanges the code on the server, writes the confirmed iD and its
 *        marker into the CV, records it in the activity log, and answers a
 *        tiny page that returns to the Studio (see `bounce`).
 *   GET  /api/admin/orcid/connection  { configured, env, problem?, redirectUri }
 *   DELETE /api/admin/orcid/connection  disconnect: the marker goes, the iD stays.
 */

const STUDIO_HOST_RE = /^[a-z0-9.-]+(?::\d{1,5})?$|^\[[0-9a-f:.]+\](?::\d{1,5})?$/i

const header = (req: NextApiRequest, name: string): string => {
  const v = req.headers?.[name]
  return String((Array.isArray(v) ? v[0] : v) || '').trim()
}
const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v)

/** The Host the browser used (lower-case, with its port), or '' when it is not a plain host. */
export function requestHost(req: NextApiRequest): string {
  const host = header(req, 'host').toLowerCase()
  return STUDIO_HOST_RE.test(host) ? host : ''
}

function requestScheme(req: NextApiRequest): 'http' | 'https' {
  const visitor = header(req, 'cf-visitor')
  if (visitor) {
    try {
      const scheme = (JSON.parse(visitor) as { scheme?: unknown }).scheme
      if (scheme === 'https' || scheme === 'http') return scheme
    } catch {
      /* malformed: fall through */
    }
  }
  const proto = header(req, 'x-forwarded-proto').split(',')[0].trim().toLowerCase()
  if (proto === 'https' || proto === 'http') return proto
  return isProd() && !/^(localhost|127\.|\[::1\])/.test(requestHost(req)) ? 'https' : 'http'
}

/**
 * The redirect URI registered with ORCID: SITE_URL's origin +
 * /api/admin/orcid/callback (https://lucian-dev.com/api/admin/orcid/callback
 * in production); without SITE_URL, the origin this request came to (local
 * testing against sandbox.orcid.org). null when neither gives a usable origin.
 */
export function orcidRedirectUri(req: NextApiRequest, siteUrl: string | undefined = process.env.SITE_URL): { uri: string; host: string } | null {
  const configured = String(siteUrl || '').trim()
  if (configured) {
    try {
      const url = new URL(configured)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
      return { uri: `${url.origin}${ORCID_CALLBACK_PATH}`, host: url.host.toLowerCase() }
    } catch {
      return null
    }
  }
  const host = requestHost(req)
  if (!host) return null
  return { uri: `${requestScheme(req)}://${host}${ORCID_CALLBACK_PATH}`, host }
}

/** The server's ORCID setup, as the Studio shows it. */
export function orcidConnectStatus(req: NextApiRequest, env: EnvLike = process.env): OrcidConnectStatus {
  const cfg = readOrcidOAuthConfig(env)
  const redirect = orcidRedirectUri(req, env.SITE_URL)
  return cfg.ok
    ? { configured: true, env: cfg.config.env, redirectUri: redirect?.uri ?? null }
    : { configured: false, env: cfg.env, problem: cfg.problem, redirectUri: redirect?.uri ?? null }
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The page the callback answers with: it sends the browser on to the Studio
 * at once (meta refresh, plus a link). Not a 302: a redirect would still be
 * part of the cross-site navigation from orcid.org, which the browser does
 * not send the SameSite=Strict session cookie with — the admin page would
 * bounce to the sign-in form. A navigation started BY this same-origin page
 * is same-site, so the Studio opens signed in. No script (the CSP allows
 * none inline); no referrer (this URL held the one-time code).
 */
export function bounceHtml(target: string): string {
  if (!target.startsWith('/') || target.startsWith('//')) throw new Error('same-origin paths only')
  const href = escapeHtml(target)
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="dark light">',
    '<meta name="referrer" content="no-referrer">',
    '<meta name="robots" content="noindex, nofollow">',
    `<meta http-equiv="refresh" content="0; url=${href}">`,
    '<title>Back to CV Studio</title>',
    '<style>html{background:#050505;color:#ededed;font:15px/1.5 system-ui,sans-serif}@media (prefers-color-scheme: light){html{background:#fff;color:#111}}body{margin:0;padding:24px}a{color:inherit}</style>',
    '</head>',
    '<body>',
    `<p>Returning to CV Studio… <a href="${href}">Continue</a></p>`,
    '</body>',
    '</html>',
  ].join('\n')
}

function sendBounce(res: NextApiResponse, outcome: OrcidConnectOutcome) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.status(200).send(bounceHtml(studioReturnPath(outcome)))
}

function backToStudio(res: NextApiResponse, reason: OrcidConnectReason) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Location', studioReturnPath({ result: 'error', reason }))
  res.status(303).end()
}

function flowCookieOptions(req: NextApiRequest, res: NextApiResponse, maxAge: number) {
  return { req, res, httpOnly: true, sameSite: 'lax' as const, secure: isProd(), path: ORCID_CALLBACK_PATH, maxAge }
}

/** Connections started per browser per 10 minutes. */
export const CONNECTS_PER_WINDOW = 10
export const CONNECT_WINDOW_MS = 10 * 60 * 1000

export type OrcidRouteDeps = {
  /** The transport to ORCID (safeFetch; tests inject one). */
  fetcher?: Fetcher
  /** Environment (ORCID_* and SITE_URL); process.env by default. */
  env?: EnvLike
  now?: () => number
  guard?: ReplayGuard
}

/** GET /api/admin/orcid/connect — start: a state, the flow cookie, and off to ORCID. */
export function orcidConnectRoute(deps: OrcidRouteDeps = {}) {
  const now = deps.now ?? Date.now
  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ error: 'Method not allowed' })
    }
    const admin = readAdminContext(req, res)
    if (!admin) return res.status(401).json({ error: 'Unauthorized' })
    const env = deps.env ?? process.env
    const cfg = readOrcidOAuthConfig(env)
    if (!cfg.ok) return backToStudio(res, 'config')
    // A session from before per-browser sessions has nothing to bind the flow to.
    if (!admin.session) return backToStudio(res, 'session')
    const redirect = orcidRedirectUri(req, env.SITE_URL)
    if (!redirect || redirect.host !== requestHost(req)) return backToStudio(res, 'host')
    const rl = rateLimit(req, CONNECTS_PER_WINDOW, CONNECT_WINDOW_MS, 'orcid-connect')
    if (!rl.allowed) return backToStudio(res, 'rate')

    const { state, cookie } = newOrcidFlow(getJwtSecret(), { sid: admin.session.id, sv: getSessionVersion() }, now())
    setCookie(ORCID_FLOW_COOKIE, cookie, flowCookieOptions(req, res, ORCID_FLOW_TTL_S))
    // The iD already on the CV (if any) pre-fills ORCID's sign-in form.
    let hint = ''
    try {
      const cv = readCvData()
      const pi = [...cv.en, ...cv.zh].find((s) => s?.sessionName === 'personalInformation' && canonicalOrcid(s.orcid))
      hint = canonicalOrcid(pi?.orcid)
    } catch {
      hint = ''
    }
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Location', orcidAuthorizeUrl(cfg.config, { state, redirectUri: redirect.uri, orcid: hint }))
    return res.status(302).end()
  }
}

/** Activity-log entry for the callback, which has no session cookie: the flow names the session. */
function recordFlowAudit(req: NextApiRequest, res: NextApiResponse, sessionId: string, entry: AdminAuditEntry, status: number, scope?: AuditScope) {
  try {
    const clean = cleanAuditEntry(entry)
    if (!clean) return
    const origin = requestOrigin(req)
    const requestId = res.getHeader?.('X-Request-Id')
    recordAudit({
      ...clean,
      sessionId,
      device: origin.device,
      ipPrefix: origin.ipPrefix,
      country: origin.country,
      method: 'GET',
      route: 'admin/orcid/callback',
      status,
      requestId: typeof requestId === 'string' ? requestId : null,
      snapshots: scope?.snapshots,
    })
  } catch (err) {
    log.warn('activity log: ORCID connect not recorded', { err })
  }
}

const EXCHANGE_REASON: Record<Exclude<OrcidExchangeResult['kind'], 'ok'>, OrcidConnectReason> = {
  rejected: 'exchange',
  client: 'client',
  busy: 'busy',
  timeout: 'timeout',
  malformed: 'malformed',
  unreachable: 'unreachable',
}

/** GET /api/admin/orcid/callback — ORCID's answer: verify, exchange, store, return to the Studio. */
export function orcidCallbackRoute(deps: OrcidRouteDeps = {}) {
  const now = deps.now ?? Date.now
  const fetcher = deps.fetcher ?? safeFetch
  return async function handler(req: NextApiRequest, res: NextApiResponse, ctx: ApiContext) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ error: 'Method not allowed' })
    }
    const env = deps.env ?? process.env
    const guard = deps.guard ?? sharedReplayGuard('orcid-connect', 1_000)
    const query = req.query || {}
    const cookie = readCookie(req, res, ORCID_FLOW_COOKIE)
    // Whatever happens next, the flow is over: the cookie goes.
    if (cookie !== undefined) setCookie(ORCID_FLOW_COOKIE, '', flowCookieOptions(req, res, 0))

    const fail = (reason: OrcidConnectReason, detail?: Record<string, unknown>) => {
      ctx.log.info('orcid connect: not connected', { reason, ...detail })
      return sendBounce(res, { result: 'error', reason })
    }

    // 1. The state ORCID returned is the one this browser's flow holds, first use.
    const checked = checkOrcidCallbackState(getJwtSecret(), { cookie, state: first(query.state) }, guard, now())
    if (!checked.ok) return fail(checked.problem === 'expired' ? 'expired' : 'state', { problem: checked.problem })
    const flow = checked.flow

    // 2. The admin session that started it is still live and current — and,
    //    when this request carries a session (a same-site arrival), it is that one.
    const session = liveSession(flow.sid, now())
    if (!session || getSessionVersion() !== flow.sv) return fail('session', { problem: 'ended' })
    const here = readAdminContext(req, res)
    if (here && here.session?.id !== flow.sid) return fail('session', { problem: 'other-session' })

    // 3. ORCID's own outcome.
    if (first(query.error) !== undefined) {
      const error = oauthErrorCode(first(query.error))
      return fail(error === 'access_denied' ? 'denied' : 'orcid', { error: error || 'unknown' })
    }
    const cfg = readOrcidOAuthConfig(env)
    if (!cfg.ok) return fail('config')
    const code = first(query.code)
    if (typeof code !== 'string' || !OAUTH_CODE_RE.test(code)) return fail('exchange', { problem: 'no-code' })
    const redirect = orcidRedirectUri(req, env.SITE_URL)
    if (!redirect) return fail('host')

    // 4. The code for the authenticated iD (server to server; the token is never kept).
    const result = await exchangeOrcidCode(cfg.config, { code, redirectUri: redirect.uri }, fetcher)
    const target = cfg.config.host
    if (result.kind !== 'ok') {
      const status = result.kind === 'timeout' ? 504 : result.kind === 'busy' ? 503 : 502
      recordFlowAudit(req, res, flow.sid, { action: 'orcid.connect', area: 'cv', target, summary: `Tried to connect the ORCID iD: ${EXCHANGE_SUMMARY[result.kind]}` }, status)
      return fail(EXCHANGE_REASON[result.kind], { kind: result.kind, ...('status' in result ? { status: result.status } : {}), ...('error' in result ? { error: result.error } : {}) })
    }

    // 5. Into the CV (both languages), as a save would; then back to the Studio.
    const scope: AuditScope = { snapshots: [] }
    let replaced = ''
    const at = new Date(now()).toISOString()
    const written = await runInAuditScope(scope, () =>
      changeStoredCv(
        res,
        (doc) => {
          const r = connectOrcidInCv(doc, result.orcid, at)
          if (!r) return null
          replaced = r.replaced
          return r.doc
        },
        ctx.log,
      ),
    )
    if (written.kind === 'inapplicable') return fail('nopi')
    if (written.kind === 'error' || written.kind === 'conflict') {
      ctx.log.warn('orcid connect: the CV could not be written', { error: written.kind === 'error' ? written.error : 'conflict' })
      return fail('save')
    }
    recordFlowAudit(
      req,
      res,
      flow.sid,
      {
        action: 'orcid.connect',
        area: 'cv',
        target,
        summary: replaced ? 'Connected the ORCID iD by signing in to ORCID (it replaced the iD typed on the CV)' : 'Connected the ORCID iD by signing in to ORCID',
      },
      200,
      scope,
    )
    ctx.log.info('orcid connected', { env: cfg.config.env, replaced: !!replaced, ...(written.kind === 'written' && written.revalidateFailed.length ? { revalidateFailed: written.revalidateFailed } : {}) })
    return sendBounce(res, { result: 'connected', replaced: !!replaced })
  }
}

const EXCHANGE_SUMMARY: Record<Exclude<OrcidExchangeResult['kind'], 'ok'>, string> = {
  rejected: 'ORCID refused the sign-in code',
  client: 'ORCID refused the client credentials',
  busy: 'ORCID was busy or unavailable',
  timeout: 'ORCID did not answer in time',
  malformed: 'ORCID’s answer could not be read',
  unreachable: 'ORCID could not be reached',
}

/** GET (setup) and DELETE (disconnect) /api/admin/orcid/connection. */
export function orcidConnectionRoute(deps: OrcidRouteDeps = {}) {
  return async function handler(req: NextApiRequest, res: NextApiResponse, ctx: ApiContext) {
    if (req.method !== 'GET' && req.method !== 'DELETE') {
      res.setHeader('Allow', 'GET, DELETE')
      return res.status(405).json({ error: 'Method not allowed' })
    }
    if (!readAdminContext(req, res)) return res.status(401).json({ error: 'Unauthorized' })
    res.setHeader('Cache-Control', 'no-store')
    if (req.method === 'GET') return res.status(200).json(orcidConnectStatus(req, deps.env ?? process.env))

    const rl = rateLimit(req, 30, 10 * 60 * 1000, 'orcid-disconnect')
    if (!rl.allowed) return res.status(429).json({ error: 'Too many changes in a short time — try again in a few minutes.', code: 'RATE_LIMITED' })
    const scope: AuditScope = { snapshots: [] }
    // If-Match: the Studio's copy must be the stored version (it adopts the result without reloading).
    const written = await runInAuditScope(scope, () => changeStoredCv(res, (doc) => disconnectOrcidInCv(doc).doc, ctx.log, { ifMatch: req.headers['if-match'] }))
    if (written.kind === 'conflict') {
      res.setHeader('ETag', written.etag)
      return res.status(409).json({ error: 'The CV was changed elsewhere since you loaded it. Reload the Studio, then disconnect.', code: 'CONFLICT', etag: written.etag })
    }
    if (written.kind === 'error') return res.status(500).json({ error: 'The CV could not be written. Try again.', code: 'WRITE_FAILED' })
    if (written.kind !== 'written') return res.status(200).json({ ok: true, changed: false })
    recordAdminAudit(req, res, { action: 'orcid.disconnect', area: 'cv', target: 'orcid.org', summary: 'Disconnected the ORCID iD (it stays on the CV, unauthenticated)' }, { snapshots: scope.snapshots })
    return res.status(200).json({ ok: true, changed: true, etag: written.etag, ...(written.revalidateFailed.length ? { revalidateFailed: written.revalidateFailed } : {}) })
  }
}
