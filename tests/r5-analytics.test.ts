import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// RT-5 / SEC4-3: the beacon can no longer plant made-up article paths or
// referrers, and one source can no longer use up the day's raw-row budget.

// data/analytics.db is resolved from process.cwd() when first opened.
const repoRoot = process.cwd()
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r5-analytics-'))
process.chdir(root)

const shared = await import('../lib/analytics/shared')
const ingestMod = await import('../lib/analytics/ingest')
const published = await import('../lib/analytics/published')
const limits = await import('../lib/analytics/limits')
const { createFixedWindowLimiter } = await import('../lib/security/rateLimitCore')
const { getAnalyticsDb, closeAnalyticsDb } = await import('../lib/analytics/db')
const { getAnalyticsReport } = await import('../lib/analytics/query')

after(() => {
  ingestMod.flushNow()
  closeAnalyticsDb()
  published.setPublishedSlugSource(null)
  process.chdir(repoRoot)
  fs.rmSync(root, { recursive: true, force: true })
})

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'

function beacon(body: unknown, ip: string, headers: Record<string, string | undefined> = {}) {
  const h: Record<string, string> = {
    host: 'lucian-dev.com',
    'user-agent': CHROME,
    'cf-connecting-ip': ip,
    'sec-fetch-site': 'same-origin',
    origin: 'https://lucian-dev.com',
  }
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) delete h[k]
    else h[k] = v
  }
  return {
    method: 'POST',
    url: '/api/a',
    headers: h,
    cookies: {},
    body: typeof body === 'string' ? body : JSON.stringify(body),
    socket: { remoteAddress: '127.0.0.1' },
  } as any
}

const pv = (p: string, extra: Record<string, unknown> = {}) => ({ t: 'pv', p, r: '', l: 'en', ...extra })
const tenViews = () => Array.from({ length: 10 }, () => pv('/'))
const MIN = 61_000

/** Send ten-event beacons from `ip`, a minute's budget per fake minute, until one is refused or `max` minutes pass. */
function fill(ip: string, start: number, maxMinutes: number) {
  let accepted = 0
  let now = start
  let dropped: string | null = null
  for (let m = 0; m < maxMinutes && !dropped; m++) {
    now = start + m * MIN
    for (let b = 0; b < limits.CLIENT_EVENTS_PER_MIN / 10; b++) {
      const r = ingestMod.ingest(beacon(tenViews(), ip), now)
      accepted += r.accepted
      if (r.dropped) {
        dropped = r.dropped
        break
      }
    }
  }
  return { accepted, dropped, now }
}

// ── 1. Article paths: published slugs only ───────────────────────────────

test('unknown /blog and /work slugs are dropped, published ones and other pages are kept', () => {
  published.setPublishedSlugSource(() => ({ blog: ['hello-world'], work: ['case-study'] }))
  const now = Date.parse('2026-10-15T08:00:00Z')
  const ip = '198.18.0.1'
  assert.deepEqual(ingestMod.ingest(beacon(pv('/blog/hello-world?utm_source=x'), ip), now), { accepted: 1, dropped: null })
  assert.deepEqual(ingestMod.ingest(beacon(pv('/work/case-study/'), ip), now), { accepted: 1, dropped: null })
  assert.deepEqual(ingestMod.ingest(beacon(pv('/blog/made-up'), ip), now), { accepted: 0, dropped: 'unpublished' })
  assert.deepEqual(ingestMod.ingest(beacon(pv('/work/fake-case'), ip), now), { accepted: 0, dropped: 'unpublished' })
  // The fixed allowlist is unchanged.
  assert.deepEqual(ingestMod.ingest(beacon(pv('/about'), ip), now), { accepted: 1, dropped: null })
  // Mixed beacon: only the published page view survives; vitals routes follow the same rule.
  const mixed = [
    pv('/blog/hello-world'),
    pv('/blog/spam-page'),
    { t: 'v', route: '/work/fake-case', name: 'LCP', value: 1200 },
    { t: 'v', route: '/work/case-study', name: 'LCP', value: 1200 },
  ]
  assert.deepEqual(ingestMod.ingest(beacon(mixed, ip), now), { accepted: 2, dropped: null })

  ingestMod.flushNow(now)
  const db = getAnalyticsDb()
  const paths = (db.prepare("SELECT DISTINCT path FROM hits WHERE day = '2026-10-15' ORDER BY path").all() as Array<{ path: string }>).map(
    (r) => r.path,
  )
  assert.deepEqual(paths, ['/about', '/blog/hello-world', '/work/case-study'])
  const routes = (db.prepare("SELECT route FROM vitals WHERE day = '2026-10-15'").all() as Array<{ route: string }>).map((r) => r.route)
  assert.deepEqual(routes, ['/work/case-study'])
})

