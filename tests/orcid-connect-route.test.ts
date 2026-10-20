/**
 * orcid-connect — the routes of "Connect your ORCID iD" driven like the real
 * ones (withApi + the handlers) over a throw-away content store, auth.db and
 * activity log, with ORCID's token endpoint played by a LOCAL fake server
 * (the transport is injected; nothing leaves the machine):
 *
 *   connect     admin only; without credentials back to the Studio; with
 *               them a 302 to ORCID's sign-in with a fresh state and the
 *               HttpOnly / SameSite=Lax / callback-path flow cookie;
 *   callback    the state and its cookie, the session that started it (live,
 *               current, the same one), ORCID's errors, every token answer,
 *               the CV write (both languages, the marker), the activity log,
 *               the return page — and the access token kept nowhere;
 *   connection  the setup (no secrets) and disconnect (If-Match);
 *   /api/cvdata the save rule: an edited iD loses the marker, a forged one
 *               never sticks.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import jwt from 'jsonwebtoken'
import { editorialHarness } from './editorialHarness'
import { SafeFetchError, type SafeFetchOptions, type SafeFetchResult } from '../lib/security/safeFetch'
import type { Fetcher } from '../lib/orcid/fetch'
import { EXAMPLE_ORCID_ID, SYNTHETIC_ORCID_ID } from './fixtures/orcid'

const ID = EXAMPLE_ORCID_ID
const OTHER = SYNTHETIC_ORCID_ID
const NAME = 'orcid-connect-route'
const SECRET = `${NAME}-secret`
const h = editorialHarness(NAME, SECRET)

const SITE = 'https://cv.example.com'
const ENV = { ORCID_CLIENT_ID: 'APP-ABCDEFGHIJ012345', ORCID_CLIENT_SECRET: 'synthetic-client-secret', SITE_URL: SITE }
const ACCESS_TOKEN = 'synthetic-access-token-never-kept'

// ── The fake token endpoint ────────────────────────────────────────────────

type TokenRequest = { method: string; path: string; headers: http.IncomingHttpHeaders; form: URLSearchParams }
const received: TokenRequest[] = []
let server: http.Server
let port = 0

function startTokenServer(): Promise<void> {
  server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const form = new URLSearchParams(body)
      received.push({ method: req.method || '', path: req.url || '', headers: req.headers, form })
      const json = (status: number, payload: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json;charset=UTF-8' })
        res.end(JSON.stringify(payload))
      }
      const wellFormed =
        req.method === 'POST' &&
        req.url === '/oauth/token' &&
        /application\/x-www-form-urlencoded/.test(String(req.headers['content-type'])) &&
        /application\/json/.test(String(req.headers.accept)) &&
        form.get('grant_type') === 'authorization_code' &&
        form.get('redirect_uri') === `${SITE}/api/admin/orcid/callback`
      if (!wellFormed) return json(400, { error: 'invalid_request' })
      if (form.get('client_id') !== ENV.ORCID_CLIENT_ID || form.get('client_secret') !== ENV.ORCID_CLIENT_SECRET) return json(401, { error: 'invalid_client' })
      switch (form.get('code')) {
        case 'good':
          return json(200, { access_token: ACCESS_TOKEN, token_type: 'bearer', refresh_token: 'synthetic-refresh', expires_in: 631138518, scope: '/authenticate', name: 'Example Person', orcid: ID })
        case 'used':
          return json(400, { error: 'invalid_grant', error_description: 'Invalid authorization code' })
        case 'busy':
          return json(503, { error: 'server_error' })
        case 'html':
          res.writeHead(200, { 'content-type': 'text/html' })
          return res.end('<html>maintenance</html>')
        case 'no-orcid':
          return json(200, { access_token: ACCESS_TOKEN, token_type: 'bearer' })
        case 'moved':
          res.writeHead(302, { location: 'https://elsewhere.example/oauth/token' })
          return res.end()
        default:
          return json(400, { error: 'invalid_grant' })
      }
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => ((port = (server.address() as AddressInfo).port), resolve())))
}

/**
 * The transport: ORCID's token endpoint is answered by the local server
 * (same method, headers and body); 'timeout' codes fail like safeFetch does.
 * Any other URL fails the test.
 */
