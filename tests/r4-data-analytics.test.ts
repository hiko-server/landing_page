import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// data/analytics.db is resolved from process.cwd() when first opened.
const repoRoot = process.cwd()
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r4-data-analytics-'))
process.chdir(root)

const shared = await import('../lib/analytics/shared')
const ingestMod = await import('../lib/analytics/ingest')
const { getAnalyticsDb, closeAnalyticsDb, analyticsDbPath } = await import('../lib/analytics/db')
const { getAnalyticsReport, p75 } = await import('../lib/analytics/query')
const fmt = await import('../lib/analytics/format')
const published = await import('../lib/analytics/published')

// Article paths are only recorded for published slugs (tests/r5-analytics.test.ts);
// stand in for the content store so no content.db is needed here.
published.setPublishedSlugSource(() => ({ blog: ['x'], work: [] }))

after(() => {
  closeAnalyticsDb()
  published.setPublishedSlugSource(null)
  process.chdir(repoRoot)
  fs.rmSync(root, { recursive: true, force: true })
})

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

let ipCounter = 1
function beacon(body: unknown, headers: Record<string, string> = {}, cookies: Record<string, string> = {}) {
  return {
    method: 'POST',
    url: '/api/a',
    headers: {
      host: 'lucian-dev.com',
      'user-agent': CHROME,
      'cf-connecting-ip': `203.0.113.${ipCounter}`,
      'sec-fetch-site': 'same-origin',
      origin: 'https://lucian-dev.com',
      ...headers,
    },
    cookies,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    socket: { remoteAddress: '127.0.0.1' },
  } as any
}

const pv = (p: string, extra: Record<string, unknown> = {}) => ({ t: 'pv', p, r: '', l: 'en', ...extra })

test('the store is its own file, separate from content.db', () => {
  assert.equal(analyticsDbPath(), path.join(fs.realpathSync(root), 'data', 'analytics.db'))
  getAnalyticsDb()
  assert.ok(fs.existsSync(path.join(root, 'data', 'analytics.db')))
  assert.equal(fs.existsSync(path.join(root, 'data', 'content.db')), false)
})

