/**
 * H9 — privacy-preserving goal events (lib/analytics/events, eventsShared,
 * goalsQuery, goalBeacon, searchEmpty, readThrough): the allow-list and its
 * one-property rules, the search_empty normalisation (≤ 40 characters,
 * nothing with "@" or 6+ digits), the page-view exclusions and budgets,
 * server-side counting through the real CV export / vCard / contact
 * handlers, the daily rollup and retention (35 days for search_empty), the
 * Source → CV → Download conversion on synthetic rows, the migrations and
 * the browser senders. Everything runs in a throw-away directory: no file
 * under the repository's data/ is touched. Fixtures are synthetic.
 */
import { test, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import jwt from 'jsonwebtoken'
import Database from 'better-sqlite3'
import { ANALYTICS_MIGRATIONS } from '../scripts/db/analytics/index.mjs'
import { runMigrations } from '../scripts/db/migrate.mjs'

for (const k of [
  'R2_ENDPOINT',
  'R2_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'NEXT_PHASE',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'FROM_EMAIL',
  'NOTIFY_EMAIL',
  'ADMIN_EMAIL',
  'TRUSTED_PROXY_IPS',
  'TRUST_CLIENT_IP_HEADER',
]) {
  delete process.env[k]
}
process.env.JWT_SECRET = 'admin-ops-analytics-secret-0123456789abcdef'

// Fonts are read from the app root once per process; load them before leaving it.
const repoRoot = process.cwd()
const { loadPdfFonts } = await import('../lib/cvExport/pdf')
loadPdfFonts(repoRoot)
// data/analytics.db and data/content.db are resolved from process.cwd() when first opened.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-ops-analytics-'))
process.chdir(root)
fs.mkdirSync(path.join(root, 'data'), { recursive: true })

const shared = await import('../lib/analytics/eventsShared')
const events = await import('../lib/analytics/events')
const goalsQuery = await import('../lib/analytics/goalsQuery')
const goalsFormat = await import('../lib/analytics/goalsFormat')
const readThrough = await import('../lib/analytics/readThrough')
const ingestMod = await import('../lib/analytics/ingest')
const limits = await import('../lib/analytics/limits')
const published = await import('../lib/analytics/published')
const { utcDay, dayMinus } = await import('../lib/analytics/shared')
const { getAnalyticsDb, closeAnalyticsDb } = await import('../lib/analytics/db')

published.setPublishedSlugSource(() => ({ blog: ['hello-world'], work: ['case-study'] }))

after(async () => {
  events.resetEventsState()
  ingestMod.flushNow()
  closeAnalyticsDb()
  const { closeDb } = await import('../lib/db')
  closeDb()
  published.setPublishedSlugSource(null)
  process.chdir(repoRoot)
  fs.rmSync(root, { recursive: true, force: true })
})

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
const HOST = 'lucian-dev.com'
const TODAY = utcDay(Date.now())
const NOW = Date.parse(`${TODAY}T12:00:00Z`)

/** A fresh client address in its own /24 (so network budgets never mix between tests). */
let ipSeq = 1
const nextIp = () => {
  const n = ipSeq++
  return `203.${Math.floor(n / 250) % 250}.${n % 250}.7`
}

type ReqOpts = { ip?: string; method?: string; headers?: Record<string, string | undefined>; cookies?: Record<string, string>; url?: string }

function makeReq(body: unknown, opts: ReqOpts = {}) {
  const h: Record<string, string> = {
    host: HOST,
    'user-agent': CHROME,
    'cf-connecting-ip': opts.ip ?? nextIp(),
    'sec-fetch-site': 'same-origin',
    origin: `https://${HOST}`,
  }
  for (const [k, v] of Object.entries(opts.headers || {})) {
    if (v === undefined) delete h[k]
    else h[k] = v
  }
  return {
    method: opts.method ?? 'POST',
    url: opts.url ?? '/api/g',
    query: {},
    headers: h,
    cookies: opts.cookies ?? {},
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    socket: { remoteAddress: '127.0.0.1' },
  } as any
}

/** A GET as a browser following a link from another site (Sec-Fetch-Site: cross-site, no Origin). */
const getReq = (ip: string, headers: Record<string, string | undefined> = {}, method = 'GET') =>
  makeReq(undefined, { ip, method, headers: { 'sec-fetch-site': 'cross-site', origin: undefined, ...headers } })

type MockRes = { statusCode: number; headers: Record<string, string>; body: any }

function mockRes() {
  const out: MockRes = { statusCode: 200, headers: {}, body: undefined }
  const res: any = {
    get statusCode() {
      return out.statusCode
    },
    set statusCode(c: number) {
      out.statusCode = c
    },
    headersSent: false,
    writableEnded: false,
    status(c: number) {
      out.statusCode = c
      return res
    },
    setHeader(k: string, v: unknown) {
      out.headers[k.toLowerCase()] = String(v)
      return res
    },
    getHeader: (k: string) => out.headers[k.toLowerCase()],
    removeHeader(k: string) {
      delete out.headers[k.toLowerCase()]
    },
    json(b: unknown) {
      out.body = b
      res.writableEnded = true
      return res
    },
    send(b: unknown) {
      out.body = b
      res.writableEnded = true
      return res
    },
    end(b?: unknown) {
      out.body = b
      res.writableEnded = true
      return res
    },
  }
  return { res, out }
}

const db = () => getAnalyticsDb()

/** Empty every table the goal events use and forget the in-memory state. */
function reset() {
  events.resetEventsState()
  db().exec(`DELETE FROM events; DELETE FROM events_daily; DELETE FROM event_props_daily; DELETE FROM hits;
             DELETE FROM meta WHERE key IN ('events_rolled_through', 'rolled_through')`)
}

function storedEvents(): Array<{ name: string; prop: string; visitor: string; day: string }> {
  events.flushEvents(NOW)
  return db().prepare('SELECT name, prop, visitor, day FROM events ORDER BY ts, rowid').all() as any
}

// ── 1. Allow-list and properties ───────────────────────────────────────────

test('the allow-list: eight names; CV downloads, vCard saves and contact messages can never come from the browser', () => {
  assert.deepEqual(
    [...shared.GOAL_NAMES],
    ['cv_download', 'cv_print', 'vcard_save', 'email_click', 'outbound_click', 'contact_sent', 'read_through', 'search_empty'],
  )
  const all = new Set([...shared.CLIENT_GOALS, ...shared.SERVER_GOALS])
  assert.equal(all.size, shared.GOAL_NAMES.length, 'every name is either a browser or a server event, never both')
  const p = (body: unknown) => events.parseGoalBeacon(typeof body === 'string' ? body : JSON.stringify(body), HOST)
  for (const n of shared.SERVER_GOALS) assert.equal(p({ n, p: '/cv' }), null, `${n} is server-only`)
  assert.equal(p({ n: 'pageview', p: '/' }), null)
  assert.equal(p({ n: 'email_click' }), null, 'a page is required')
  assert.equal(p([{ n: 'email_click', p: '/' }]), null, 'one event per beacon')
  assert.equal(p('{not json'), null)
  assert.equal(p(JSON.stringify({ n: 'email_click', p: '/', pad: 'x'.repeat(1100) })), null, 'bodies over 1 KB are refused')
})

test('properties: one bounded value per event, derived or validated on the server', () => {
  const p = (body: Record<string, unknown>) => events.parseGoalBeacon(JSON.stringify(body), HOST)
  // email_click: the page path only — the address is never sent, and anything sent as v is ignored.
  assert.deepEqual(p({ n: 'email_click', p: '/contact?utm=x#top', v: 'someone@example.com' }), { name: 'email_click', path: '/contact', prop: '/contact' })
  assert.equal(p({ n: 'email_click', p: '/admin/dashboard' }), null)
  assert.equal(p({ n: 'email_click', p: '/not-a-page' }), null)
  // read_through: posts and case studies only.
  assert.deepEqual(p({ n: 'read_through', p: '/blog/hello-world/' }), { name: 'read_through', path: '/blog/hello-world', prop: '/blog/hello-world' })
  assert.equal(p({ n: 'read_through', p: '/blog' }), null)
  assert.equal(p({ n: 'read_through', p: '/about' }), null)
  // cv_print: the language from the CV page.
  assert.equal(p({ n: 'cv_print', p: '/cv' })?.prop, 'en')
  assert.equal(p({ n: 'cv_print', p: '/cv/zh' })?.prop, 'zh')
  assert.equal(p({ n: 'cv_print', p: '/cv?lang=zh' })?.prop, 'zh')
  assert.equal(p({ n: 'cv_print', p: '/' }), null)
  // outbound_click: the destination host only.
  assert.equal(p({ n: 'outbound_click', p: '/', v: 'WWW.LinkedIn.com' })?.prop, 'linkedin.com')
  assert.equal(p({ n: 'outbound_click', p: '/', v: 'github.com.' })?.prop, 'github.com')
  for (const v of ['https://evil.example/x?y=1', 'evil.example/path', '127.0.0.1', 'localhost', HOST, `www.${HOST}`, 42, '']) {
    assert.equal(p({ n: 'outbound_click', p: '/', v }), null, `outbound ${String(v)} refused`)
  }
  // search_empty: also from a public page that is not measured (the 404 page's search field), never /admin.
  assert.deepEqual(p({ n: 'search_empty', p: '/no/such/page', v: 'Kubernetes' }), { name: 'search_empty', path: null, prop: 'kubernetes' })
  assert.deepEqual(p({ n: 'search_empty', p: '/blog/missing-post', v: 'Kubernetes' }), { name: 'search_empty', path: null, prop: 'kubernetes' })
  assert.equal(p({ n: 'search_empty', p: '/admin/dashboard', v: 'kubernetes' }), null)
  assert.equal(p({ n: 'search_empty', p: '//evil.example/x', v: 'kubernetes' }), null)
  assert.equal(p({ n: 'search_empty', p: '/', v: 'mail me at someone@example.com' }), null)
  // Server-side props.
  assert.equal(shared.cvFileProp('en', 'pdf'), 'en-pdf')
  assert.equal(shared.cvFileProp('zh', 'json'), 'zh-json')
  assert.equal(shared.cvFileProp('fr', 'pdf'), null)
  assert.equal(shared.contactProp('role'), 'role')
  assert.equal(shared.contactProp('evil'), '')
  assert.equal(shared.contactProp(undefined), '')
})

test('search_empty: normalised, at most 40 characters, dropped with an "@" or six or more digits', () => {
  const n = shared.normalizeSearchQuery
  assert.equal(n('  Kubernetes   Operator '), 'kubernetes operator')
  assert.equal(n('ＫＵＢＥＲＮＥＴＥＳ'), 'kubernetes', 'NFKC: full-width letters')
  assert.equal(n('rust\u0000lang'), 'rust lang', 'control characters become spaces')
  assert.equal(n('​go lang​'), 'go lang', 'format characters are removed')
  assert.equal(n('２０２６ React'), '2026 react', 'full-width digits are plain digits (4 < 6)')
  assert.equal(n('react 12345'), 'react 12345', 'five digits are kept')
  // "@" in any form.
  for (const q of ['someone@example.com', 'someone＠example.com', 'someone﹫example.com', '@handle']) assert.equal(n(q), null, q)
  // Six digits or more, counted over the whole text, in any script.
  for (const q of ['123456', 'call 12 34 56', 'id 1-2-3-4-5-6', 'order ١٢٣٤٥٦', '１２３４５６']) assert.equal(n(q), null, q)
  // 40 characters (code points), checked after the identifier rules.
  assert.equal(n('a'.repeat(50)), 'a'.repeat(40))
  assert.equal(n('简'.repeat(45)), '简'.repeat(40))
  assert.equal(Array.from(n('😀'.repeat(41)) as string).length, 40, 'never cuts a surrogate pair')
  assert.equal(n(`${'a'.repeat(39)} tail`), 'a'.repeat(39), 'trimmed after the cut')
  assert.equal(n(`${'x'.repeat(45)} someone@example.com`), null, 'an address past the cut still drops the search')
  assert.equal(n(`${'x'.repeat(45)} 123456`), null, 'digits past the cut still count')
  // Too short or not text.
  for (const q of ['', '   ', 'a', 'Ｇ', 7, null, undefined, 'x'.repeat(3000)]) assert.equal(n(q), null, String(q).slice(0, 10))
})

// ── 2. Exclusions and budgets ──────────────────────────────────────────────

test('browser events: Do Not Track, GPC, bots, the signed-in admin and cross-site posts are dropped; nothing is stored', () => {
  reset()
  const ev = { n: 'email_click', p: '/contact' }
  const drop = (opts: ReqOpts) => events.ingestGoal(makeReq(ev, opts), NOW).dropped
  assert.equal(drop({ headers: { dnt: '1' } }), 'dnt')
  assert.equal(drop({ headers: { 'sec-gpc': '1' } }), 'gpc')
  assert.equal(drop({ headers: { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' } }), 'bot')
  assert.equal(drop({ headers: { 'user-agent': 'Mozilla/5.0 HeadlessChrome/129.0' } }), 'bot')
  assert.equal(drop({ headers: { 'user-agent': '' } }), 'bot')
  assert.equal(drop({ cookies: { cv_admin_token: 'jwt' } }), 'admin')
  assert.equal(drop({ headers: { cookie: 'theme=dark; cv_admin_hint=1' } }), 'admin')
  assert.equal(drop({ headers: { 'sec-fetch-site': 'cross-site' } }), 'cross-site')
  assert.equal(drop({ headers: { origin: 'https://evil.example' } }), 'cross-site')
  assert.equal(events.ingestGoal(makeReq({ n: 'read_through', p: '/blog/draft-post' }), NOW).dropped, 'unpublished')
  assert.equal(events.ingestGoal(makeReq({ n: 'search_empty', p: '/blog/draft-post', v: 'kubernetes' }, { headers: { dnt: '1' } }), NOW).dropped, 'dnt')
  assert.equal(events.ingestGoal(makeReq({ n: 'nope', p: '/' }), NOW).dropped, 'invalid')
  assert.deepEqual(storedEvents(), [])
})

test('server-side goals skip the cross-site rule (a link from another site is a real download) but keep the other exclusions', () => {
  reset()
  const ip = nextIp()
  assert.deepEqual(events.recordServerGoal(getReq(ip, { referer: 'https://www.linkedin.com/' }), 'cv_download', 'en-pdf', NOW), {
    recorded: true,
    dropped: null,
  })
  const drop = (headers: Record<string, string | undefined>, method = 'GET', cookies: Record<string, string> = {}) =>
    events.recordServerGoal({ ...getReq(nextIp(), headers, method), cookies }, 'cv_download', 'en-pdf', NOW).dropped
  assert.equal(drop({}, 'HEAD'), 'head')
  assert.equal(drop({ 'sec-purpose': 'prefetch;prerender' }), 'prefetch')
  assert.equal(drop({ purpose: 'prefetch' }), 'prefetch')
  assert.equal(drop({ 'x-moz': 'prefetch' }), 'prefetch')
  assert.equal(drop({ dnt: '1' }), 'dnt')
  assert.equal(drop({ 'sec-gpc': '1' }), 'gpc')
  assert.equal(drop({ 'user-agent': 'curl/8.7.1' }), 'bot')
  assert.equal(drop({}, 'GET', { cv_admin_token: 'jwt' }), 'admin')
  assert.equal(events.recordServerGoal(getReq(nextIp()), 'cv_download', 'fr-pdf', NOW).dropped, 'invalid')
  assert.equal(events.recordServerGoal(getReq(nextIp()), 'vcard_save', 'anything', NOW).dropped, 'invalid')

  const rows = storedEvents()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'cv_download')
  assert.equal(rows[0].prop, 'en-pdf')
  assert.match(rows[0].visitor, /^[0-9a-f]{16}$/)
  // The table holds nothing else: no address, user agent, URL or referrer.
  const columns = (db().prepare('PRAGMA table_info(events)').all() as Array<{ name: string }>).map((c) => c.name)
  assert.deepEqual(columns, ['ts', 'day', 'name', 'prop', 'visitor'])
})

test('a search from the 404 page of a missing post is still recorded — its page is never stored', () => {
  reset()
  assert.deepEqual(events.ingestGoal(makeReq({ n: 'search_empty', p: '/blog/missing-post', v: '  Rust   Embedded ' }), NOW), { recorded: true, dropped: null })
  assert.deepEqual(
    storedEvents().map((r) => [r.name, r.prop]),
    [['search_empty', 'rust embedded']],
  )
})

test('one visitor hash per day for page views and events; a repeat within 30 s is counted once', () => {
  reset()
  const ip = nextIp()
  const t = NOW + 60_000
  assert.equal(events.ingestGoal(makeReq({ n: 'cv_print', p: '/cv' }, { ip }), t).recorded, true)
  assert.equal(events.ingestGoal(makeReq({ n: 'cv_print', p: '/cv' }, { ip }), t + 5_000).dropped, 'duplicate')
  assert.equal(events.ingestGoal(makeReq({ n: 'cv_print', p: '/cv/zh' }, { ip }), t + 6_000).recorded, true, 'another property is another event')
  assert.equal(events.ingestGoal(makeReq({ n: 'cv_print', p: '/cv' }, { ip }), t + events.DEDUPE_MS + 1).recorded, true)
  assert.equal(ingestMod.ingest(makeReq({ t: 'pv', p: '/cv', r: '', l: 'en' }, { ip, url: '/api/a' }), t).accepted, 1)
  ingestMod.flushNow(t)
  const rows = storedEvents()
  assert.deepEqual(
    rows.map((r) => r.prop),
    ['en', 'zh', 'en'],
  )
  const hit = db().prepare('SELECT visitor FROM hits WHERE path = ?').get('/cv') as { visitor: string }
  assert.equal(new Set([...rows.map((r) => r.visitor), hit.visitor]).size, 1, 'the same daily hash links a page view and its events')
})

test('budgets: per-minute counters shared with page views, a daily share per client, a daily cap', () => {
  reset()
  // Per minute: CLIENT_EVENTS_PER_MIN events, then refused until the next window.
  const ip = nextIp()
  const minute = NOW + 3_600_000
  for (let i = 0; i < limits.CLIENT_EVENTS_PER_MIN; i++) {
    const r = events.ingestGoal(makeReq({ n: 'outbound_click', p: '/', v: `site${i}.example.com` }, { ip }), minute)
    assert.equal(r.recorded, true, `event ${i}`)
  }
  assert.equal(events.ingestGoal(makeReq({ n: 'outbound_click', p: '/', v: 'more.example.com' }, { ip }), minute).dropped, 'rate-limit')
  assert.equal(events.recordServerGoal(getReq(ip), 'cv_download', 'en-pdf', minute).dropped, 'rate-limit', 'server-side events share the counter')

  // Daily share: CLIENT_DAILY_SHARE rows per client per day.
  reset()
  const heavy = nextIp()
  let recorded = 0
  let dropped: string | null = null
  const start = NOW - 6 * 3_600_000
  for (let m = 0; !dropped && m < 100; m++) {
    for (let i = 0; i < limits.CLIENT_EVENTS_PER_MIN; i++) {
      const r = events.ingestGoal(makeReq({ n: 'outbound_click', p: '/', v: `s${m}-${i}.example.com` }, { ip: heavy }), start + m * 61_000)
      if (r.recorded) recorded++
      else {
        dropped = r.dropped
        break
      }
    }
  }
  assert.equal(dropped, 'share')
  assert.equal(recorded, limits.CLIENT_DAILY_SHARE)
  assert.equal(events.ingestGoal(makeReq({ n: 'outbound_click', p: '/', v: 'other.example.com' }), start + 200 * 61_000).recorded, true, 'other clients are unaffected')

  // The daily cap over all clients.
  reset()
  const insert = db().prepare("INSERT INTO events (ts, day, name, prop, visitor) VALUES (?, ?, 'email_click', '/', 'ffffffffffffffff')")
  db().transaction(() => {
    for (let i = 0; i < events.EVENTS_DAILY_CAP - 1; i++) insert.run(NOW, TODAY)
  })()
  assert.equal(events.ingestGoal(makeReq({ n: 'email_click', p: '/contact' }), NOW).recorded, true)
  assert.equal(events.ingestGoal(makeReq({ n: 'email_click', p: '/about' }), NOW).dropped, 'cap')
  reset()
})

test('POST /api/g answers 204 for anything and records a valid event; other methods get 405', async () => {
  reset()
  const { default: handler } = await import('../pages/api/g')
  const call = async (req: any) => {
    const { res, out } = mockRes()
    await handler(req, res)
    return out
  }
  assert.equal((await call(makeReq({ n: 'email_click', p: '/contact' }))).statusCode, 204)
  assert.equal((await call(makeReq('garbage'))).statusCode, 204)
  assert.equal((await call(makeReq({ n: 'email_click', p: '/' }, { headers: { dnt: '1' } }))).statusCode, 204)
  const get = await call(makeReq(undefined, { method: 'GET' }))
  assert.equal(get.statusCode, 405)
  assert.equal(get.headers.allow, 'POST')
  events.flushEvents()
  const rows = db().prepare('SELECT name, prop FROM events').all()
  assert.deepEqual(rows, [{ name: 'email_click', prop: '/contact' }])
})

// ── 3. Server-side recording through the real handlers ────────────────────

const cvDoc = {
  en: [
    { sessionName: 'personalInformation', firstName: 'Example', lastName: 'Person', email: 'person@example.com' },
    { sessionName: 'project', headerName: 'PROJECTS', projectExperience: [{ title: 'Example Tool', description: 'A synthetic project.', startDate: '2024-01', endDate: '2024-06' }] },
  ],
  zh: [
    { sessionName: 'personalInformation', firstName: '示例', lastName: '人' },
    { sessionName: 'project', headerName: '项目', projectExperience: [{ title: '示例工具', description: '合成的项目。' }] },
  ],
}

test('CV downloads are counted by the export route: GET 200 and 304, never HEAD; the files still revalidate at the origin', async () => {
  reset()
  const { writeCvData } = await import('../lib/cvdata')
  assert.equal((await writeCvData(cvDoc as any)).ok, true)
  const { default: handler } = await import('../pages/api/cv/export')
  const call = async (query: Record<string, string>, req: any) => {
    const { res, out } = mockRes()
    await handler({ ...req, query, url: '/api/cv/export' }, res)
    return out
  }
  const txt = await call({ lang: 'en', format: 'txt' }, getReq(nextIp()))
  assert.equal(txt.statusCode, 200)
  assert.equal(txt.headers['cache-control'], 'public, max-age=0, must-revalidate', 'every open reaches the origin')
  assert.match(txt.headers.etag, /^"[A-Za-z0-9_-]{32}"$/)
  const revalidated = await call({ lang: 'en', format: 'txt' }, getReq(nextIp(), { 'if-none-match': txt.headers.etag }))
  assert.equal(revalidated.statusCode, 304)
  const head = await call({ lang: 'en', format: 'pdf' }, getReq(nextIp(), {}, 'HEAD'))
  assert.equal(head.statusCode, 200)
  const pdf = await call({ lang: 'en', format: 'pdf' }, getReq(nextIp(), { referer: 'https://www.linkedin.com/' }))
  assert.equal(pdf.statusCode, 200)
  assert.equal(pdf.headers['content-type'], 'application/pdf')
  const json = await call({ lang: 'zh', format: 'json' }, makeReq(undefined, { method: 'GET' }))
  assert.equal(json.statusCode, 200)
  const bot = await call({ lang: 'en', format: 'pdf' }, getReq(nextIp(), { 'user-agent': 'python-requests/2.32' }))
  assert.equal(bot.statusCode, 200, 'a bot still gets the file — it is just not counted')

  events.flushEvents()
  const rows = db().prepare('SELECT name, prop FROM events ORDER BY ts, rowid').all()
  assert.deepEqual(rows, [
    { name: 'cv_download', prop: 'en-txt' },
    { name: 'cv_download', prop: 'en-txt' },
    { name: 'cv_download', prop: 'en-pdf' },
    { name: 'cv_download', prop: 'zh-json' },
  ])
})

test('vCard saves are counted on GET, not HEAD; the card is revalidated at the origin', async () => {
  reset()
  const { default: handler } = await import('../pages/api/vcard')
  const call = async (req: any) => {
    const { res, out } = mockRes()
    await handler({ ...req, url: '/api/vcard' }, res)
    return out
  }
  const card = await call(getReq(nextIp()))
  assert.equal(card.statusCode, 200)
  assert.equal(card.headers['cache-control'], 'public, no-cache')
  assert.match(String(card.body), /^BEGIN:VCARD/)
  await call(getReq(nextIp(), {}, 'HEAD'))
  await call(getReq(nextIp(), { dnt: '1' }))
  events.flushEvents()
  assert.deepEqual(db().prepare('SELECT name, prop FROM events').all(), [{ name: 'vcard_save', prop: '' }])
})

test('an accepted contact message counts contact_sent with its intent only; refused ones count nothing', async () => {
  reset()
  const { default: handler } = await import('../pages/api/contact')
  const nonce = () =>
    jwt.sign({ t: 'contact-nonce', iat: Math.floor(Date.now() / 1000) - 10, jti: Math.random().toString(36).slice(2) }, process.env.JWT_SECRET as string, {
      expiresIn: '30m',
      audience: 'contact-form',
      algorithm: 'HS256',
    })
  const send = async (body: Record<string, unknown>) => {
    const { res, out } = mockRes()
    // Next parses the JSON body of the form's request into an object.
    await handler({ ...makeReq(undefined, { url: '/api/contact' }), body }, res)
    return out
  }
  const base = { name: 'Example Person', email: 'person@example.com', subject: 'A role', message: 'Hello there', mathAnswer: 7, hp: '' }
  const ok = await send({ ...base, nonce: nonce(), reason: 'Hiring', intent: 'role', company: 'Example Co' })
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body))
  const plain = await send({ ...base, nonce: nonce() })
  assert.equal(plain.statusCode, 200)
  assert.equal((await send({ ...base, nonce: nonce(), hp: 'bot-filled' })).statusCode, 200, 'the honeypot answers 200 …')
  assert.equal((await send({ ...base, nonce: nonce(), message: '' })).statusCode, 400)
  events.flushEvents()
  const rows = db().prepare('SELECT * FROM events ORDER BY ts, rowid').all() as Array<Record<string, unknown>>
  assert.deepEqual(
    rows.map((r) => [r.name, r.prop]),
    [
      ['contact_sent', 'role'],
      ['contact_sent', ''],
    ],
    '… but only accepted messages are counted',
  )
  const dump = JSON.stringify(rows)
  for (const secret of ['Example Person', 'person@example.com', 'Hello there', 'Example Co', 'A role']) assert.ok(!dump.includes(secret), `${secret} is not stored`)
})

// ── 4. Rollup, retention and the report ───────────────────────────────────

const insertEvent = (day: string, name: string, prop: string, visitor: string, at = '12:00:00') =>
  db().prepare('INSERT INTO events (ts, day, name, prop, visitor) VALUES (?, ?, ?, ?, ?)').run(Date.parse(`${day}T${at}Z`), day, name, prop, visitor)
const insertHit = (day: string, at: string, path: string, visitor: string, ref: string | null = null) =>
  db()
    .prepare("INSERT INTO hits (ts, day, path, ref_host, country, device, browser, visitor, lang) VALUES (?, ?, ?, ?, NULL, 'desktop', 'Chrome', ?, 'en')")
    .run(Date.parse(`${day}T${at}Z`), day, path, ref, visitor)

test('rollup: per goal and per property visitor-days; raw kept 35 days, totals 400, search_empty 35 (raw and totals)', () => {
  reset()
  const d1 = dayMinus(TODAY, 1)
  insertEvent(d1, 'cv_download', 'en-pdf', 'v1')
  insertEvent(d1, 'cv_download', 'en-pdf', 'v1', '13:00:00')
  insertEvent(d1, 'cv_download', 'zh-pdf', 'v1')
  insertEvent(d1, 'cv_download', 'en-pdf', 'v2')
  insertEvent(dayMinus(TODAY, 2), 'search_empty', 'kubernetes', 'v3')
  insertEvent(dayMinus(TODAY, 36), 'cv_download', 'en-txt', 'v4')
  insertEvent(dayMinus(TODAY, 36), 'search_empty', 'old search', 'v4')
  insertEvent(TODAY, 'vcard_save', '', 'v5')
  const putDaily = (day: string, name: string, prop: string) => {
    db().prepare('INSERT INTO events_daily (day, name, events, visitors) VALUES (?, ?, 1, 1)').run(day, name)
    db().prepare('INSERT INTO event_props_daily (day, name, prop, events, visitors) VALUES (?, ?, ?, 1, 1)').run(day, name, prop)
  }
  putDaily(dayMinus(TODAY, 100), 'cv_download', 'en-pdf')
  putDaily(dayMinus(TODAY, 100), 'search_empty', 'older search')
  putDaily(dayMinus(TODAY, 401), 'cv_download', 'en-pdf')

  events.rollupEvents(TODAY)
  const daily = (day: string, name: string) => db().prepare('SELECT events, visitors FROM events_daily WHERE day = ? AND name = ?').get(day, name)
  assert.deepEqual(daily(d1, 'cv_download'), { events: 4, visitors: 2 }, 'a visitor with two files is one visitor-day for the goal')
  const props = db().prepare('SELECT prop, events, visitors FROM event_props_daily WHERE day = ? ORDER BY prop').all(d1)
  assert.deepEqual(props, [
    { prop: 'en-pdf', events: 3, visitors: 2 },
    { prop: 'zh-pdf', events: 1, visitors: 1 },
  ])
  assert.deepEqual(daily(dayMinus(TODAY, 36), 'cv_download'), { events: 1, visitors: 1 }, 'rolled up before the raw rows were pruned')
  assert.equal(daily(TODAY, 'vcard_save'), undefined, 'today is not over yet')

  const rawDays = (db().prepare('SELECT DISTINCT day FROM events ORDER BY day').all() as Array<{ day: string }>).map((r) => r.day)
  assert.deepEqual(rawDays, [dayMinus(TODAY, 2), d1, TODAY], 'raw events older than 35 days are gone')
  const kept = db().prepare('SELECT day, name FROM events_daily ORDER BY day, name').all() as Array<{ day: string; name: string }>
  assert.ok(kept.some((r) => r.day === dayMinus(TODAY, 100) && r.name === 'cv_download'), 'goal totals stay for 400 days')
  assert.ok(!kept.some((r) => r.day === dayMinus(TODAY, 401)), 'and no longer')
  assert.ok(!kept.some((r) => r.name === 'search_empty' && r.day < dayMinus(TODAY, 35)), 'search totals: 35 days only')
  const searchProps = (db().prepare("SELECT prop FROM event_props_daily WHERE name = 'search_empty' ORDER BY prop").all() as Array<{ prop: string }>).map((r) => r.prop)
  assert.deepEqual(searchProps, ['kubernetes'], 'old search texts are gone from the totals too')
  assert.equal((db().prepare("SELECT value FROM meta WHERE key = 'events_rolled_through'").get() as { value: string }).value, d1)

  // Idempotent.
  events.rollupEvents(TODAY)
  assert.deepEqual(daily(d1, 'cv_download'), { events: 4, visitors: 2 })
})

test('goals report: visitor-days, conversion rate vs the site, deltas only once tracking covers the previous period', () => {
  reset()
  const cur = dayMinus(TODAY, 1)
  const prev = dayMinus(TODAY, 8)
  for (const v of ['a', 'b', 'c', 'd']) insertHit(cur, '10:00:00', '/', v)
  insertHit(prev, '10:00:00', '/', 'e')
  insertHit(prev, '10:00:00', '/', 'f')
  insertEvent(cur, 'cv_download', 'en-pdf', 'a')
  insertEvent(cur, 'cv_download', 'zh-pdf', 'a')
  insertEvent(cur, 'cv_download', 'en-pdf', 'b')
  insertEvent(prev, 'cv_download', 'en-pdf', 'e')
  insertEvent(cur, 'search_empty', 'kubernetes', 'c')
  db().prepare("INSERT INTO meta (key, value) VALUES ('events_since', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(dayMinus(TODAY, 3))

  const r = goalsQuery.getGoalsReport('7d', null, NOW)
  assert.equal(r.siteVisitors, 4)
  assert.deepEqual(
    r.goals.map((g) => g.name),
    ['cv_download', 'cv_print', 'vcard_save', 'contact_sent', 'email_click', 'outbound_click', 'read_through'],
    'search_empty has its own section',
  )
  const dl = r.goals[0]
  assert.equal(dl.events, 3)
  assert.equal(dl.visitors.value, 2)
  assert.equal(dl.rate, 0.5)
  assert.deepEqual(dl.props, [
    { key: 'en-pdf', events: 2, visitors: 2 },
    { key: 'zh-pdf', events: 1, visitors: 1 },
  ])
  assert.equal(r.comparable, false, 'tracking began inside the period')
  assert.equal(dl.visitors.delta, null)
  assert.equal(r.goals[1].rate, 0)

  db().prepare("UPDATE meta SET value = ? WHERE key = 'events_since'").run(dayMinus(TODAY, 30))
  const again = goalsQuery.getGoalsReport('7d', null, NOW)
  assert.equal(again.comparable, true)
  assert.equal(again.goals[0].visitors.previous, 1)
  assert.equal(again.goals[0].visitors.delta, 1, '2 visitor-days vs 1: +100 %')
})

test('conversion: Source → CV → Download per visitor-day, in order, on the raw rows of the last 35 days', () => {
  reset()
  const d = dayMinus(TODAY, 1)
  const d2 = dayMinus(TODAY, 2)
  // v1: LinkedIn → home → CV → download.
  insertHit(d, '10:00:00', '/', 'v1', 'linkedin.com')
  insertHit(d, '10:01:00', '/cv', 'v1')
  insertEvent(d, 'cv_download', 'en-pdf', 'v1', '10:02:00')
  // v2: LinkedIn → Chinese CV, no download.
  insertHit(d, '11:00:00', '/', 'v2', 'linkedin.com')
  insertHit(d, '11:05:00', '/cv/zh', 'v2')
  // v3: Google → CV → download.
  insertHit(d, '12:00:00', '/', 'v3', 'google.com')
  insertHit(d, '12:01:00', '/cv', 'v3')
  insertEvent(d, 'cv_download', 'en-pdf', 'v3', '12:02:00')
  // v4: the download came BEFORE the CV view: not a step-3 conversion.
  insertEvent(d, 'cv_download', 'en-pdf', 'v4', '09:00:00')
  insertHit(d, '09:10:00', '/cv', 'v4')
  // v5: only a direct download (a link to /cv.pdf elsewhere), no page view that day.
  insertEvent(d, 'cv_download', 'en-pdf', 'v5', '08:00:00')
  // The same hash string on another day is another visitor-day.
  insertHit(d2, '10:00:00', '/cv', 'v1', 'linkedin.com')
  // Outside the raw window of a 12-month view.
  insertHit(dayMinus(TODAY, 40), '10:00:00', '/', 'old', 'linkedin.com')

  const steps = (source: string | null, range: '7d' | '12m' = '7d') => goalsQuery.getGoalsReport(range, source, NOW).funnel
  const linkedin = steps('linkedin.com')
  assert.deepEqual(
    linkedin.steps.map((s) => s.visitors),
    [3, 3, 1],
  )
  assert.equal(linkedin.steps[0].label, 'Arrived from linkedin.com')
  assert.equal(linkedin.source, 'linkedin.com')
  const all = steps(null)
  assert.deepEqual(
    all.steps.map((s) => s.visitors),
    [5, 5, 2],
  )
  assert.equal(all.directDownloads, 1)
  assert.deepEqual(all.sources, [
    { key: 'linkedin.com', visitors: 3 },
    { key: 'google.com', visitors: 1 },
  ])
  assert.equal(steps('Not A Host!').source, null, 'an unknown source means every visitor')
  const year = steps('linkedin.com', '12m')
  assert.equal(year.days, goalsQuery.FUNNEL_MAX_DAYS)
  assert.equal(year.from, dayMinus(TODAY, goalsQuery.FUNNEL_MAX_DAYS - 1))
  assert.deepEqual(
    year.steps.map((s) => s.visitors),
    [3, 3, 1],
    'rows older than the raw window are never part of the conversion',
  )
})

test('searches with no results: per text — visitor-days, events, last seen — never older than 35 days', () => {
  reset()
  const d1 = dayMinus(TODAY, 1)
  insertEvent(d1, 'search_empty', 'kubernetes', 'v1')
  insertEvent(d1, 'search_empty', 'kubernetes', 'v2')
  insertEvent(dayMinus(TODAY, 2), 'search_empty', 'kubernetes', 'v1')
  insertEvent(dayMinus(TODAY, 3), 'search_empty', 'rust', 'v3')
  insertEvent(TODAY, 'search_empty', 'rust', 'v3')
  const r = goalsQuery.getGoalsReport('30d', null, NOW)
  assert.deepEqual(r.searches.rows, [
    { query: 'kubernetes', visitors: 3, events: 3, lastSeen: d1 },
    { query: 'rust', visitors: 2, events: 2, lastSeen: TODAY },
  ])
  assert.equal(r.searches.days, 30)
  const year = goalsQuery.getGoalsReport('12m', null, NOW)
  assert.equal(year.searches.days, events.SEARCH_EVENTS_DAYS)
  assert.equal(year.searches.from, dayMinus(TODAY, events.SEARCH_EVENTS_DAYS - 1))
})

test('the admin goals endpoint: admin only, never cached', async () => {
  const { default: handler } = await import('../pages/api/admin/goals')
  const { res, out } = mockRes()
  await handler({ method: 'GET', query: { range: '7d' }, headers: {}, cookies: {}, socket: { remoteAddress: '127.0.0.1' }, url: '/api/admin/goals' } as any, res)
  assert.equal(out.statusCode, 401)
  assert.equal(out.headers['cache-control'], 'no-store')
})

// ── 5. Migrations ──────────────────────────────────────────────────────────

test('analytics migrations: versions 1…6 (5 = vitals attribution, 6 = events); a fresh store gets the events tables', () => {
  assert.deepEqual(
    ANALYTICS_MIGRATIONS.map((m) => [m.version, m.name]),
    [
      [1, 'baseline'],
      [2, 'vitals-key'],
      [3, 'errors'],
      [4, 'restore-drills'],
      [5, 'vitals-attribution'],
      [6, 'events'],
    ],
  )
  const mem = new Database(':memory:')
  try {
    const report = runMigrations(mem, ANALYTICS_MIGRATIONS, { label: 'analytics' })
    assert.equal(report.to, 6)
    const cols = (t: string) => (mem.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map((c) => c.name)
    assert.deepEqual(cols('events'), ['ts', 'day', 'name', 'prop', 'visitor'])
    assert.deepEqual(cols('events_daily'), ['day', 'name', 'events', 'visitors'])
    assert.deepEqual(cols('event_props_daily'), ['day', 'name', 'prop', 'events', 'visitors'])
    assert.ok(cols('vitals').includes('attr'), 'version 5 adds vitals.attr')
    const since = (mem.prepare("SELECT value FROM meta WHERE key = 'events_since'").get() as { value: string }).value
    assert.match(since, /^\d{4}-\d{2}-\d{2}$/)
    // Replaying is a no-op.
    assert.deepEqual(runMigrations(mem, ANALYTICS_MIGRATIONS, { label: 'analytics' }).applied, [])
  } finally {
    mem.close()
  }
})

// ── 6. Display helpers ────────────────────────────────────────────────────

test('display helpers: rates, bars, read-through time, the report shape', () => {
  assert.equal(goalsFormat.formatRate(null), '—')
  assert.equal(goalsFormat.formatRate(0), '0%')
  assert.equal(goalsFormat.formatRate(0.0004), '<0.1%')
  assert.equal(goalsFormat.formatRate(0.042), '4.2%')
  assert.equal(goalsFormat.formatRate(0.5), '50%')
  assert.equal(goalsFormat.shareOf(1, 0), null)
  assert.equal(goalsFormat.barWidth(0, 10), 0)
  assert.equal(goalsFormat.barWidth(1, 1000), 1, 'a small non-zero count stays visible')
  assert.equal(goalsFormat.barWidth(5, 10), 50)
  assert.equal(goalsFormat.isGoalsReport({}), false)
  assert.equal(shared.propLabel('cv_download', 'zh-json'), 'Chinese · JSON Resume')
  assert.equal(shared.propLabel('contact_sent', ''), 'Not given')
  assert.equal(readThrough.minReadMs(0), readThrough.MIN_READ_MS)
  assert.equal(readThrough.minReadMs(1000), 60_000)
  assert.equal(readThrough.minReadMs(10_000), readThrough.MAX_READ_MS)
  assert.equal(readThrough.countWords('Hello world, 你好'), 4)
})

// ── 7. Browser senders (run last: they stub window / navigator / document) ─

test('browser: link clicks and searches send {n, p, v?} only — nothing under DNT, GPC, webdriver or on /admin', async () => {
  const sent: Array<Record<string, unknown>> = []
  const listeners = new Map<string, (e: any) => void>()
  const nav: Record<string, unknown> = {
    sendBeacon: (url: string, body: string) => {
      assert.equal(url, '/api/g')
      sent.push(JSON.parse(body))
      return true
    },
  }
  const g = globalThis as any
  const saved = { window: g.window, location: g.location, document: g.document, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator') }
  g.window = globalThis
  g.location = { pathname: '/contact', host: HOST }
  g.document = {
    addEventListener: (type: string, fn: (e: any) => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  }
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true })
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const beacon = await import('../lib/analytics/goalBeacon')
    const stop = beacon.installGoalClicks()
    const click = (href: string, extra: Record<string, unknown> = {}) =>
      listeners.get(extra.type === 'auxclick' ? 'auxclick' : 'click')!({
        type: 'click',
        button: 0,
        defaultPrevented: false,
        target: { closest: () => ({ href }) },
        ...extra,
      })

    click('mailto:someone@example.com?subject=Hi')
    click('https://www.linkedin.com/in/example-person?trk=abc')
    click(`https://${HOST}/about`)
    click('https://github.com/example', { defaultPrevented: true })
    click('https://github.com/example', { type: 'auxclick', button: 2 })
    click('https://github.com/example', { type: 'auxclick', button: 1 })
    click('javascript:void(0)')
    assert.doesNotThrow(() => click('http://[not-a-host'), 'a malformed link is ignored')
    assert.deepEqual(sent, [
      { n: 'email_click', p: '/contact' },
      { n: 'outbound_click', p: '/contact', v: 'www.linkedin.com' },
      { n: 'outbound_click', p: '/contact', v: 'github.com' },
    ])
    for (const e of sent) assert.ok(!JSON.stringify(e).includes('someone@example.com') && !JSON.stringify(e).includes('trk'), 'no address, path or query')

    sent.length = 0
    nav.doNotTrack = '1'
    click('mailto:someone@example.com')
    delete nav.doNotTrack
    nav.globalPrivacyControl = true
    click('mailto:someone@example.com')
    delete nav.globalPrivacyControl
    nav.webdriver = true
    click('mailto:someone@example.com')
    delete nav.webdriver
    g.location = { pathname: '/admin/dashboard', host: HOST }
    click('mailto:someone@example.com')
    assert.deepEqual(sent, [], 'DNT, GPC, automated browsers and /admin send nothing')
    g.location = { pathname: '/', host: HOST }
    stop()
    assert.equal(listeners.size, 0)

    // search_empty: settled for 1.5 s, sent at once on close, once per text per page view.
    const search = await import('../lib/analytics/searchEmpty')
    search.noteSearchResults('Kubernetes', 0, true)
    mock.timers.tick(search.SETTLE_MS - 1)
    assert.deepEqual(sent, [])
    mock.timers.tick(1)
    assert.deepEqual(sent, [{ n: 'search_empty', p: '/', v: 'kubernetes' }])
    search.noteSearchResults('kubernetes ', 0, true)
    mock.timers.tick(search.SETTLE_MS)
    assert.equal(sent.length, 1, 'the same text is sent once per page view')
    search.noteSearchResults('ru', 0, true)
    search.noteSearchResults('rust', 0, true)
    search.noteSearchResults('rust', 0, false)
    assert.deepEqual(sent[1], { n: 'search_empty', p: '/', v: 'rust' }, 'closing the palette on it sends it at once (the last text only)')
    search.noteSearchResults('python', 0, true)
    search.noteSearchResults('python', 3, true)
    search.noteSearchResults('someone@example.com', 0, true)
    search.noteSearchResults('call 555 123 456', 0, true)
    search.noteSearchResults('', 12, true)
    mock.timers.tick(search.SETTLE_MS * 2)
    search.noteSearchResults('', 12, false)
    assert.equal(sent.length, 2, 'results found, an address, six digits, a cleared field: nothing more')
    g.location = { pathname: '/about', host: HOST }
    search.noteSearchResults('Kubernetes', 0, true)
    mock.timers.tick(search.SETTLE_MS)
    assert.deepEqual(sent[2], { n: 'search_empty', p: '/about', v: 'kubernetes' }, 'a new page view may send it again')
    nav.globalPrivacyControl = true
    search.noteSearchResults('golang', 0, true)
    mock.timers.tick(search.SETTLE_MS)
    assert.equal(sent.length, 3, 'GPC: nothing')
  } finally {
    mock.timers.reset()
    g.window = saved.window
    g.location = saved.location
    g.document = saved.document
    if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator)
    else delete g.navigator
  }
})
