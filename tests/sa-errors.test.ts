/**
 * I4 — first-party error monitoring: scrubbing and grouping (lib/errors/scrub),
 * browser and CSP report parsing (lib/errors/ingest), the SQLite store with
 * its caps (lib/errors/store), server capture through the log observer
 * (lib/errors/server, lib/logBuffer), the browser payload (lib/errors/client)
 * and the API routes.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  fingerprintOf,
  groupingMessage,
  isExtensionNoise,
  normalizeErrorPath,
  normalizeRelease,
  scrubStack,
  scrubText,
  topFrame,
  MAX_FRAMES,
} from '../lib/errors/scrub'
import {
  describeBlocked,
  errorDropReason,
  parseClientError,
  parseCspReports,
  clientErrorEvent,
} from '../lib/errors/ingest'
import { buildPayload } from '../lib/errors/client'

process.env.JWT_SECRET = 'sa-errors-secret-0123456789abcdefghijkl'
delete process.env.TRUSTED_PROXY_IPS
delete process.env.TRUST_CLIENT_IP_HEADER

const prevCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-errors-'))
let store: typeof import('../lib/errors/store')
let server: typeof import('../lib/errors/server')
let logMod: typeof import('../lib/log')
let ring: typeof import('../lib/logBuffer')
let analyticsDb: typeof import('../lib/analytics/db')
type Handler = (req: any, res: any) => Promise<unknown> | unknown
let ingestRoute: Handler
let adminErrors: Handler

before(async () => {
  process.chdir(tmp)
  store = await import('../lib/errors/store')
  server = await import('../lib/errors/server')
  logMod = await import('../lib/log')
  ring = await import('../lib/logBuffer')
  analyticsDb = await import('../lib/analytics/db')
  ingestRoute = (await import('../pages/api/e')).default as Handler
  adminErrors = (await import('../pages/api/admin/errors')).default as Handler
})
after(() => {
  logMod.setLogObserver(null)
  analyticsDb.closeAnalyticsDb()
  process.chdir(prevCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'

// ── Scrubbing and grouping ────────────────────────────────────────────────

test('scrubText removes query strings, e-mails, IPs, tokens and long numbers — and keeps slugs and chunk names', () => {
  const s = scrubText(
    'Failed https://lucian-dev.com/admin/reset?token=0123456789abcdef0123456789abcdef0123456789abcdef#x for owner@example.com from 203.0.113.9 ' +
      'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJlLXNpZw phone 85212345678 key AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'
  )
  assert.doesNotMatch(s, /token=|owner@|203\.0\.113\.9|eyJ|85212345678|AbCdEfGh/)
  assert.match(s, /https:\/\/lucian-dev\.com\/admin\/reset /)
  assert.match(s, /\[email\].*\[ip\].*\[token\].*\[number\].*\[token\]/)
  assert.equal(
    scrubText('/blog/the-ai-was-the-easy-part-building-an-edge-waste-sorter'),
    '/blog/the-ai-was-the-easy-part-building-an-edge-waste-sorter'
  )
  assert.equal(
    scrubText('/_next/static/chunks/pages/_app-1a2b3c4d5e6f7a8b.js'),
    '/_next/static/chunks/pages/_app-1a2b3c4d5e6f7a8b.js'
  )
  assert.equal(scrubText('x'.repeat(900)).length, 500)
  assert.equal(scrubText('tab\tand\u0000null'), 'tab and null')
})

test('scrubStack drops the site origin and extension frames and caps the frame count', () => {
  const frames = Array.from(
    { length: 20 },
    (_, i) =>
      `    at f${i} (https://lucian-dev.com/_next/static/chunks/main-0123456789abcdef.js?v=1:1:${i})`
  )
  const stack = [
    'TypeError: boom',
    '    at ext (chrome-extension://abcdefghijklmnop/content.js:1:1)',
    ...frames,
  ].join('\n')
  const out = scrubStack(stack, ['https://lucian-dev.com'])
  assert.doesNotMatch(out, /chrome-extension|lucian-dev\.com|\?v=1/)
  assert.equal(out.split('\n').filter((l) => /^\s*at /.test(l)).length, MAX_FRAMES)
  assert.match(
    out.split('\n')[1],
    /at f0 \(\/_next\/static\/chunks\/main-0123456789abcdef\.js:1:0\)/
  )
  assert.equal(scrubStack(undefined), '')
})

test('topFrame names the first useful frame without line, column or content hash (V8 and Gecko)', () => {
  assert.equal(
    topFrame(
      'Error: x\n    at Foo.bar (/_next/static/chunks/pages/blog/[slug]-1a2b3c4d5e6f.js:1:2345)'
    ),
    'Foo.bar @ /_next/static/chunks/pages/blog/[slug].js'
  )
  assert.equal(
    topFrame('    at /_next/static/chunks/framework-64ad27b21261a9ce.js:9:1'),
    '/_next/static/chunks/framework.js'
  )
  assert.equal(
    topFrame('render@/_next/static/chunks/main-abcdef0123456789.js:1:99'),
    'render @ /_next/static/chunks/main.js'
  )
  assert.equal(
    topFrame('    at x (node:internal/process:1:1)\n    at y (pages/api/admin/posts.js:3:4)'),
    'y @ pages/api/admin/posts.js'
  )
  assert.equal(topFrame('no frames here'), '')
})

test('grouping: volatile numbers collapse; fingerprints are stable 32-hex', () => {
  assert.equal(
    groupingMessage('Loading chunk 734 failed.'),
    groupingMessage('Loading chunk 912 failed.')
  )
  assert.notEqual(
    groupingMessage('Cannot read properties of undefined (reading \x27a\x27)'),
    groupingMessage('Cannot read properties of undefined (reading \x27b\x27)')
  )
  const fp = fingerprintOf(['client', 'error', 'TypeError', 'x', 'f @ a.js'])
  assert.match(fp, /^[0-9a-f]{32}$/)
  assert.equal(fp, fingerprintOf(['client', 'error', 'TypeError', 'x', 'f @ a.js']))
  assert.equal(normalizeRelease('ABCDEF1'), 'abcdef1')
  assert.equal(normalizeRelease('not a sha'), null)
  assert.equal(normalizeErrorPath('https://lucian-dev.com/blog/x?utm=1'), '/blog/x')
  assert.equal(normalizeErrorPath('//evil.example'), null)
  assert.equal(normalizeErrorPath('/a b'), null)
  assert.equal(isExtensionNoise('moz-extension://x/y.js'), true)
})

// ── Parsing ────────────────────────────────────────────────────────────────

test('parseClientError accepts the reporter payload and drops noise', () => {
  const ok = parseClientError(
    JSON.stringify({
      k: 'error',
      n: 'TypeError',
      m: 'x is not a function',
      s: 'TypeError: x\n    at a (/_next/static/chunks/a.js:1:2)',
      f: '/_next/static/chunks/a.js?v=2',
      l: 1,
      c: 2,
      p: '/blog/x?q=secret',
      r: 'abcdef0',
    })
  )
  assert.ok(ok)
  assert.equal(ok!.file, '/_next/static/chunks/a.js')
  assert.equal(ok!.path, '/blog/x')
  assert.equal(ok!.release, 'abcdef0')
  assert.equal(
    parseClientError({ k: 'error', m: 'Script error.' }),
    null,
    'opaque cross-origin error'
  )
  assert.equal(
    parseClientError({ k: 'error', m: 'x', f: 'chrome-extension://abc/x.js' }),
    null,
    'extension'
  )
  assert.equal(parseClientError({ k: 'nope', m: 'x' }), null)
  assert.equal(parseClientError({ k: 'error' }), null)
  assert.equal(parseClientError('not json'), null)
  assert.equal(parseClientError('x'.repeat(9000)), null)
  const fileOnly = parseClientError({
    k: 'error',
    m: 'boom',
    f: '/_next/static/chunks/b.js',
    l: 3,
    c: 4,
  })
  assert.equal(fileOnly!.stack, '    at /_next/static/chunks/b.js:3:4')
  const evt = clientErrorEvent(ok!, UA, 'lucian-dev.com')
  assert.equal(evt.source, 'client')
  assert.equal(evt.browser, 'Chrome')
  assert.equal(evt.path, '/blog/x')
})

test('parseCspReports reads report-uri and Reporting API bodies, without queries or extension noise', () => {
  const legacy = parseCspReports(
    JSON.stringify({
      'csp-report': {
        'document-uri': 'https://lucian-dev.com/admin/reset?token=abc',
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'https://static.cloudflareinsights.com/beacon.min.js?token=x',
        'source-file': 'https://lucian-dev.com/blog',
        disposition: 'enforce',
      },
    })
  )
  assert.equal(legacy.length, 1)
  assert.deepEqual(legacy[0], {
    directive: 'script-src-elem',
    blocked: 'https://static.cloudflareinsights.com/beacon.min.js',
    source: 'https://lucian-dev.com/blog',
    path: '/admin/reset',
    disposition: 'enforce',
  })
  const modern = parseCspReports([
    {
      type: 'csp-violation',
      body: {
        documentURL: 'https://x/a',
        effectiveDirective: 'img-src',
        blockedURL: 'data:image/png;base64,AAA',
      },
    },
    {
      type: 'csp-violation',
      body: {
        documentURL: 'https://x/a',
        effectiveDirective: 'script-src',
        blockedURL: 'chrome-extension://x/y.js',
      },
    },
    {
      type: 'csp-violation',
      body: {
        documentURL: 'https://x/a',
        effectiveDirective: 'style-src',
        blockedURL: 'inline',
        disposition: 'report',
      },
    },
    { type: 'deprecation', body: {} },
  ])
  assert.deepEqual(
    modern.map((r) => [r.directive, r.blocked]),
    [['img-src', 'data']]
  )
  assert.equal(describeBlocked('eval'), 'eval')
  assert.equal(describeBlocked(''), 'inline')
})

test('errorDropReason honours DNT / GPC and refuses bots and cross-site posts', () => {
  const r = (headers: Record<string, string>) =>
    errorDropReason({ headers: { host: 'lucian-dev.com', 'user-agent': UA, ...headers } } as any)
  assert.equal(r({}), null)
  assert.equal(r({ dnt: '1' }), 'dnt')
  assert.equal(r({ 'sec-gpc': '1' }), 'gpc')
  assert.equal(r({ 'user-agent': 'Googlebot/2.1' }), 'bot')
  assert.equal(r({ 'sec-fetch-site': 'cross-site' }), 'cross-site')
  assert.equal(r({ origin: 'https://evil.example' }), 'cross-site')
  assert.equal(r({ origin: 'https://lucian-dev.com', 'sec-fetch-site': 'same-origin' }), null)
})

test('buildPayload (browser) sends the path without query, clipped fields and no identifiers', () => {
  const p = buildPayload(
    {
      kind: 'error',
      error: new TypeError('x'.repeat(800)),
      filename: 'https://lucian-dev.com/_next/a.js?v=1#h',
      lineno: 3,
      colno: 9,
    },
    '/blog/x'
  )
  assert.ok(p)
  assert.equal(p!.k, 'error')
  assert.equal(p!.n, 'TypeError')
  assert.equal((p!.m as string).length, 500)
  assert.equal(p!.f, 'https://lucian-dev.com/_next/a.js')
  assert.equal(p!.p, '/blog/x')
  assert.deepEqual(Object.keys(p!).sort(), ['c', 'f', 'k', 'l', 'm', 'n', 'p', 's'])
  assert.equal(
    buildPayload({ kind: 'unhandledrejection', error: { code: 42 } }, '/')!.m,
    '{"code":42}'
  )
  assert.equal(buildPayload({ kind: 'error' }, '/'), null)
})

// ── Store ──────────────────────────────────────────────────────────────────

const event = (over: Partial<import('../lib/errors/store').ErrorEventInput> = {}) => ({
  fingerprint: fingerprintOf(['t', String(over.message || 'm')]),
  source: 'client' as const,
  kind: 'error',
  name: 'TypeError',
  message: 'm',
  stack: null,
  path: '/a',
  route: null,
  release: 'abcdef0',
  browser: 'Chrome',
  ...over,
})

test('repeats group under one fingerprint with counts, browsers and releases; a resolved error that recurs reopens', () => {
  store.resetErrorStoreState()
  const t0 = Date.UTC(2026, 9, 13, 8)
  assert.equal(store.recordError(event({ message: 'one' }), t0), 'new')
  assert.equal(
    store.recordError(
      event({ message: 'one', browser: 'Safari', path: '/b', release: 'abcdef1' }),
      t0 + 1000
    ),
    'recorded'
  )
  const [row] = store.listErrors({ status: 'open' }, t0 + 2000)
  assert.equal(row.count, 2)
  assert.deepEqual(row.browsers, { Chrome: 1, Safari: 1 })
  assert.equal(row.path, '/b')
  assert.deepEqual([row.firstRelease, row.lastRelease], ['abcdef0', 'abcdef1'])
  assert.equal(row.daily[row.daily.length - 1], 2)

  assert.equal(store.setErrorStatus([row.fingerprint], 'resolved', t0 + 3000), 1)
  assert.equal(store.listErrors({ status: 'open' }, t0 + 3000).length, 0)
  store.recordError(event({ message: 'one' }), t0 + 4000)
  const again = store.getError(row.fingerprint, t0 + 4000)!
  assert.equal(again.status, 'open')
  assert.equal(again.regressedAt, t0 + 4000)

  store.setErrorStatus([row.fingerprint], 'ignored', t0 + 5000)
  store.recordError(event({ message: 'one' }), t0 + 6000)
  assert.equal(
    store.getError(row.fingerprint, t0 + 6000)!.status,
    'ignored',
    'ignored errors never reopen'
  )
  const totals = store.errorTotals(t0 + 6000)
  assert.equal(totals.ignored, 1)
  assert.equal(totals.eventsToday, 4)
})

test('caps: at most 500 fingerprints and 20 000 events a day; the rest is counted as dropped', () => {
  store.resetErrorStoreState()
  const db = analyticsDb.getAnalyticsDb()
  db.exec('DELETE FROM errors; DELETE FROM error_daily; DELETE FROM meta')
  const t = Date.UTC(2026, 9, 14, 8)
  for (let i = 0; i < store.ERROR_LIMITS.maxFingerprints; i++)
    store.recordError(
      event({ message: `cap ${i}`, fingerprint: fingerprintOf(['cap', String(i)]) }),
      t
    )
  assert.equal(
    store.recordError(
      event({ message: 'one too many', fingerprint: fingerprintOf(['cap', 'x']) }),
      t
    ),
    'capped'
  )
  assert.equal(
    store.recordError(event({ message: 'cap 0', fingerprint: fingerprintOf(['cap', '0']) }), t),
    'recorded',
    'repeats still count'
  )
  assert.equal(store.errorTotals(t).droppedToday, 1)

  store.resetErrorStoreState()
  const fp = fingerprintOf(['cap', '1'])
  let last = ''
  for (let i = 0; i <= store.ERROR_LIMITS.dailyEvents; i++)
    last = store.recordError(event({ fingerprint: fp }), t)
  assert.equal(last, 'over-daily-limit')
})

test('retention: open errors expire after 90 days unseen, closed ones after 30', () => {
  store.resetErrorStoreState()
  const db = analyticsDb.getAnalyticsDb()
  db.exec('DELETE FROM errors; DELETE FROM error_daily')
  const old = Date.UTC(2026, 0, 1)
  store.recordError(
    event({ message: 'old open', fingerprint: fingerprintOf(['old', 'open']) }),
    old
  )
  store.recordError(
    event({ message: 'old closed', fingerprint: fingerprintOf(['old', 'closed']) }),
    old
  )
  store.setErrorStatus([fingerprintOf(['old', 'closed'])], 'resolved', old)
  store.pruneErrors(old + 40 * 86_400_000, true)
  assert.deepEqual(
    store.listErrors({ status: 'all' }, old + 40 * 86_400_000).map((e) => e.message),
    ['old open']
  )
  store.pruneErrors(old + 91 * 86_400_000, true)
  assert.equal(store.listErrors({ status: 'all' }, old + 91 * 86_400_000).length, 0)
})

// ── Server capture ─────────────────────────────────────────────────────────

test('the log observer keeps warn/error entries in the ring and records errors that carry an exception', () => {
  store.resetErrorStoreState()
  ring.clearLogEntries()
  analyticsDb.getAnalyticsDb().exec('DELETE FROM errors; DELETE FROM error_daily')
  logMod.setLogObserver(server.observeLogEntry)
  logMod.log.info('not kept')
  logMod.log.warn('slow API request', { route: 'admin/posts', ms: 1200 })
  logMod.log.error('API responded 5xx', { status: 500 })
  const boom = new Error('database is locked for owner@example.com')
  logMod.log.error('unhandled API error', { route: 'admin/posts', err: boom, password: 'hunter2' })
  const entries = ring.recentLogEntries(10)
  assert.deepEqual(
    entries.map((e) => e.msg),
    ['unhandled API error', 'API responded 5xx', 'slow API request']
  )
  assert.doesNotMatch(entries[0].fields || '', /hunter2/, 'redacted like the log line')
  const [err] = store.listErrors({ status: 'open' })
  assert.equal(err.source, 'server')
  assert.equal(err.kind, 'api')
  assert.equal(err.route, 'admin/posts')
  assert.match(err.message, /^unhandled API error: database is locked for \[email\]$/)
  assert.equal(
    store.listErrors({ status: 'all' }).length,
    1,
    'only the entry with an Error was recorded'
  )
  logMod.setLogObserver(null)
})

test('captureServerError (onRequestError) records render errors with the path, never throws', () => {
  store.resetErrorStoreState()
  analyticsDb.getAnalyticsDb().exec('DELETE FROM errors; DELETE FROM error_daily')
  server.captureServerError(new RangeError('bad month 13'), {
    kind: 'render',
    route: '/blog/[slug]',
    path: '/blog/x?draft=1',
  })
  server.captureServerError('a string was thrown', { kind: 'render', route: '/' })
  const rows = store.listErrors({ status: 'all' })
  assert.equal(rows.length, 2)
  const range = rows.find((r) => r.name === 'RangeError')!
  assert.deepEqual([range.kind, range.route, range.path], ['render', '/blog/[slug]', '/blog/x'])
  assert.doesNotThrow(() =>
    server.captureServerError(new Error('x'), { kind: 'Not A Slug!', route: null })
  )
})

// ── Routes ─────────────────────────────────────────────────────────────────

type Out = { statusCode: number; headers: Record<string, string | string[]>; body: any }
let ipSeq = 0
async function call(
  handler: Handler,
  opts: {
    method: string
    body?: unknown
    headers?: Record<string, string>
    query?: Record<string, string>
    cookie?: string
  }
): Promise<Out> {
  ipSeq++
  const req = {
    method: opts.method,
    url: '/api/test',
    query: opts.query || {},
    body: opts.body,
    headers: {
      host: 'lucian-dev.com',
      'user-agent': UA,
      'cf-connecting-ip': `198.51.100.${ipSeq % 250}`,
      ...(opts.headers || {}),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    cookies: opts.cookie
      ? Object.fromEntries(
          [opts.cookie.split('=')].map(([k, ...v]) => [k, decodeURIComponent(v.join('='))])
        )
      : {},
    socket: { remoteAddress: '127.0.0.1' },
  }
  const out: Out = { statusCode: 200, headers: {}, body: undefined }
  const res: any = {
    get statusCode() {
      return out.statusCode
    },
    set statusCode(v: number) {
      out.statusCode = v
    },
    status(code: number) {
      out.statusCode = code
      return res
    },
    setHeader(name: string, value: string | string[]) {
      out.headers[name.toLowerCase()] = value
      return res
    },
    getHeader: (name: string) => out.headers[name.toLowerCase()],
    json(b: unknown) {
      out.body = b
      return res
    },
    end() {
      return res
    },
  }
  await handler(req, res)
  return out
}

test('POST /api/e always answers 204; browser reports and CSP reports are recorded, junk is not', async () => {
  store.resetErrorStoreState()
  analyticsDb.getAnalyticsDb().exec('DELETE FROM errors; DELETE FROM error_daily')
  const browser = await call(ingestRoute, {
    method: 'POST',
    body: JSON.stringify({ k: 'unhandledrejection', m: 'fetch failed', p: '/contact' }),
  })
  assert.equal(browser.statusCode, 204)
  const csp = await call(ingestRoute, {
    method: 'POST',
    headers: { 'content-type': 'application/csp-report' },
    body: JSON.stringify({
      'csp-report': {
        'document-uri': 'https://lucian-dev.com/',
        'effective-directive': 'connect-src',
        'blocked-uri': 'https://example.org/x',
      },
    }),
  })
  assert.equal(csp.statusCode, 204)
  const junk = await call(ingestRoute, { method: 'POST', body: '{nope' })
  assert.equal(junk.statusCode, 204)
  const dnt = await call(ingestRoute, {
    method: 'POST',
    headers: { dnt: '1' },
    body: JSON.stringify({ k: 'error', m: 'tracked?' }),
  })
  assert.equal(dnt.statusCode, 204)
  const get = await call(ingestRoute, { method: 'GET' })
  assert.equal(get.statusCode, 405)
  const rows = store.listErrors({ status: 'all' })
  assert.deepEqual(rows.map((r) => r.source).sort(), ['client', 'csp'])
  assert.ok(!rows.some((r) => r.message.includes('tracked?')), 'DNT honoured')
})

test('the browser-report budget per client stops a flood', async () => {
  store.resetErrorStoreState()
  analyticsDb.getAnalyticsDb().exec('DELETE FROM errors; DELETE FROM error_daily')
  const { ingestErrorReport, CLIENT_EVENTS_PER_MIN } = await import('../lib/errors/ingest')
  const req = (i: number) =>
    ({
      method: 'POST',
      headers: { host: 'lucian-dev.com', 'user-agent': UA, 'cf-connecting-ip': '192.0.2.77' },
      body: JSON.stringify({ k: 'error', m: `flood ${i}` }),
      socket: { remoteAddress: '127.0.0.1' },
    }) as any
  const outcomes = Array.from({ length: CLIENT_EVENTS_PER_MIN + 5 }, (_, i) =>
    ingestErrorReport(req(i), Date.UTC(2026, 9, 15, 8))
  )
  assert.equal(outcomes.filter((o) => o.recorded === 1).length, CLIENT_EVENTS_PER_MIN)
  assert.equal(outcomes[outcomes.length - 1].dropped, 'rate-limited')
})

test('GET/PATCH/DELETE /api/admin/errors need an admin session and validate their input', async () => {
  const anon = await call(adminErrors, { method: 'GET' })
  assert.equal(anon.statusCode, 401)
  const { createSession } = await import('../lib/adminAuth/sessions')
  const { signAdminToken } = await import('../lib/auth')
  const sid = createSession({
    method: 'password',
    ttlMs: 3_600_000,
    device: null,
    ipPrefix: null,
    country: null,
  }).id
  const cookie = `cv_admin_token=${signAdminToken('owner@example.test', { sid })}`
  const list = await call(adminErrors, { method: 'GET', cookie, query: { status: 'all' } })
  assert.equal(list.statusCode, 200)
  assert.ok(Array.isArray(list.body.errors))
  assert.equal(typeof list.body.totals.open, 'number')
  const fp = list.body.errors[0].fingerprint
  const one = await call(adminErrors, { method: 'GET', cookie, query: { fp } })
  assert.equal(one.body.error.daily.length, 30)
  assert.equal(
    (await call(adminErrors, { method: 'GET', cookie, query: { fp: 'bad' } })).statusCode,
    400
  )
  assert.equal(
    (
      await call(adminErrors, {
        method: 'PATCH',
        cookie,
        body: { fingerprints: [fp], status: 'resolved' },
      })
    ).body.changed,
    1
  )
  assert.equal(
    (
      await call(adminErrors, {
        method: 'PATCH',
        cookie,
        body: { fingerprints: [fp], status: 'gone' },
      })
    ).statusCode,
    400
  )
  assert.equal(
    (await call(adminErrors, { method: 'DELETE', cookie, body: { resolved: true } })).body.deleted,
    1
  )
  assert.equal(
    (await call(adminErrors, { method: 'DELETE', cookie, body: { fingerprints: ['x'] } }))
      .statusCode,
    400
  )
  const { closeAuthDb } = await import('../lib/adminAuth/db')
  closeAuthDb()
})