test('CORR-4: the Chinese pages are measured while they exist; every public ISR page is trackable', async () => {
  const { STATIC_CONTENT_PATHS } = await import('../lib/revalidate')
  for (const p of STATIC_CONTENT_PATHS) assert.equal(shared.normalizeTrackedPath(p), p, `${p} is measured`)
  for (const p of ['/zh', '/zh/', '/zh/about', '/zh/work?x=1', '/zh/blog#top', '/zh/contact']) assert.ok(shared.normalizeTrackedPath(p), p)
  assert.equal(shared.normalizeTrackedPath('/zh/blog/a-post'), null, 'Chinese posts live at /blog/<slug>')
  assert.equal(shared.normalizeTrackedPath('/zh/other'), null)

  // /zh/blog and /zh/work exist (a Chinese post and case study); /zh/about does not yet: its 404 is not a page view.
  published.setPublishedSlugSource(() => ({ blog: ['hello-world'], work: [], zh: ['/zh/blog', '/zh/work'] }))
  const now = Date.parse('2026-10-16T08:00:00Z')
  const ip = '198.18.0.40'
  assert.deepEqual(ingestMod.ingest(beacon(pv('/zh/blog', { l: 'zh-Hans' }), ip), now), { accepted: 1, dropped: null })
  assert.deepEqual(ingestMod.ingest(beacon(pv('/zh/work/', { l: 'zh-Hans' }), ip), now), { accepted: 1, dropped: null })
  assert.deepEqual(ingestMod.ingest(beacon(pv('/zh/about', { l: 'zh-Hans' }), ip), now), { accepted: 0, dropped: 'unpublished' })
  assert.deepEqual(ingestMod.ingest(beacon([{ t: 'v', route: '/zh/blog', name: 'LCP', value: 900 }], ip), now), { accepted: 1, dropped: null })
  ingestMod.flushNow(now)
  const db = getAnalyticsDb()
  const rows = db.prepare("SELECT path, lang FROM hits WHERE day = '2026-10-16' ORDER BY path").all() as Array<{ path: string; lang: string }>
  assert.deepEqual(rows.map((r) => r.path), ['/zh/blog', '/zh/work'])
  assert.deepEqual(
    (db.prepare("SELECT route FROM vitals WHERE day = '2026-10-16'").all() as Array<{ route: string }>).map((r) => r.route),
    ['/zh/blog'],
  )
  // A source that does not say which Chinese pages exist accepts them all (never drop real traffic on a guess).
  published.setPublishedSlugSource(() => ({ blog: [], work: [] }))
  assert.equal(published.isRecordablePath('/zh/about', now), true)
  published.setPublishedSlugSource(null)
})

test('the slug set is cached for a minute, re-read early (at most every 5 s) on a miss', () => {
  let calls = 0
  let blog = ['old-post']
  published.setPublishedSlugSource(() => {
    calls++
    return { blog, work: [] }
  })
  const t = Date.parse('2026-10-15T09:00:00Z')
  assert.equal(published.isRecordablePath('/', t), true)
  assert.equal(published.isRecordablePath('/cv/zh', t), true)
  assert.equal(calls, 0, 'non-article paths never consult the content store')

  assert.equal(published.isRecordablePath('/blog/old-post', t), true)
  assert.equal(calls, 1)
  assert.equal(published.isRecordablePath('/blog/old-post', t + 30_000), true)
  assert.equal(calls, 1)

  // Published a moment ago: the first miss within 5 s of the last read is dropped without a re-read…
  blog = ['old-post', 'new-post']
  assert.equal(published.isRecordablePath('/blog/new-post', t + 2_000), false)
  assert.equal(calls, 1)
  // …the next miss after 5 s re-reads and finds it.
  assert.equal(published.isRecordablePath('/blog/new-post', t + 31_000), true)
  assert.equal(calls, 2)
  // A flood of junk slugs costs at most one read per 5 s.
  for (let i = 0; i < 50; i++) published.isRecordablePath(`/blog/junk-${i}`, t + 32_000)
  assert.equal(calls, 2)
  published.isRecordablePath('/blog/junk-x', t + 37_000)
  assert.equal(calls, 3)
  // Expired TTL: refreshed even for a known slug; unpublishing takes effect.
  blog = ['new-post']
  assert.equal(published.isRecordablePath('/blog/old-post', t + 37_000 + published.SLUG_TTL_MS), false)
  assert.equal(calls, 4)
})