test('Do Not Track, Global Privacy Control, bots, admins and cross-site posts are dropped', () => {
  assert.equal(ingestMod.ingest(beacon(pv('/'), { dnt: '1' })).dropped, 'dnt')
  assert.equal(ingestMod.ingest(beacon(pv('/'), { 'sec-gpc': '1' })).dropped, 'gpc')
  assert.equal(ingestMod.ingest(beacon(pv('/'), { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' })).dropped, 'bot')
  assert.equal(ingestMod.ingest(beacon(pv('/'), { 'user-agent': 'Mozilla/5.0 HeadlessChrome/129.0' })).dropped, 'bot')
  assert.equal(ingestMod.ingest(beacon(pv('/'), { 'user-agent': '' })).dropped, 'bot')
  assert.equal(ingestMod.ingest(beacon(pv('/'), {}, { cv_admin_token: 'jwt' })).dropped, 'admin')
  assert.equal(ingestMod.ingest(beacon(pv('/'), { cookie: 'theme=dark; cv_admin_hint=1' })).dropped, 'admin')
  assert.equal(ingestMod.ingest(beacon(pv('/'), { 'sec-fetch-site': 'cross-site' })).dropped, 'cross-site')
  assert.equal(ingestMod.ingest(beacon(pv('/'), { origin: 'https://evil.example' })).dropped, 'cross-site')
  ingestMod.flushNow()
  assert.equal((getAnalyticsDb().prepare('SELECT count(*) AS n FROM hits').get() as { n: number }).n, 0)
})

test('paths are normalised: query/hash stripped, /cv?lang→/cv/zh, unknown paths rejected', () => {
  const n = shared.normalizeTrackedPath
  assert.equal(n('/'), '/')
  assert.equal(n('/about/'), '/about')
  assert.equal(n('/blog?ref=x#top'), '/blog')
  assert.equal(n('/blog/hello-world?utm_source=x'), '/blog/hello-world')
  assert.equal(n('/work/case-study/'), '/work/case-study')
  assert.equal(n('/cv?lang=zh'), '/cv/zh')
  assert.equal(n('/cv?lang=cn&print=1'), '/cv/zh')
  assert.equal(n('/cv?print=1'), '/cv')
  assert.equal(n('/cv/zh'), '/cv/zh')
  assert.equal(n('/colophon'), '/colophon')
  for (const bad of ['/admin', '/admin/dashboard', '/api/a', '/blog/a/b', '//evil.com', 'https://x.com/', '/random', '/blog/%E0%A4%A', 42, null]) {
    assert.equal(n(bad), null, String(bad))
  }
  assert.equal(ingestMod.ingest(beacon(pv('/admin'))).dropped, 'invalid')
})

test('vitals validation rejects unknown metrics and out-of-range values', () => {
  const parse = (e: Record<string, unknown>) => ingestMod.parseEvents(JSON.stringify({ t: 'v', route: '/', ...e }))
  assert.equal(parse({ name: 'LCP', value: 1234.4 })[0]?.t, 'v')
  assert.equal((parse({ name: 'LCP', value: 1234.4 })[0] as any).value, 1234)
  assert.equal((parse({ name: 'CLS', value: 0.123456 })[0] as any).value, 0.1235)
  assert.deepEqual(parse({ name: 'FID', value: 10 }), [])
  assert.deepEqual(parse({ name: 'CLS', value: 10.5 }), [])
  assert.deepEqual(parse({ name: 'CLS', value: -0.1 }), [])
  assert.deepEqual(parse({ name: 'INP', value: 60_001 }), [])
  assert.deepEqual(parse({ name: 'TTFB', value: Number.NaN }), [])
  assert.deepEqual(parse({ name: 'LCP', value: '100' }), [])
  assert.deepEqual(parse({ name: 'LCP', value: 100, route: '/admin' }), [])
  assert.equal((parse({ name: 'LCP', value: 100, nav: 'back_forward' })[0] as any).nav, 'back-forward')
  assert.equal(shared.rateVital('LCP', 2500), 'good')
  assert.equal(shared.rateVital('LCP', 2501), 'needs-improvement')
  assert.equal(shared.rateVital('INP', 501), 'poor')
  assert.equal(shared.rateVital('CLS', 0.1), 'good')
  assert.equal(shared.rateVital('CLS', 0.26), 'poor')
  assert.deepEqual(ingestMod.parseEvents('not json'), [])
  assert.equal(ingestMod.parseEvents(JSON.stringify(Array.from({ length: 25 }, () => pv('/')))).length, 10)
})

test('the visitor hash is stable within a day and changes across days; no IP or UA is stored', () => {
  const day1 = ingestMod.saltFor('2026-10-13')
  assert.equal(ingestMod.saltFor('2026-10-13'), day1)
  const a = ingestMod.visitorHash(day1, 'lucian-dev.com', '203.0.113.9', CHROME)
  assert.equal(ingestMod.visitorHash(ingestMod.saltFor('2026-10-13'), 'lucian-dev.com', '203.0.113.9', CHROME), a)
  assert.match(a, /^[0-9a-f]{16}$/)
  assert.notEqual(ingestMod.visitorHash(day1, 'lucian-dev.com', '203.0.113.10', CHROME), a)
  const day2 = ingestMod.saltFor('2026-10-14')
  assert.notEqual(ingestMod.visitorHash(day2, 'lucian-dev.com', '203.0.113.9', CHROME), a)

  // Through the endpoint: two views from one client on one day share a visitor.
  const now = Date.parse('2026-10-14T10:00:00Z')
  ipCounter = 50
  ingestMod.ingest(beacon(pv('/')), now)
  ingestMod.ingest(beacon(pv('/about')), now + 1000)
  ingestMod.flushNow(now + 2000)
  const rows = getAnalyticsDb().prepare("SELECT * FROM hits WHERE day = '2026-10-14'").all() as Array<Record<string, unknown>>
  assert.equal(rows.length, 2)
  assert.equal(rows[0].visitor, rows[1].visitor)
  const stored = JSON.stringify(rows)
  assert.equal(stored.includes('203.0.113'), false)
  assert.equal(stored.includes('Mozilla'), false)
  assert.deepEqual(Object.keys(rows[0]).sort(), ['browser', 'country', 'day', 'device', 'lang', 'path', 'ref_host', 'ts', 'visitor'])
})

test('referrer host only for other sites; country, device and browser are coarse', () => {
  assert.equal(ingestMod.referrerHost('https://www.google.com/search?q=x', 'lucian-dev.com'), 'google.com')
  assert.equal(ingestMod.referrerHost('https://lucian-dev.com/blog', 'lucian-dev.com'), null)
  assert.equal(ingestMod.referrerHost('https://www.lucian-dev.com/', 'lucian-dev.com'), null)
  assert.equal(ingestMod.referrerHost('javascript:alert(1)', 'lucian-dev.com'), null)
  assert.equal(ingestMod.referrerHost('', 'lucian-dev.com'), null)
  assert.equal(ingestMod.deviceOf(IPHONE), 'mobile')
  assert.equal(ingestMod.deviceOf(CHROME), 'desktop')
  assert.equal(ingestMod.deviceOf('Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/129 Safari/537.36'), 'tablet')
  assert.equal(ingestMod.browserOf(IPHONE), 'Safari')
  assert.equal(ingestMod.browserOf(CHROME), 'Chrome')
  assert.equal(ingestMod.browserOf(`${CHROME} Edg/129.0`), 'Edge')
  assert.equal(ingestMod.browserOf('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'), 'Firefox')
  assert.equal(ingestMod.countryOf({ headers: { 'cf-ipcountry': 'jp' } } as any), 'JP')
  assert.equal(ingestMod.countryOf({ headers: { 'cf-ipcountry': 'XX' } } as any), null)
  assert.equal(ingestMod.countryOf({ headers: { 'cf-ipcountry': 'T1' } } as any), null)
})

test('rollup folds finished days into daily tables, the report merges rollups with raw hits, retention prunes', () => {
  const db = getAnalyticsDb()
  db.exec('DELETE FROM hits; DELETE FROM vitals; DELETE FROM daily; DELETE FROM refs_daily; DELETE FROM dims_daily; DELETE FROM meta;')
  const d1 = Date.parse('2026-10-10T09:00:00Z')
  const d2 = Date.parse('2026-10-11T09:00:00Z')
  const today = Date.parse('2026-10-12T09:00:00Z')

  // Day 1: visitor A views / twice (from Google), visitor B views /blog/x on an iPhone from Japan.
  ipCounter = 1
  ingestMod.ingest(beacon(pv('/', { r: 'https://www.google.com/' })), d1)
  ingestMod.ingest(beacon(pv('/')), d1 + 10)
  ipCounter = 2
  ingestMod.ingest(beacon(pv('/blog/x'), { 'user-agent': IPHONE, 'cf-ipcountry': 'JP' }), d1 + 20)
  ingestMod.ingest(beacon({ t: 'v', route: '/', name: 'LCP', value: 1800 }), d1 + 30)
  ingestMod.flushNow(d1 + 40)
  // Day 2: visitor C views /about.
  ipCounter = 3
  ingestMod.ingest(beacon(pv('/about')), d2)
  ingestMod.flushNow(d2 + 10)
  // Today (not rolled up yet): visitor D views /.
  ipCounter = 4
  ingestMod.ingest(beacon(pv('/')), today)
  ingestMod.ingest(beacon({ t: 'v', route: '/', name: 'LCP', value: 4200 }), today)
  ingestMod.ingest(beacon({ t: 'v', route: '/', name: 'LCP', value: 3000 }), today)
  ingestMod.flushNow(today + 10)

  assert.equal((db.prepare("SELECT value FROM meta WHERE key = 'rolled_through'").get() as { value: string }).value, '2026-10-11')
  assert.deepEqual(
    db.prepare("SELECT path, views, visitors FROM daily WHERE day = '2026-10-10' ORDER BY path").all(),
    [
      { path: '/', views: 2, visitors: 1 },
      { path: '/blog/x', views: 1, visitors: 1 },
    ],
  )
  assert.deepEqual(db.prepare("SELECT ref_host, visitors FROM refs_daily WHERE day = '2026-10-10'").all(), [{ ref_host: 'google.com', visitors: 1 }])
  assert.deepEqual(db.prepare("SELECT views, visitors FROM dims_daily WHERE day = '2026-10-10' AND kind = 'site'").get(), { views: 3, visitors: 2 })
  assert.deepEqual(db.prepare("SELECT value, visitors FROM dims_daily WHERE day = '2026-10-10' AND kind = 'country'").all(), [{ value: 'JP', visitors: 1 }])
  // Raw rows stay for 35 days after the rollup.
  assert.equal((db.prepare("SELECT count(*) AS n FROM hits WHERE day = '2026-10-10'").get() as { n: number }).n, 3)

  // Rolling up again is idempotent.
  ingestMod.rollup('2026-10-12')
  assert.equal((db.prepare("SELECT count(*) AS n FROM daily WHERE day = '2026-10-10'").get() as { n: number }).n, 2)

  const report = getAnalyticsReport('7d', today + 20)
  assert.equal(report.kpis.views.value, 5)
  assert.equal(report.kpis.visitors.value, 4) // daily uniques summed: 2 + 1 + 1
  assert.equal(report.kpis.views.delta, null) // no data for the previous 7 days
  assert.equal(report.series.length, 7)
  assert.deepEqual(report.series.at(-1), { key: '2026-10-12', views: 1, visitors: 1 })
  assert.deepEqual(report.topPages[0], { key: '/', visitors: 2, views: 3 })
  assert.deepEqual(report.referrers, [{ key: 'google.com', visitors: 1 }])
  assert.deepEqual(report.countries, [{ key: 'JP', visitors: 1, views: 1 }])
  assert.equal(report.devices.find((d) => d.key === 'mobile')?.visitors, 1)
  assert.equal(report.live, 1)
  const all = report.vitals['7d'].find((v) => v.route === '*' && v.name === 'LCP')
  assert.deepEqual(all && { p75: all.p75, samples: all.samples, rating: all.rating }, { p75: 4200, samples: 3, rating: 'poor' })

  const monthly = getAnalyticsReport('12m', today + 20)
  assert.equal(monthly.bucket, 'month')
  assert.equal(monthly.series.at(-1)?.key, '2026-10')
  assert.equal(monthly.series.at(-1)?.views, 5)

  // 40 days later: raw hits of those days are pruned, rollups stay.
  ipCounter = 9
  const later = Date.parse('2026-11-21T09:00:00Z')
  ingestMod.ingest(beacon(pv('/')), later)
  ingestMod.flushNow(later + 10)
  assert.equal((db.prepare("SELECT count(*) AS n FROM hits WHERE day <= '2026-10-12'").get() as { n: number }).n, 0)
  assert.equal((db.prepare("SELECT count(*) AS n FROM vitals WHERE day <= '2026-10-12'").get() as { n: number }).n, 0)
  assert.equal((db.prepare("SELECT count(*) AS n FROM daily WHERE day = '2026-10-10'").get() as { n: number }).n, 2)
  assert.equal(getAnalyticsReport('12m', later + 20).kpis.views.value, 6)
})

test('p75 uses the nearest rank', () => {
  assert.equal(p75([]), 0)
  assert.equal(p75([5]), 5)
  assert.equal(p75([1, 2, 3, 4]), 3)
  assert.equal(p75([1, 2, 3, 4, 5, 6, 7, 8]), 6)
})

test('panel formatting helpers', () => {
  assert.equal(fmt.formatDelta(null), null)
  assert.equal(fmt.formatDelta(0), '±0%')
  assert.equal(fmt.formatDelta(0.254), '+25%')
  assert.equal(fmt.formatDelta(-0.083), '−8.3%')
  assert.equal(fmt.formatVital('CLS', 0.0512), '0.05')
  assert.equal(fmt.formatVital('INP', 184.2), '184 ms')
  assert.equal(fmt.formatVital('LCP', 2430), '2.43 s')
  assert.equal(fmt.formatBucket('2026-10-03'), 'Oct 3')
  assert.equal(fmt.formatBucket('2026-10'), 'Oct 2026')
  assert.equal(fmt.niceMax(0), 4)
  assert.equal(fmt.niceMax(7), 10)
  assert.equal(fmt.niceMax(120), 200)
  assert.equal(fmt.niceMax(230), 250)
  assert.equal(fmt.countryName('JP'), 'Japan')
  assert.equal(fmt.ratingLabel('needs-improvement'), 'Needs improvement')
})

// ── COR-1: a re-reported CLS / INP replaces its value, never counts twice ──

test('COR-1: a CLS reported again under the same instance id replaces its row with the larger final value', () => {
  const db = getAnalyticsDb()
  db.exec('DELETE FROM vitals')
  const t = Date.parse('2026-10-20T09:00:00Z')
  const cls = (value: number, extra: Record<string, unknown> = {}) => ({ t: 'v', route: '/', name: 'CLS', value, nav: 'navigate', k: 'v5-1760950800000-1234567890123', ...extra })
  ipCounter = 40
  // First hide: CLS 0.02 (and an LCP of the same page load).
  assert.equal(ingestMod.ingest(beacon([cls(0.02), { t: 'v', route: '/', name: 'LCP', value: 1800, k: 'v5-1760950800000-1234567890124' }]), t).accepted, 2)
  ingestMod.flushNow(t + 1)
  // The visitor comes back, more layout shifts, second hide: CLS 0.31 for the same instance.
  assert.equal(ingestMod.ingest(beacon([cls(0.31)]), t + 60_000).accepted, 1)
  ingestMod.flushNow(t + 60_001)
  const rows = () =>
    db.prepare("SELECT name, value, rating, vkey FROM vitals WHERE day = '2026-10-20' AND route = '/' ORDER BY name").all() as Array<{
      name: string
      value: number
      rating: string
      vkey: string | null
    }>
  assert.deepEqual(
    rows().map((r) => [r.name, r.value, r.rating]),
    [
      ['CLS', 0.31, 'poor'],
      ['LCP', 1800, 'good'],
    ],
    'one CLS row, holding the final value',
  )
  // The stored key is a hash: the browser's id (and its timestamp) never reach the database.
  assert.ok(rows().every((r) => typeof r.vkey === 'string' && /^[0-9a-f]{32}$/.test(r.vkey) && !r.vkey.includes('1760950800000')))
  // Two reports of one instance in the same flush window: still one row, the later value.
  ingestMod.ingest(beacon([cls(0.4)]), t + 120_000)
  ingestMod.ingest(beacon([cls(0.45)]), t + 120_500)
  ingestMod.flushNow(t + 121_000)
  assert.deepEqual(
    rows()
      .filter((r) => r.name === 'CLS')
      .map((r) => r.value),
    [0.45],
  )
  // Another page load (another id), an event without an id, a malformed id, and the same id
  // under another route or metric are separate measurements.
  ingestMod.ingest(beacon([cls(0.05, { k: 'v5-1760950900000-9999999999999' })]), t + 180_000)
  ingestMod.ingest(beacon([cls(0.06, { k: undefined })]), t + 180_000)
  ingestMod.ingest(beacon([cls(0.07, { k: 'bad id with spaces' })]), t + 180_000)
  ingestMod.ingest(beacon([cls(0.08, { route: '/about' })]), t + 180_000)
  ingestMod.ingest(beacon([cls(120, { name: 'INP' })]), t + 180_000)
  ingestMod.flushNow(t + 181_000)
  assert.deepEqual(
    rows()
      .filter((r) => r.name === 'CLS')
      .map((r) => r.value)
      .sort(),
    [0.05, 0.06, 0.07, 0.45],
  )
  assert.equal((db.prepare("SELECT count(*) AS n FROM vitals WHERE route = '/about'").get() as { n: number }).n, 1)
  assert.equal((db.prepare("SELECT count(*) AS n FROM vitals WHERE name = 'INP'").get() as { n: number }).n, 1)
  // The report counts each measurement once.
  const report = getAnalyticsReport('7d', t + 200_000)
  const home = report.vitals['7d'].find((v) => v.route === '/' && v.name === 'CLS')
  assert.equal(home?.samples, 4)
  assert.equal(ingestMod.vitalKey('/', 'CLS', 'x'), ingestMod.vitalKey('/', 'CLS', 'x'))
  assert.notEqual(ingestMod.vitalKey('/', 'CLS', 'x'), ingestMod.vitalKey('/', 'INP', 'x'))
})

test('COR-1: a store created before the vitals key gains the column and its unique index, keeping its rows', async () => {
  const { default: Database } = await import('better-sqlite3')
  ingestMod.flushNow()
  closeAnalyticsDb()
  const file = analyticsDbPath()
  for (const f of fs.readdirSync(path.dirname(file))) if (f.startsWith('analytics.db')) fs.rmSync(path.join(path.dirname(file), f))
  const old = new Database(file)
  old.exec(`CREATE TABLE vitals (ts INTEGER NOT NULL, day TEXT NOT NULL, route TEXT NOT NULL, name TEXT NOT NULL,
    value REAL NOT NULL, rating TEXT NOT NULL, device TEXT, nav TEXT)`)
  old.prepare("INSERT INTO vitals VALUES (1, '2026-10-21', '/', 'LCP', 1500, 'good', 'desktop', 'navigate')").run()
  old.close()

  const db = getAnalyticsDb()
  const columns = (db.prepare('PRAGMA table_info(vitals)').all() as Array<{ name: string }>).map((c) => c.name)
  assert.ok(columns.includes('vkey'))
  const index = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_vitals_key'").get() as { sql: string } | undefined
  assert.match(index?.sql || '', /CREATE UNIQUE INDEX/)
  assert.deepEqual(db.prepare('SELECT name, value, vkey FROM vitals').all(), [{ name: 'LCP', value: 1500, vkey: null }])
  // Opening again is a no-op, and the upsert works on the migrated table.
  closeAnalyticsDb()
  const again = getAnalyticsDb()
  const t = Date.parse('2026-10-21T09:00:00Z')
  ipCounter = 41
  for (const value of [0.1, 0.2]) ingestMod.ingest(beacon([{ t: 'v', route: '/', name: 'CLS', value, k: 'v5-1-2' }]), t)
  ingestMod.flushNow(t + 1)
  assert.deepEqual(again.prepare("SELECT value FROM vitals WHERE name = 'CLS'").all(), [{ value: 0.2 }])
})