const calls: string[] = []
const fetcher: Fetcher = async (url: string, opts: SafeFetchOptions): Promise<SafeFetchResult> => {
  calls.push(url)
  assert.equal(new URL(url).host, 'orcid.org', 'only the configured ORCID host')
  assert.equal(opts.method, 'POST')
  assert.equal(opts.redirect, 'manual')
  if (String(opts.body).includes('code=timeout')) throw new SafeFetchError('TIMEOUT', 'Request timed out')
  const u = new URL(url)
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: u.pathname, method: opts.method, headers: { ...opts.headers, 'content-length': Buffer.byteLength(opts.body || '') } },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks), url }))
      },
    )
    req.on('error', reject)
    req.end(opts.body)
  })
}

// ── Driving the routes ─────────────────────────────────────────────────────

type Result = { statusCode: number; body: any; headers: Record<string, string | string[]>; revalidated: string[] }

let ipSeq = 20
async function drive(handler: (req: any, res: any) => unknown, opts: { method?: string; query?: Record<string, unknown>; cookies?: Record<string, string>; headers?: Record<string, string> } = {}): Promise<Result> {
  const out: Result = { statusCode: 200, body: undefined, headers: {}, revalidated: [] }
  const res: any = {
    get statusCode() {
      return out.statusCode
    },
    set statusCode(c: number) {
      out.statusCode = c
    },
    status(c: number) {
      out.statusCode = c
      return res
    },
    setHeader(k: string, v: any) {
      out.headers[k.toLowerCase()] = Array.isArray(v) ? v.map(String) : String(v)
      return res
    },
    getHeader: (k: string) => out.headers[k.toLowerCase()],
    json(b: unknown) {
      out.body = JSON.parse(JSON.stringify(b))
      return res
    },
    send(b: unknown) {
      out.body = b
      return res
    },
    end() {
      return res
    },
    async revalidate(p: string) {
      out.revalidated.push(p)
    },
  }
  const cookies = opts.cookies || {}
  await handler(
    {
      method: opts.method || 'GET',
      url: '/api/admin/orcid/x',
      query: opts.query || {},
      cookies,
      headers: { host: 'cv.example.com', cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '), ...(opts.headers || {}) },
      socket: { remoteAddress: `127.0.2.${ipSeq++}` },
    },
    res,
  )
  return out
}

const setCookies = (r: Result): string[] => {
  const v = r.headers['set-cookie']
  return Array.isArray(v) ? v : v ? [v] : []
}

async function newSession(): Promise<{ id: string; token: string }> {
  const { createSession } = await import('../lib/adminAuth/sessions')
  const id = createSession({ method: 'password', ttlMs: 3_600_000, device: null, ipPrefix: null, country: null }).id
  return { id, token: jwt.sign({ role: 'admin', email: 'owner@example.test', sid: id }, SECRET, { algorithm: 'HS256' }) }
}

async function routes(env: Readonly<Record<string, string | undefined>> = ENV, now?: () => number) {
  const { withApi } = await import('../lib/apiHandler')
  const r = await import('../lib/orcid/connectRoute')
  const { createReplayGuard } = await import('../lib/security/replayGuard')
  const deps = { fetcher, env, now, guard: createReplayGuard() }
  return {
    connect: withApi('admin/orcid/connect', r.orcidConnectRoute(deps)),
    callback: withApi('admin/orcid/callback', r.orcidCallbackRoute(deps)),
    connection: withApi('admin/orcid/connection', r.orcidConnectionRoute(deps)),
  }
}

const PI = (lang: 'en' | 'zh', extra: Record<string, unknown> = {}) => ({
  sessionName: 'personalInformation',
  firstName: lang === 'en' ? 'Example' : '例',
  lastName: lang === 'en' ? 'Person' : '人',
  introduction: 'A synthetic summary.',
  ...extra,
})

async function writeStore(doc: { en: any[]; zh: any[] }) {
  const { writeCvData } = await import('../lib/cvdata')
  const r = await writeCvData(doc)
  assert.ok(r.ok)
}
async function readStore() {
  const { readCvDataWithVersion } = await import('../lib/cvdata')
  return readCvDataWithVersion()
}
const piOf = (list: any[]) => list.find((s) => s?.sessionName === 'personalInformation')

/** Start a flow through the real connect route: the state ORCID would echo, and the flow cookie. */
async function startFlow(rt: Awaited<ReturnType<typeof routes>>, session: { token: string }) {
  const r = await drive(rt.connect, { cookies: { cv_admin_token: session.token } })
  assert.equal(r.statusCode, 302, JSON.stringify(r.body))
  const state = new URL(String(r.headers.location)).searchParams.get('state') || ''
  const cookie = setCookies(r).find((c) => c.startsWith('cv_orcid_flow='))
  assert.ok(cookie, 'flow cookie set')
  return { state, flow: decodeURIComponent(cookie.split(';')[0].slice('cv_orcid_flow='.length)), setCookie: cookie, location: String(r.headers.location) }
}

const returnOf = (r: Result) => {
  assert.equal(r.statusCode, 200)
  assert.match(String(r.headers['content-type']), /text\/html/)
  const m = /url=([^"]+)"/.exec(String(r.body))
  assert.ok(m, 'a refresh to the Studio')
  return new URL(m[1].replace(/&amp;/g, '&'), 'https://cv.example.com')
}

before(async () => {
  await h.setup()
  await startTokenServer()
})
after(() => {
  server?.close()
  h.teardown()
})

// ── connect ────────────────────────────────────────────────────────────────

test('connect: admin only, GET only; without credentials back to the Studio with the reason; nothing set', async () => {
  const s = await newSession()
  const off = await routes({ SITE_URL: SITE })
  assert.equal((await drive(off.connect)).statusCode, 401)
  assert.equal((await drive(off.connect, { method: 'POST', cookies: { cv_admin_token: s.token } })).statusCode, 405)
  const r = await drive(off.connect, { cookies: { cv_admin_token: s.token } })
  assert.equal(r.statusCode, 303)
  assert.equal(r.headers.location, '/admin/dashboard?tab=cv&orcid=error&reason=config')
  assert.deepEqual(setCookies(r).filter((c) => c.startsWith('cv_orcid_flow')), [])
})

test('connect: to ORCID’s sign-in with a fresh state, /authenticate, the registered redirect URI and the iD as a hint; the flow cookie is HttpOnly, Lax, callback-only, 10 minutes', async () => {
  await writeStore({ en: [PI('en', { orcid: ID })], zh: [PI('zh', { orcid: ID })] })
  const s = await newSession()
  const rt = await routes()
  const a = await startFlow(rt, s)
  const url = new URL(a.location)
  assert.equal(url.origin + url.pathname, 'https://orcid.org/oauth/authorize')
  assert.equal(url.searchParams.get('scope'), '/authenticate')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('client_id'), ENV.ORCID_CLIENT_ID)
  assert.equal(url.searchParams.get('redirect_uri'), `${SITE}/api/admin/orcid/callback`)
  assert.equal(url.searchParams.get('orcid'), ID)
  assert.match(a.state, /^[A-Za-z0-9_-]{43}$/)
  assert.ok(!a.location.includes(ENV.ORCID_CLIENT_SECRET))
  assert.match(a.setCookie, /; HttpOnly/i)
  assert.match(a.setCookie, /; SameSite=Lax/i)
  assert.match(a.setCookie, /; Path=\/api\/admin\/orcid\/callback/i)
  assert.match(a.setCookie, /; Max-Age=600/i)
  assert.ok(a.flow.includes(a.state), 'the cookie carries the state it was issued for')
  const b = await startFlow(rt, s)
  assert.notEqual(a.state, b.state)
})

test('connect: from another host than the registered redirect URI, back to the Studio (the flow cookie could not come back)', async () => {
  const s = await newSession()
  const rt = await routes()
  const r = await drive(rt.connect, { cookies: { cv_admin_token: s.token }, headers: { host: 'www.cv.example.com' } })
  assert.equal(r.statusCode, 303)
  assert.match(String(r.headers.location), /reason=host$/)
})

// ── callback ───────────────────────────────────────────────────────────────

test('callback: the full flow — the code is exchanged on the server, the confirmed iD and its marker are stored in both languages, logged, and the Studio opens; no token is kept anywhere', async () => {
  await writeStore({ en: [PI('en', { orcid: OTHER, hiddenFields: ['phoneNumber'] })], zh: [PI('zh', { orcid: OTHER })] })
  const s = await newSession()
  const rt = await routes()
  const flow = await startFlow(rt, s)
  received.length = 0
  calls.length = 0
  // The browser comes back from orcid.org: the Strict session cookie is NOT sent, the Lax flow cookie is.
  const r = await drive(rt.callback, { query: { code: 'good', state: flow.state }, cookies: { cv_orcid_flow: flow.flow } })
  const back = returnOf(r)
  assert.equal(back.pathname, '/admin/dashboard')
  assert.equal(back.searchParams.get('orcid'), 'connected')
  assert.equal(back.searchParams.get('replaced'), '1', 'the typed iD was a different one')
  assert.equal(r.headers['cache-control'], 'no-store')
  assert.match(String(r.body), /<meta name="referrer" content="no-referrer">/)
  assert.ok(setCookies(r).some((c) => /^cv_orcid_flow=;/.test(c) && /Max-Age=0/i.test(c)), 'the flow cookie is cleared')

  // The token request: one POST, form-encoded, with the secret, to ORCID's token endpoint.
  assert.deepEqual(calls, ['https://orcid.org/oauth/token'])
  assert.equal(received.length, 1)
  assert.equal(received[0].form.get('code'), 'good')
  assert.equal(received[0].form.get('client_secret'), ENV.ORCID_CLIENT_SECRET)

  const stored = await readStore()
  for (const lang of ['en', 'zh'] as const) {
    const p = piOf(stored[lang])
    assert.equal(p.orcid, ID)
    assert.equal(p.orcidAuthenticated.id, ID)
    assert.ok(!Number.isNaN(Date.parse(p.orcidAuthenticated.at)))
  }
  assert.deepEqual(piOf(stored.en).hiddenFields, ['phoneNumber'], 'visibility untouched')
  assert.ok(r.revalidated.includes('/cv') && r.revalidated.includes('/about') && r.revalidated.includes('/publications'))

  const { listAudit } = await import('../lib/audit/store')
  const entry = listAudit({ q: 'Connected the ORCID iD' }).entries[0]
  assert.ok(entry, 'in the activity log')
  assert.equal(entry.action, 'orcid.connect')
  assert.equal(entry.area, 'cv')
  assert.equal(entry.sessionId, s.id, 'attributed to the session that started the flow')
  assert.equal(entry.status, 200)

  const everywhere = JSON.stringify([stored, r.body, r.headers, listAudit({}).entries])
  assert.ok(!everywhere.includes(ACCESS_TOKEN), 'the access token is kept nowhere')
  assert.ok(!everywhere.includes('synthetic-refresh'))
  assert.ok(!everywhere.includes(ENV.ORCID_CLIENT_SECRET))
})

test('callback: replay — the same link back from ORCID works once', async () => {
  await writeStore({ en: [PI('en')], zh: [] })
  const s = await newSession()
  const rt = await routes()
  const flow = await startFlow(rt, s)
  const first = await drive(rt.callback, { query: { code: 'good', state: flow.state }, cookies: { cv_orcid_flow: flow.flow } })
  assert.equal(returnOf(first).searchParams.get('orcid'), 'connected')
  assert.equal(returnOf(first).searchParams.get('replaced'), null)
  calls.length = 0
  const again = await drive(rt.callback, { query: { code: 'good', state: flow.state }, cookies: { cv_orcid_flow: flow.flow } })
  assert.equal(returnOf(again).searchParams.get('reason'), 'state')
  assert.equal(calls.length, 0, 'ORCID was not asked again')
})

test('callback: bad state, no flow cookie, another browser’s cookie or an expired flow — nothing is exchanged or written', async () => {
  await writeStore({ en: [PI('en', { orcid: OTHER })], zh: [] })
  const before = await readStore()
  const s = await newSession()
  const rt = await routes()
  calls.length = 0
  const a = await startFlow(rt, s)
  const b = await startFlow(rt, s)
  const reason = async (query: Record<string, unknown>, cookies: Record<string, string>) => returnOf(await drive(rt.callback, { query, cookies })).searchParams.get('reason')
  assert.equal(await reason({ code: 'good', state: 'x'.repeat(43) }, { cv_orcid_flow: a.flow }), 'state')
  assert.equal(await reason({ code: 'good', state: a.state }, {}), 'state')
  assert.equal(await reason({ code: 'good', state: a.state }, { cv_orcid_flow: b.flow }), 'state')
  assert.equal(await reason({ code: 'good' }, { cv_orcid_flow: b.flow }), 'state')
  assert.equal(await reason({ code: 'good', state: b.state }, { cv_orcid_flow: `${b.flow}x` }), 'state')
  // Eleven minutes later.
  const late = await routes(ENV, () => Date.now() + 11 * 60_000)
  const c = await startFlow(rt, s)
  assert.equal(returnOf(await drive(late.callback, { query: { code: 'good', state: c.state }, cookies: { cv_orcid_flow: c.flow } })).searchParams.get('reason'), 'expired')
  assert.equal(calls.length, 0)
  assert.equal((await readStore()).version, before.version, 'nothing written')
})

test('callback: the session that started the flow must still be live, current and — when one is sent — the same', async () => {
  await writeStore({ en: [PI('en')], zh: [] })
  const rt = await routes()
  calls.length = 0
  // Signed out (this browser's session revoked) during the ORCID sign-in.
  const s1 = await newSession()
  const f1 = await startFlow(rt, s1)
  const { revokeSession } = await import('../lib/adminAuth/sessions')
  assert.ok(revokeSession(s1.id, 'test'))
  assert.equal(returnOf(await drive(rt.callback, { query: { code: 'good', state: f1.state }, cookies: { cv_orcid_flow: f1.flow } })).searchParams.get('reason'), 'session')
  // Another admin session's cookie arrives with this flow (a same-site arrival): not this flow's session.
  const s2 = await newSession()
  const s3 = await newSession()
  const f2 = await startFlow(rt, s2)
  assert.equal(
    returnOf(await drive(rt.callback, { query: { code: 'good', state: f2.state }, cookies: { cv_orcid_flow: f2.flow, cv_admin_token: s3.token } })).searchParams.get('reason'),
    'session',
  )
  // A flow minted under another session version ("sign out everywhere" since).
  const { newOrcidFlow } = await import('../lib/orcid/flow')
  const s4 = await newSession()
  const f4 = newOrcidFlow(SECRET, { sid: s4.id, sv: 7 })
  assert.equal(returnOf(await drive(rt.callback, { query: { code: 'good', state: f4.state }, cookies: { cv_orcid_flow: f4.cookie } })).searchParams.get('reason'), 'session')
  assert.equal(calls.length, 0)
  // The same session's own cookie may come along (same-site arrival): fine.
  const s5 = await newSession()
  const f5 = await startFlow(rt, s5)
  assert.equal(
    returnOf(await drive(rt.callback, { query: { code: 'good', state: f5.state }, cookies: { cv_orcid_flow: f5.flow, cv_admin_token: s5.token } })).searchParams.get('orcid'),
    'connected',
  )
})

test('callback: cancelled on ORCID or ORCID’s error → no exchange; every token answer has its reason and is logged', async () => {
  await writeStore({ en: [PI('en', { orcid: OTHER })], zh: [] })
  const before = await readStore()
  const s = await newSession()
  const rt = await routes()
  const run = async (query: Record<string, unknown>) => {
    const f = await startFlow(rt, s)
    return returnOf(await drive(rt.callback, { query: { state: f.state, ...query }, cookies: { cv_orcid_flow: f.flow } })).searchParams.get('reason')
  }
  calls.length = 0
  assert.equal(await run({ error: 'access_denied', error_description: 'User denied access' }), 'denied')
  assert.equal(await run({ error: 'invalid_scope' }), 'orcid')
  assert.equal(await run({ error: '<b>' }), 'orcid')
  assert.equal(await run({}), 'exchange', 'no code')
  assert.equal(await run({ code: 'bad code!' }), 'exchange')
  assert.equal(calls.length, 0, 'ORCID was not asked')

  assert.equal(await run({ code: 'used' }), 'exchange')
  assert.equal(await run({ code: 'busy' }), 'busy')
  assert.equal(await run({ code: 'html' }), 'malformed')
  assert.equal(await run({ code: 'no-orcid' }), 'malformed')
  assert.equal(await run({ code: 'moved' }), 'unreachable')
  assert.equal(await run({ code: 'timeout' }), 'timeout')
  const wrongSecret = await routes({ ...ENV, ORCID_CLIENT_SECRET: 'not-the-secret' })
  const f = await startFlow(wrongSecret, s)
  assert.equal(returnOf(await drive(wrongSecret.callback, { query: { state: f.state, code: 'good' }, cookies: { cv_orcid_flow: f.flow } })).searchParams.get('reason'), 'client')
  assert.equal((await readStore()).version, before.version, 'nothing written')

  const { listAudit } = await import('../lib/audit/store')
  const tried = listAudit({ q: 'Tried to connect the ORCID iD' }).entries
  assert.equal(tried.length, 7)
  assert.ok(tried.every((e) => e.action === 'orcid.connect' && e.sessionId === s.id))
  assert.ok(!JSON.stringify(tried).includes('not-the-secret'))
})

test('callback: no Personal Info to hold the iD; credentials removed mid-flow; POST', async () => {
  await writeStore({ en: [{ sessionName: 'education', headerName: 'Education', degrees: [] }], zh: [] })
  const s = await newSession()
  const rt = await routes()
  const f = await startFlow(rt, s)
  assert.equal(returnOf(await drive(rt.callback, { query: { state: f.state, code: 'good' }, cookies: { cv_orcid_flow: f.flow } })).searchParams.get('reason'), 'nopi')
  const g = await startFlow(rt, s)
  const off = await routes({ SITE_URL: SITE })
  assert.equal(returnOf(await drive(off.callback, { query: { state: g.state, code: 'good' }, cookies: { cv_orcid_flow: g.flow } })).searchParams.get('reason'), 'config')
  const post = await drive(rt.callback, { method: 'POST' })
  assert.equal(post.statusCode, 405)
  assert.equal(post.headers.allow, 'GET')
})

// ── connection: setup and disconnect ───────────────────────────────────────

test('connection: the setup the Studio shows (never a secret); admin only', async () => {
  const s = await newSession()
  const on = await routes()
  const off = await routes({ SITE_URL: SITE, ORCID_ENV: 'sandbox' })
  assert.equal((await drive(on.connection)).statusCode, 401)
  const a = await drive(on.connection, { cookies: { cv_admin_token: s.token } })
  assert.deepEqual(a.body, { configured: true, env: 'production', redirectUri: `${SITE}/api/admin/orcid/callback` })
  assert.equal(a.headers['cache-control'], 'no-store')
  assert.ok(!JSON.stringify(a.body).includes(ENV.ORCID_CLIENT_SECRET) && !JSON.stringify(a.body).includes(ENV.ORCID_CLIENT_ID))
  const b = await drive(off.connection, { cookies: { cv_admin_token: s.token } })
  assert.deepEqual(b.body, { configured: false, env: 'sandbox', problem: 'missing', redirectUri: `${SITE}/api/admin/orcid/callback` })
  assert.equal((await drive(on.connection, { method: 'PUT', cookies: { cv_admin_token: s.token } })).statusCode, 405)
})

test('disconnect: the marker goes from both languages, the iD stays; If-Match protects an editor’s copy; logged', async () => {
  const at = '2026-10-21T08:00:00.000Z'
  await writeStore({ en: [PI('en', { orcid: ID, orcidAuthenticated: { id: ID, at } })], zh: [PI('zh', { orcid: ID, orcidAuthenticated: { id: ID, at } })] })
  const { kvEtag } = await import('../lib/contentStore')
  const s = await newSession()
  const rt = await routes({ SITE_URL: SITE })
  assert.equal((await drive(rt.connection, { method: 'DELETE' })).statusCode, 401)
  const stale = await drive(rt.connection, { method: 'DELETE', cookies: { cv_admin_token: s.token }, headers: { 'if-match': '"not-this-version"' } })
  assert.equal(stale.statusCode, 409)
  assert.equal(stale.body.code, 'CONFLICT')
  const current = await readStore()
  const r = await drive(rt.connection, { method: 'DELETE', cookies: { cv_admin_token: s.token }, headers: { 'if-match': kvEtag(current.version) } })
  assert.equal(r.statusCode, 200, JSON.stringify(r.body))
  assert.equal(r.body.changed, true)
  const after = await readStore()
  assert.equal(r.body.etag, kvEtag(after.version))
  for (const lang of ['en', 'zh'] as const) {
    assert.equal(piOf(after[lang]).orcid, ID)
    assert.equal('orcidAuthenticated' in piOf(after[lang]), false)
  }
  assert.ok(r.revalidated.includes('/cv'))
  const again = await drive(rt.connection, { method: 'DELETE', cookies: { cv_admin_token: s.token } })
  assert.deepEqual(again.body, { ok: true, changed: false })
  const { listAudit } = await import('../lib/audit/store')
  assert.equal(listAudit({ q: 'Disconnected the ORCID iD' }).entries[0]?.action, 'orcid.disconnect')
})

// ── The save rule through /api/cvdata ──────────────────────────────────────

test('/api/cvdata: saving keeps the marker while the iD is the confirmed one; an edited iD or a forged marker never keeps it', async () => {
  const at = '2026-10-21T08:00:00.000Z'
  const marked = (lang: 'en' | 'zh', orcid = ID) => PI(lang, { orcid, orcidAuthenticated: { id: ID, at } })
  await writeStore({ en: [marked('en')], zh: [marked('zh')] })
  const { default: cvdata } = await import('../pages/api/cvdata')
  const put = async (doc: { en: any[]; zh: any[] }) => {
    const r = await h.call(cvdata as any, { method: 'PUT', body: doc, ip: `127.0.3.${ipSeq++}` })
    assert.equal(r.statusCode, 200, JSON.stringify(r.body))
  }
  // A save that leaves the iD alone (another field edited): kept.
  await put({ en: [{ ...marked('en'), introduction: 'Edited.' }], zh: [marked('zh')] })
  assert.deepEqual(piOf((await readStore()).en).orcidAuthenticated, { id: ID, at })
  // The iD edited by hand (the marker still sent, as an old client would): gone, in both languages.
  await put({ en: [marked('en', OTHER)], zh: [marked('zh', OTHER)] })
  let stored = await readStore()
  assert.equal('orcidAuthenticated' in piOf(stored.en), false)
  assert.equal('orcidAuthenticated' in piOf(stored.zh), false)
  // Typed back with the marker pasted into the JSON: not believed.
  await put({ en: [marked('en')], zh: [marked('zh')] })
  stored = await readStore()
  assert.equal('orcidAuthenticated' in piOf(stored.en), false)
  assert.equal(piOf(stored.en).orcid, ID)
})