test('a failing slug lookup never throws out of ingest: it accepts slug-shaped paths and logs once per refresh', () => {
  let calls = 0
  published.setPublishedSlugSource(() => {
    calls++
    throw new Error('content.db is locked')
  })
  const lines: string[] = []
  const origError = console.error
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  }
  try {
    const now = Date.parse('2026-10-15T10:00:00Z')
    assert.deepEqual(ingestMod.ingest(beacon(pv('/blog/anything'), '198.18.0.2'), now), { accepted: 1, dropped: null })
    assert.deepEqual(ingestMod.ingest(beacon(pv('/work/whatever'), '198.18.0.2'), now + 10_000), { accepted: 1, dropped: null })
    assert.equal(calls, 1, 'the failure is cached until the next refresh')
  } finally {
    console.error = origError
  }
  assert.equal(lines.filter((l) => l.includes('published-slug lookup failed')).length, 1)

  // A source returning garbage is a failure too.
  published.setPublishedSlugSource(() => null as any)
  console.error = () => {}
  try {
    assert.equal(published.isRecordablePath('/blog/x', Date.parse('2026-10-15T10:05:00Z')), true)
  } finally {
    console.error = origError
  }
  published.setPublishedSlugSource(() => ({ blog: [], work: [] }))
})

// ── 2. Per-minute budgets count events, per client and per network ───────

test('the per-client limit counts events, not beacons (partial beacons are trimmed)', () => {
  const ip = '198.51.100.7'
  const t = Date.parse('2026-10-20T10:00:00Z')
  for (let i = 0; i < 11; i++) assert.equal(ingestMod.ingest(beacon(tenViews(), ip), t).accepted, 10)
  assert.equal(ingestMod.ingest(beacon(tenViews().slice(0, 5), ip), t).accepted, 5) // 115 events so far
  assert.deepEqual(ingestMod.ingest(beacon(tenViews(), ip), t), { accepted: 5, dropped: null }) // trimmed to the budget
  assert.deepEqual(ingestMod.ingest(beacon(pv('/'), ip), t), { accepted: 0, dropped: 'rate-limit' })
  // 12 beacons were enough; the old beacon-based limit allowed 120 of them (1,200 events).
  assert.equal(ingestMod.ingest(beacon(tenViews(), ip), t + MIN).accepted, 10, 'a new minute, a new budget')

  // Unparseable beacons still cost one each.
  const junk = '198.51.100.8'
  for (let i = 0; i < limits.CLIENT_EVENTS_PER_MIN; i++) assert.equal(ingestMod.ingest(beacon('not json', junk), t).dropped, 'invalid')
  assert.equal(ingestMod.ingest(beacon(pv('/'), junk), t).dropped, 'rate-limit')
})

test('a coarser network limit caps an IPv6 /48 (and an IPv4 /24) across its addresses', () => {
  const t = Date.parse('2026-10-20T11:00:00Z')
  const perNetwork = limits.NETWORK_EVENTS_PER_MIN / limits.CLIENT_EVENTS_PER_MIN // 5 clients' worth
  for (let i = 1; i <= perNetwork; i++) {
    const ip = `2001:db8:aaaa:${i}::1`
    for (let b = 0; b < 12; b++) assert.equal(ingestMod.ingest(beacon(tenViews(), ip), t).accepted, 10, `${ip} beacon ${b}`)
  }
  // A fresh /64 inside the same /48: its own budget is untouched, the network's is spent.
  assert.deepEqual(ingestMod.ingest(beacon(pv('/'), '2001:db8:aaaa:99::1'), t), { accepted: 0, dropped: 'rate-limit' })
  // Another /48 is unaffected.
  assert.equal(ingestMod.ingest(beacon(pv('/'), '2001:db8:bbbb:1::1'), t).accepted, 1)
  // Next minute the network may send again.
  assert.equal(ingestMod.ingest(beacon(pv('/'), '2001:db8:aaaa:99::1'), t + MIN).accepted, 1)

  for (let i = 1; i <= perNetwork; i++) {
    for (let b = 0; b < 12; b++) assert.equal(ingestMod.ingest(beacon(tenViews(), `203.0.113.${i}`), t).accepted, 10)
  }
  assert.equal(ingestMod.ingest(beacon(pv('/'), '203.0.113.200'), t).dropped, 'rate-limit')
  assert.equal(ingestMod.ingest(beacon(pv('/'), '203.0.114.1'), t).accepted, 1)
})

// ── 3. Fair share of the daily raw budget ────────────────────────────────

test('one client gets a bounded share of the day; others still record; the share resets at UTC midnight', () => {
  const ip = '192.0.2.10'
  const start = Date.parse('2026-10-21T01:00:00Z')
  const r = fill(ip, start, 60)
  assert.equal(r.dropped, 'share')
  assert.equal(r.accepted, limits.CLIENT_DAILY_SHARE)
  assert.ok(limits.CLIENT_DAILY_SHARE * 50 < ingestMod.DAILY_RAW_CAP, 'dozens of clients are needed to reach the global cap')
  // Still refused later that day, even with a fresh per-minute window.
  assert.equal(ingestMod.ingest(beacon(pv('/'), ip), r.now + 3 * 3_600_000).dropped, 'share')
  // Another visitor (same /24, well under the network share) is recorded.
  assert.deepEqual(ingestMod.ingest(beacon(pv('/'), '192.0.2.11'), r.now + MIN), { accepted: 1, dropped: null })
  // A new UTC day, a new share.
  assert.equal(ingestMod.ingest(beacon(pv('/'), ip), Date.parse('2026-10-22T00:00:05Z')).accepted, 1)
})

test('a network share stops one /48 from multiplying its daily budget by rotating /64s', () => {
  const start = Date.parse('2026-10-23T01:00:00Z')
  let now = start
  const got: Array<{ accepted: number; dropped: string | null }> = []
  for (let i = 1; i <= 4; i++) {
    const r = fill(`2001:db8:cccc:${i}::1`, now, 40)
    got.push({ accepted: r.accepted, dropped: r.dropped })
    now = r.now + MIN
  }
  const full = limits.CLIENT_DAILY_SHARE
  assert.deepEqual(got, [
    { accepted: full, dropped: 'share' },
    { accepted: full, dropped: 'share' },
    { accepted: full, dropped: 'share' },
    { accepted: limits.NETWORK_DAILY_SHARE - 3 * full, dropped: 'share' },
  ])
  assert.equal(ingestMod.ingest(beacon(pv('/'), '2001:db8:cccc:5::1'), now).dropped, 'share')
  assert.equal(ingestMod.ingest(beacon(pv('/'), '2001:db8:dddd:1::1'), now).accepted, 1)
})

test('daily share counters: bounded memory, low counts evicted first, keyed per day', () => {
  const salt = (day: string) => Buffer.from(`salt-${day}`)
  const shares = limits.createDailyShares(salt, 4)
  const day = '2026-10-24'
  shares.add('heavy', day, 100)
  for (const k of ['a', 'b', 'c']) shares.add(k, day, 1)
  assert.equal(shares.size(), 4)
  shares.add('d', day, 1)
  assert.ok(shares.size() <= 4)
  assert.equal(shares.remaining('heavy', day, 1000), 900, 'the heavy sender keeps its count')
  for (let i = 0; i < 100; i++) shares.add(`flood-${i}`, day, 1)
  assert.ok(shares.size() <= 4)
  assert.equal(shares.remaining('heavy', day, 1000), 900)
  assert.equal(shares.remaining('heavy', '2026-10-25', 1000), 1000, 'a new day starts from zero')
  assert.equal(shares.size(), 0)
})

test('helpers: networkOf and takeUnits', () => {
  assert.equal(limits.networkOf('203.0.113.77'), '203.0.113.0/24')
  assert.equal(limits.networkOf('::ffff:203.0.113.5'), '203.0.113.0/24')
  assert.equal(limits.networkOf('2001:db8:1:2:3::9'), '2001:db8:1::/48')
  assert.equal(limits.networkOf('unknown'), null)
  const l = createFixedWindowLimiter()
  assert.equal(limits.takeUnits(l, 'k', 5, 3, 1000, 0), 3)
  assert.equal(limits.takeUnits(l, 'k', 5, 3, 1000, 10), 2)
  assert.equal(limits.takeUnits(l, 'k', 5, 3, 1000, 20), 0)
  assert.equal(limits.takeUnits(l, 'k', 5, 3, 1000, 1000), 3)
})

// ── 4. Fetch-metadata rules unchanged; old browsers still count ──────────

test('no Sec-Fetch-Site and no Origin (older browsers) is accepted; only cross-site metadata is refused', () => {
  const now = Date.parse('2026-10-15T12:00:00Z')
  const ip = '198.18.0.3'
  const bare = { 'sec-fetch-site': undefined, origin: undefined }
  assert.deepEqual(ingestMod.ingest(beacon(pv('/'), ip, bare), now), { accepted: 1, dropped: null })
  assert.equal(ingestMod.ingest(beacon(pv('/'), ip, { origin: undefined }), now).accepted, 1)
  assert.equal(ingestMod.ingest(beacon(pv('/'), ip, { 'sec-fetch-site': undefined }), now).accepted, 1)
  assert.equal(ingestMod.ingest(beacon(pv('/'), ip, { 'sec-fetch-site': 'none' }), now).accepted, 1)
  assert.equal(ingestMod.ingest(beacon(pv('/'), ip, { 'sec-fetch-site': 'same-site' }), now).dropped, 'cross-site')
  assert.equal(ingestMod.ingest(beacon(pv('/'), ip, { 'sec-fetch-site': undefined, origin: 'https://evil.example' }), now).dropped, 'cross-site')
})

// ── 5. Referrers: plausible hosts only; junk and the tail fold into (other)

test('referrer hosts must be plausible public hostnames', () => {
  const ok = ['google.com', 'news.ycombinator.com', 'com.google.android.gm', 'xn--bcher-kva.example', 'my_blog.example.org']
  for (const h of ok) assert.equal(shared.isPlausibleHost(h), true, h)
  const bad = ['localhost', '192.0.2.1', 'a..b', '-x.com', 'x-.com', 'exa mple.com', 'evil.com/', `${'a'.repeat(64)}.com`, `${'a.'.repeat(130)}com`, '', 42]
  for (const h of bad) assert.equal(shared.isPlausibleHost(h), false, String(h))

  const site = 'lucian-dev.com'
  assert.equal(ingestMod.referrerHost('https://www.google.com/search?q=x', site), 'google.com')
  assert.equal(ingestMod.referrerHost('android-app://com.google.android.gm/', site), 'com.google.android.gm')
  assert.equal(ingestMod.referrerHost('https://bücher.example/', site), 'xn--bcher-kva.example')
  assert.equal(ingestMod.referrerHost('http://192.0.2.1/x', site), null)
  assert.equal(ingestMod.referrerHost('http://localhost:3000/', site), null)
  assert.equal(ingestMod.referrerHost('android-app://%20weird%20host/', site), null)
  const longHost = ['a', 'b', 'c', 'd', 'e'].map((c) => c.repeat(60)).join('.') + '.com' // 307 chars
  assert.equal(ingestMod.referrerHost(`https://${longHost}/`, site), null)
})

test('the report names plausible referrers (one visitor is enough) and sums legacy junk into (other)', () => {
  const now = Date.parse('2026-12-10T09:00:00Z')
  ingestMod.flushNow(now) // roll the October test days out of the way
  ingestMod.ingest(beacon(pv('/', { r: 'https://news.ycombinator.com/item?id=1' }), '198.18.1.1'), now)
  ingestMod.ingest(beacon(pv('/', { r: 'https://news.ycombinator.com/' }), '198.18.2.1'), now)
  ingestMod.ingest(beacon(pv('/', { r: 'https://lonely-blog.example/' }), '198.18.3.1'), now)
  ingestMod.ingest(beacon(pv('/', { r: 'https://1.2.3.4/' }), '198.18.4.1'), now) // implausible: stored as direct
  ingestMod.flushNow(now + 10)
  // A row stored before hosts were validated.
  getAnalyticsDb()
    .prepare("INSERT INTO hits (ts, day, path, ref_host, country, device, browser, visitor, lang) VALUES (?, '2026-12-10', '/', ?, NULL, 'desktop', 'Chrome', ?, NULL)")
    .run(now, 'buy cheap pills!!', 'legacyvisitor000')

  const report = getAnalyticsReport('7d', now + 20)
  assert.deepEqual(report.referrers, [
    { key: 'news.ycombinator.com', visitors: 2 },
    { key: 'lonely-blog.example', visitors: 1 },
    { key: shared.OTHER_KEY, visitors: 1 },
  ])
  assert.deepEqual(report.topPages, [{ key: '/', visitors: 5, views: 5 }], 'page rows are not folded')
  const stored = getAnalyticsDb().prepare("SELECT ref_host FROM hits WHERE day = '2026-12-10' AND visitor != 'legacyvisitor000'").all()
  assert.deepEqual(
    (stored as Array<{ ref_host: string | null }>).map((r) => r.ref_host).sort(),
    ['lonely-blog.example', 'news.ycombinator.com', 'news.ycombinator.com', null],
  )
})
