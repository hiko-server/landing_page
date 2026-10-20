/**
 * H10 — Analytics explore: periods, comparison and filters
 * (lib/analytics/exploreShared), the explore report on rollups and on the
 * raw window (lib/analytics/explore), goals / conversion / paths under
 * filters (lib/analytics/goalsQuery), the page detail, migration 7 (indexes
 * and the page-language rollup) with its query plans, the CSV export
 * (lib/analytics/exportCsv and its route) and the weekly digest
 * (lib/analytics/digestShared, digest, digestSchedule and its route) — sent
 * through a throw-away SMTP server on loopback. Everything runs in a
 * temporary directory; fixtures are synthetic (example.com addresses).
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { ANALYTICS_MIGRATIONS } from '../scripts/db/analytics/index.mjs'
import { runMigrations } from '../scripts/db/migrate.mjs'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'NEXT_PHASE', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'FROM_EMAIL', 'NOTIFY_EMAIL', 'ADMIN_EMAIL', 'REPLY_FROM_EMAIL']) {
  delete process.env[k]
}
process.env.JWT_SECRET = 'analytics-explore-secret-0123456789abcdef0123'
process.env.SITE_URL = 'https://site.example.com'

const repoRoot = process.cwd()
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'analytics-explore-'))
process.chdir(root)
fs.mkdirSync(path.join(root, 'data'), { recursive: true })

const xs = await import('../lib/analytics/exploreShared')
const xf = await import('../lib/analytics/exploreFormat')
const explore = await import('../lib/analytics/explore')
const goalsQuery = await import('../lib/analytics/goalsQuery')
const csv = await import('../lib/analytics/exportCsv')
const ds = await import('../lib/analytics/digestShared')
const digest = await import('../lib/analytics/digest')
const { startDigestSchedule } = await import('../lib/analytics/digestSchedule')
const events = await import('../lib/analytics/events')
const ingest = await import('../lib/analytics/ingest')
const { getAnalyticsReport } = await import('../lib/analytics/query')
const { utcDay, dayMinus } = await import('../lib/analytics/shared')
const { getAnalyticsDb, closeAnalyticsDb } = await import('../lib/analytics/db')
const { putItem } = await import('../lib/contentStore')

after(async () => {
  events.resetEventsState()
  closeAnalyticsDb()
  const { closeDb } = await import('../lib/db')
  closeDb()
  const { closeAuditDb } = await import('../lib/audit/db')
  closeAuditDb()
  process.chdir(repoRoot)
  fs.rmSync(root, { recursive: true, force: true })
})

const TODAY = utcDay(Date.now())
const NOW = Date.parse(`${TODAY}T12:00:00Z`)
const db = () => getAnalyticsDb()

function reset() {
  events.resetEventsState()
  db().exec(`DELETE FROM hits; DELETE FROM daily; DELETE FROM refs_daily; DELETE FROM dims_daily; DELETE FROM langs_daily;
             DELETE FROM events; DELETE FROM events_daily; DELETE FROM event_props_daily; DELETE FROM vitals;
             DELETE FROM meta WHERE key IN ('rolled_through', 'events_rolled_through');
             DELETE FROM meta WHERE key LIKE 'digest_%'`)
  db().prepare("INSERT INTO meta (key, value) VALUES ('events_since', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(dayMinus(TODAY, 300))
}

type Hit = { day: string; time?: string; path: string; visitor: string; ref?: string | null; country?: string | null; device?: string; browser?: string; lang?: string | null }

function hit(h: Hit) {
  db()
    .prepare('INSERT INTO hits (ts, day, path, ref_host, country, device, browser, visitor, lang) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(Date.parse(`${h.day}T${h.time ?? '10:00:00'}Z`), h.day, h.path, h.ref ?? null, h.country ?? 'HK', h.device ?? 'desktop', h.browser ?? 'Chrome', h.visitor, h.lang === undefined ? 'en' : h.lang)
}

function event(day: string, name: string, prop: string, visitor: string, time = '10:30:00') {
  db().prepare('INSERT INTO events (ts, day, name, prop, visitor) VALUES (?, ?, ?, ?, ?)').run(Date.parse(`${day}T${time}Z`), day, name, prop, visitor)
}

const q = (over: Partial<import('../lib/analytics/exploreShared').ExploreQuery> = {}) => ({ ...xs.DEFAULT_EXPLORE_QUERY, ...over })
const F = (dim: any, value: string, op: 'is' | 'not' = 'is') => ({ dim, op, value })

// ── 1. Periods, filters and the URL form ───────────────────────────────────

test('periods resolve to UTC day spans, clamped to the stored history; custom ranges swap and clamp', () => {
  const today = '2026-10-21'
  const r = (period: any, from: string | null = null, to: string | null = null) => xs.resolvePeriod({ period, from, to }, today)
  assert.deepEqual(r('today'), { from: today, to: today })
  assert.deepEqual(r('yesterday'), { from: '2026-10-20', to: '2026-10-20' })
  assert.deepEqual(r('7d'), { from: '2026-10-15', to: today })
  assert.deepEqual(r('28d'), { from: '2026-09-24', to: today })
  assert.deepEqual(r('30d'), { from: '2026-09-22', to: today })
  assert.deepEqual(r('90d'), { from: '2026-07-24', to: today })
  assert.deepEqual(r('month'), { from: '2026-10-01', to: today })
  assert.deepEqual(r('last-month'), { from: '2026-09-01', to: '2026-09-30' })
  assert.deepEqual(xs.resolvePeriod({ period: 'last-month', from: null, to: null }, '2026-03-05'), { from: '2026-02-01', to: '2026-02-28' })
  assert.deepEqual(r('12m'), { from: '2025-10-22', to: today })
  assert.deepEqual(r('custom', '2026-10-10', '2026-10-01'), { from: '2026-10-01', to: '2026-10-10' }, 'reversed ends swap')
  assert.deepEqual(r('custom', '2020-01-01', '2030-01-01'), { from: xs.earliestDay(today), to: today }, 'clamped to 400 days and today')
  assert.deepEqual(r('custom', '2026-02-30', '2026-03-01'), r('30d'), 'an impossible date falls back')
  assert.equal(xs.spanDays({ from: '2026-10-01', to: '2026-10-31' }), 31)
  assert.deepEqual(xs.previousSpan({ from: '2026-10-15', to: '2026-10-21' }), { from: '2026-10-08', to: '2026-10-14' })
  assert.deepEqual(xs.shiftSpan({ from: '2026-10-15', to: '2026-10-21' }, -1), { from: '2026-10-08', to: '2026-10-14' })
  assert.deepEqual(xs.shiftSpan({ from: '2026-10-08', to: '2026-10-14' }, 1), { from: '2026-10-15', to: '2026-10-21' })
  assert.equal(xs.rawWindowStart(today), '2026-09-17')
  assert.equal(xs.EXPLORE_RAW_DAYS, ingest.RAW_HITS_DAYS)
  assert.equal(xs.EXPLORE_RAW_DAYS, events.RAW_EVENTS_DAYS)
  assert.equal(xs.EXPLORE_ROLLUP_DAYS, ingest.ROLLUP_DAYS)
})

test('buckets: days up to ~3 months, ISO weeks (Monday) up to ~6½ months, then months', () => {
  assert.equal(xs.bucketFor(1), 'day')
  assert.equal(xs.bucketFor(92), 'day')
  assert.equal(xs.bucketFor(93), 'week')
  assert.equal(xs.bucketFor(200), 'week')
  assert.equal(xs.bucketFor(365), 'month')
  assert.equal(xs.bucketKey('2026-10-21', 'week'), '2026-10-19', 'a Wednesday belongs to the Monday before')
  assert.equal(xs.bucketKey('2026-10-19', 'week'), '2026-10-19')
  assert.equal(xs.bucketKey('2026-10-25', 'week'), '2026-10-19', 'Sunday ends the ISO week')
  assert.equal(xs.bucketKey('2026-10-21', 'month'), '2026-10')
  assert.equal(xf.bucketLabel('2026-10-19', 'week'), 'Week of Oct 19')
  assert.equal(xf.bucketTick('2026-10', 'month'), 'Oct ’26')
})

test('filters: values are normalised to the stored shapes; anything else is refused', () => {
  assert.deepEqual(xs.parseFilter('page:is:/blog/hello-world'), { dim: 'page', op: 'is', value: '/blog/hello-world' })
  assert.deepEqual(xs.parseFilter('source:not:WWW.LinkedIn.com'), { dim: 'source', op: 'not', value: 'linkedin.com' })
  assert.deepEqual(xs.parseFilter('country:is:jp'), { dim: 'country', op: 'is', value: 'JP' })
  assert.deepEqual(xs.parseFilter('device:is:Mobile'), { dim: 'device', op: 'is', value: 'mobile' })
  assert.deepEqual(xs.parseFilter('browser:is:samsung internet'), { dim: 'browser', op: 'is', value: 'Samsung Internet' })
  assert.deepEqual(xs.parseFilter('lang:is:zh-Hans'), { dim: 'lang', op: 'is', value: 'zh-hans' })
  for (const bad of ['page:is:blog', 'page:is://evil.example', 'source:is:localhost', 'source:is:10.0.0.1', 'country:is:Japan', 'device:is:watch', 'browser:is:Netscape', 'lang:is:english!', 'visitor:is:abc', 'page:maybe:/', 'page:is:/a\nb', 'page', '']) {
    assert.equal(xs.parseFilter(bad), null, bad)
  }
  const one = xs.withFilter([F('page', '/a')], F('page', '/b'))
  assert.deepEqual(one, [F('page', '/b')], 'one filter per dimension')
  assert.deepEqual(xs.withFilter([F('lang', 'en')], F('page', '/b')).map((f) => f.dim), ['page', 'lang'], 'kept in dimension order')
  assert.deepEqual(xs.withoutFilter(one, 'page'), [])
  assert.equal(xs.pageOf([F('page', '/cv')]), '/cv')
  assert.equal(xs.pageOf([F('page', '/cv', 'not')]), null)
})

test('the URL form round-trips; the earlier range=… is still read; malformed parts fall back', () => {
  const view = { period: 'custom' as const, from: '2026-10-01', to: '2026-10-07', compare: true, filters: [F('page', '/cv'), F('source', 'linkedin.com', 'not')] }
  const params = new URLSearchParams(xs.exploreSearch(view))
  const back = xs.parseExploreQuery({ period: params.get('period')!, from: params.get('from')!, to: params.get('to')!, compare: params.get('compare')!, f: params.getAll('f') })
  assert.deepEqual(back, view)
  assert.ok(xs.sameQuery(back, view))
  assert.deepEqual(xs.parseExploreQuery({ range: '12m' }), q({ period: '12m' }))
  assert.deepEqual(xs.parseExploreQuery({ period: 'custom', from: 'nope', to: '2026-10-07' }), q())
  assert.deepEqual(xs.parseExploreQuery({ period: 'decade' }), q())
  assert.deepEqual(xs.parseExploreQuery({ f: ['page:is:/a', 'page:is:/b', 'junk'] }).filters, [F('page', '/b')])
  assert.deepEqual(xs.exploreParams(q()), [], 'the default view has a bare URL')
  assert.deepEqual(xs.EXPLORE_PARAM_KEYS.slice().sort(), ['compare', 'f', 'from', 'period', 'range', 'to'])
})

test('the dashboard keeps the view’s parameters on the Analytics tab and drops them elsewhere', async () => {
  const { dashboardQuery } = await import('../components/Admin/shell/dashboardTabs')
  const view = { tab: 'analytics', period: '7d', compare: '1', f: ['page:is:/cv'], from: 'x', to: 'y', range: '12m', keep: '1' }
  assert.deepEqual(dashboardQuery(view, 'home'), { tab: 'home', keep: '1' })
  assert.deepEqual(dashboardQuery({ tab: 'home', keep: '1' }, 'analytics'), { tab: 'analytics', keep: '1' })
  assert.deepEqual(dashboardQuery(view, 'analytics'), view)
})

test('labels: filters, periods, values and the masked recipient', () => {
  assert.equal(xf.describeFilter(F('country', 'JP', 'not')), 'Country is not Japan (JP)')
  assert.equal(xf.describeFilter(F('device', 'mobile')), 'Device is Mobile')
  assert.equal(xf.describeFilter(F('lang', 'en')), 'Page language is English (en)')
  assert.equal(xf.describeFilters([]), 'None')
  assert.equal(xf.periodLabel({ period: '7d' }, { from: '2026-10-15', to: '2026-10-21' }), 'Last 7 days')
  assert.equal(xf.formatSpanWithYear({ from: '2026-10-01', to: '2026-10-07' }, '2026'), 'Oct 1 – Oct 7')
  assert.equal(xf.formatSpanWithYear({ from: '2025-12-29', to: '2026-01-04' }, '2026'), 'Dec 29, 2025 – Jan 4, 2026')
  assert.equal(xf.maskEmail('someone@example.com'), 's•••@example.com')
  assert.equal(xf.maskEmail('nope'), '•••')
  assert.equal(xf.pageLabel('/blog/a', { '/blog/a': 'A post' }), 'A post (/blog/a)')
  assert.equal(xf.periodPhrase({ period: '7d' }, { from: '2026-10-15', to: '2026-10-21' }), 'in the last 7 days')
  assert.equal(xf.periodPhrase({ period: 'month' }, { from: '2026-10-01', to: '2026-10-21' }), 'this month')
  assert.equal(xf.periodPhrase({ period: '12m' }, { from: '2026-09-17', to: '2026-10-21' }, true), `from ${xf.formatSpanWithYear({ from: '2026-09-17', to: '2026-10-21' }).replace(' – ', ' to ')}`)
  assert.equal(xf.previousPhrase({ period: '30d' }), 'the previous 30 days')
  assert.equal(xf.previousPhrase({ period: 'yesterday' }), 'the day before')
  assert.equal(xf.previousPhrase({ period: 'custom' }), 'the previous period')
})

test('chart scale: whole-number ticks, 3–5 of them, the top at or above the data', () => {
  assert.deepEqual(xf.chartScale(0), { max: 4, ticks: [0, 2, 4] })
  assert.deepEqual(xf.chartScale(5), { max: 6, ticks: [0, 2, 4, 6] })
  assert.deepEqual(xf.chartScale(10), { max: 10, ticks: [0, 5, 10] })
  assert.deepEqual(xf.chartScale(54), { max: 60, ticks: [0, 20, 40, 60] })
  assert.deepEqual(xf.chartScale(100), { max: 100, ticks: [0, 25, 50, 75, 100] })
  for (const m of [1, 7, 13, 99, 101, 999, 1107, 25_000, 123_456]) {
    const s = xf.chartScale(m)
    assert.ok(s.max >= m, `${m}`)
    assert.ok(s.ticks.length >= 3 && s.ticks.length <= 5, `${m}: ${s.ticks}`)
    assert.ok(s.ticks.every(Number.isInteger), `${m}: ${s.ticks}`)
    assert.equal(s.ticks[s.ticks.length - 1], s.max)
  }
})

// ── 2. Migration 7 ─────────────────────────────────────────────────────────

test('migration 7 adds the explore indexes and the page-language rollup, filled from the raw rows already rolled up', () => {
  const mem = new Database(':memory:')
  try {
    runMigrations(mem, ANALYTICS_MIGRATIONS.slice(0, 6), { label: 'analytics' })
    const ins = mem.prepare('INSERT INTO hits (ts, day, path, visitor, device, browser, lang) VALUES (0, ?, ?, ?, ?, ?, ?)')
    ins.run('2026-10-01', '/', 'a', 'desktop', 'Chrome', 'en')
    ins.run('2026-10-01', '/cv/zh', 'a', 'desktop', 'Chrome', 'zh-hans')
    ins.run('2026-10-01', '/', 'b', 'desktop', 'Chrome', 'en')
    ins.run('2026-10-02', '/', 'c', 'desktop', 'Chrome', 'en')
    mem.prepare("INSERT INTO meta (key, value) VALUES ('rolled_through', '2026-10-01')").run()
    const report = runMigrations(mem, ANALYTICS_MIGRATIONS, { label: 'analytics' })
    assert.deepEqual(report.applied, [{ version: 7, name: 'explore' }])
    const indexes = (mem.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as Array<{ name: string }>).map((r) => r.name)
    assert.ok(indexes.includes('idx_hits_day_visitor') && indexes.includes('idx_hits_day_ref'))
    assert.deepEqual(mem.prepare('SELECT day, lang, views, visitors FROM langs_daily ORDER BY lang').all(), [
      { day: '2026-10-01', lang: 'en', views: 2, visitors: 2 },
      { day: '2026-10-01', lang: 'zh-hans', views: 1, visitors: 1 },
    ], 'only days already rolled up (today’s hits roll up later)')
    assert.equal((mem.prepare("SELECT value FROM meta WHERE key = 'langs_since'").get() as { value: string }).value, '2026-10-01')
    assert.deepEqual(runMigrations(mem, ANALYTICS_MIGRATIONS, { label: 'analytics' }).applied, [], 'replay is a no-op')
  } finally {
    mem.close()
  }
})

test('the daily rollup fills and prunes langs_daily with the other daily tables', () => {
  reset()
  const d = dayMinus(TODAY, 2)
  hit({ day: d, path: '/', visitor: 'a', lang: 'en' })
  hit({ day: d, path: '/about', visitor: 'a', lang: 'en' })
  hit({ day: d, path: '/cv/zh', visitor: 'b', lang: 'zh-hans' })
  hit({ day: d, path: '/', visitor: 'c', lang: null })
  db().prepare("INSERT INTO langs_daily (day, lang, views, visitors) VALUES (?, 'en', 1, 1)").run(dayMinus(TODAY, 401))
  ingest.rollup(TODAY)
  assert.deepEqual(db().prepare('SELECT lang, views, visitors FROM langs_daily WHERE day = ? ORDER BY lang').all(d), [
    { lang: 'en', views: 2, visitors: 1 },
    { lang: 'zh-hans', views: 1, visitors: 1 },
  ])
  assert.equal((db().prepare('SELECT count(*) AS n FROM langs_daily WHERE day < ?').get(dayMinus(TODAY, 400)) as { n: number }).n, 0)
})

// ── 3. The explore report ──────────────────────────────────────────────────

/** Two days of synthetic traffic inside the raw window. */
function seedTraffic() {
  reset()
  const d1 = dayMinus(TODAY, 2)
  const d2 = dayMinus(TODAY, 1)
  // v1 (Japan, mobile): LinkedIn → / → /cv, downloads the CV.
  hit({ day: d1, time: '09:00:00', path: '/', visitor: 'v1', ref: 'linkedin.com', country: 'JP', device: 'mobile', browser: 'Safari' })
  hit({ day: d1, time: '09:01:00', path: '/cv', visitor: 'v1', country: 'JP', device: 'mobile', browser: 'Safari' })
  event(d1, 'cv_download', 'en-pdf', 'v1', '09:02:00')
  // v2 (Hong Kong, desktop): Google → /blog/hello-world, reads it, clicks out to github.com, then /about.
  hit({ day: d1, time: '10:00:00', path: '/blog/hello-world', visitor: 'v2', ref: 'google.com' })
  event(d1, 'read_through', '/blog/hello-world', 'v2', '10:04:00')
  event(d1, 'outbound_click', 'github.com', 'v2', '10:05:00')
  event(d1, 'email_click', '/blog/hello-world', 'v2', '10:05:30')
  hit({ day: d1, time: '10:06:00', path: '/about', visitor: 'v2' })
  event(d1, 'outbound_click', 'example.org', 'v2', '10:07:00')
  // v3 (Hong Kong, desktop, Chinese CV): direct, /cv/zh.
  hit({ day: d2, time: '11:00:00', path: '/cv/zh', visitor: 'v3', lang: 'zh-hans', browser: 'Firefox' })
  // v4: LinkedIn → /blog/hello-world → / → /blog/hello-world (no read-through).
  hit({ day: d2, time: '12:00:00', path: '/blog/hello-world', visitor: 'v4', ref: 'linkedin.com', country: 'US' })
  hit({ day: d2, time: '12:01:00', path: '/', visitor: 'v4', country: 'US' })
  hit({ day: d2, time: '12:02:00', path: '/blog/hello-world', visitor: 'v4', country: 'US' })
  // v5: a direct link to /cv.pdf, no page view.
  event(d2, 'cv_download', 'en-pdf', 'v5', '13:00:00')
  // Vitals: one page on mobile, one on desktop.
  const v = db().prepare("INSERT INTO vitals (ts, day, route, name, value, rating, device) VALUES (?, ?, ?, 'LCP', ?, ?, ?)")
  v.run(NOW, d2, '/blog/hello-world', 1800, 'good', 'desktop')
  v.run(NOW, d2, '/blog/hello-world', 5200, 'poor', 'mobile')
  v.run(NOW, d2, '/', 900, 'good', 'desktop')
  return { d1, d2 }
}

test('unfiltered explore = the daily-totals report it extends (same numbers)', () => {
  seedTraffic()
  const before = getAnalyticsReport('7d', NOW)
  const x = explore.getExploreReport(q({ period: '7d' }), { now: NOW })
  assert.equal(x.mode, 'rollup')
  assert.deepEqual(x.kpis, before.kpis)
  assert.deepEqual(x.series, before.series)
  assert.deepEqual(x.topPages, before.topPages)
  assert.deepEqual(x.referrers, before.referrers)
  assert.deepEqual(x.countries, before.countries)
  assert.deepEqual(x.languages.map((r) => r.key), ['en', 'zh-hans'])
  assert.equal(x.window.clipped, false)
  assert.equal(x.page, null)
})

test('filters: page and language keep page views; a referrer keeps the whole visitor-day; "is not" excludes', () => {
  const { d1 } = seedTraffic()
  const page = explore.getExploreReport(q({ period: '7d', filters: [F('page', '/blog/hello-world')] }), { now: NOW })
  assert.equal(page.mode, 'raw')
  assert.deepEqual([page.kpis.views.value, page.kpis.visitors.value], [3, 2])
  assert.deepEqual(page.topPages.map((r) => r.key), ['/blog/hello-world'])
  assert.deepEqual(page.referrers, [
    { key: 'google.com', visitors: 1 },
    { key: 'linkedin.com', visitors: 1 },
  ], 'where the readers of the page came from')

  const linkedin = explore.getExploreReport(q({ period: '7d', filters: [F('source', 'linkedin.com')] }), { now: NOW })
  assert.deepEqual([linkedin.kpis.views.value, linkedin.kpis.visitors.value], [5, 2], 'v1 and v4, every page they viewed')
  assert.deepEqual(new Set(linkedin.topPages.map((r) => r.key)), new Set(['/', '/cv', '/blog/hello-world']))
  assert.deepEqual(linkedin.countries.map((r) => r.key).sort(), ['JP', 'US'])

  const notLinkedin = explore.getExploreReport(q({ period: '7d', filters: [F('source', 'linkedin.com', 'not')] }), { now: NOW })
  assert.equal(notLinkedin.kpis.visitors.value, 2, 'v2 and v3')

  const zh = explore.getExploreReport(q({ period: '7d', filters: [F('lang', 'zh-hans')] }), { now: NOW })
  assert.deepEqual(zh.topPages.map((r) => r.key), ['/cv/zh'])
  const mobileJp = explore.getExploreReport(q({ period: '7d', filters: [F('country', 'JP'), F('device', 'mobile')] }), { now: NOW })
  assert.deepEqual([mobileJp.kpis.views.value, mobileJp.kpis.visitors.value], [2, 1])
  assert.deepEqual(mobileJp.browsers, [{ key: 'Safari', views: 2, visitors: 1 }])
  const notHk = explore.getExploreReport(q({ period: '7d', filters: [F('country', 'HK', 'not')] }), { now: NOW })
  assert.equal(notHk.kpis.visitors.value, 2)

  // Vitals honour page and device only.
  const vit = explore.getExploreReport(q({ period: '7d', filters: [F('page', '/blog/hello-world'), F('device', 'mobile'), F('country', 'JP')] }), { now: NOW })
  assert.deepEqual(vit.vitalsScope, ['page', 'device'])
  assert.deepEqual(vit.vitals['7d'].map((v) => [v.route, v.name, v.p75]), [['/blog/hello-world', 'LCP', 5200]], 'one page: listed once, no "all pages" row')
  assert.ok(d1)
})

test('filtered periods are clipped to the raw window; the comparison needs the previous period inside it', () => {
  seedTraffic()
  const year = explore.getExploreReport(q({ period: '12m', filters: [F('device', 'desktop')] }), { now: NOW })
  assert.equal(year.window.from, xs.rawWindowStart(TODAY))
  assert.equal(year.window.clipped, true)
  assert.equal(year.window.days, xs.EXPLORE_RAW_DAYS)
  assert.equal(year.previous.available, false)
  assert.equal(year.kpis.views.delta, null)
  assert.equal(year.bucket, 'day')

  const week = explore.getExploreReport(q({ period: '7d', compare: true, filters: [F('device', 'desktop')] }), { now: NOW })
  assert.equal(week.previous.available, false, 'no raw rows that old yet')
  hit({ day: dayMinus(TODAY, 20), path: '/', visitor: 'old', device: 'desktop' })
  const again = explore.getExploreReport(q({ period: '7d', compare: true, filters: [F('device', 'desktop')] }), { now: NOW })
  assert.equal(again.previous.available, true)
  assert.equal(again.previousSeries?.length, again.series.length, 'aligned bucket by bucket')

  const old = explore.getExploreReport(q({ period: 'custom', from: dayMinus(TODAY, 200), to: dayMinus(TODAY, 100), filters: [F('device', 'desktop')] }), { now: NOW })
  assert.equal(old.window.empty, true)
  assert.deepEqual(old.series, [])
  assert.equal(old.kpis.views.value, 0)
})

test('compare=1 adds the previous series (unfiltered: from the daily totals); publish marks come from the content store', async () => {
  seedTraffic()
  // The previous 7 days begin 13 days ago: data reaching back that far makes them comparable.
  db().prepare("INSERT INTO dims_daily (day, kind, value, views, visitors) VALUES (?, 'site', '', 7, 3)").run(dayMinus(TODAY, 13))
  db().prepare("INSERT INTO meta (key, value) VALUES ('rolled_through', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(dayMinus(TODAY, 3))
  await putItem('blog', 'hello-world', { title: 'Hello, world', date: dayMinus(TODAY, 2) }, 'Synthetic.')
  await putItem('blog', 'a-draft', { title: 'Not yet', date: dayMinus(TODAY, 1), draft: true }, 'Synthetic.')
  const x = explore.getExploreReport(q({ period: '7d', compare: true }), { now: NOW })
  assert.equal(x.previous.available, true)
  assert.equal(x.previousSeries?.length, 7)
  assert.equal(x.previousSeries?.reduce((n, p) => n + p.views, 0), 7)
  assert.equal(x.kpis.views.previous, 7)
  assert.deepEqual(x.annotations, [{ day: dayMinus(TODAY, 2), path: '/blog/hello-world', title: 'Hello, world' }], 'drafts are never marked')
  assert.equal(x.titles['/blog/hello-world'], 'Hello, world')
  const off = explore.getExploreReport(q({ period: '7d' }), { now: NOW })
  assert.equal(off.previousSeries, null)
})

test('the page detail: read-through, e-mail clicks and outbound clicks put on the page viewed last before them', () => {
  seedTraffic()
  const x = explore.getExploreReport(q({ period: '7d', filters: [F('page', '/blog/hello-world')] }), { now: NOW })
  assert.ok(x.page)
  assert.equal(x.page!.kind, 'post')
  assert.equal(x.page!.editHref, '/admin/blog/edit?slug=hello-world')
  assert.deepEqual(x.page!.readThrough, { visitors: 1, events: 1, rate: 0.5 })
  assert.deepEqual(x.page!.emailClicks, { visitors: 1, events: 1 })
  assert.equal(x.page!.cvPrints, null)
  assert.deepEqual(x.page!.outbound, { visitors: 1, events: 1, hosts: [{ key: 'github.com', visitors: 1, events: 1 }] }, 'the click after /about is /about’s')
  const about = explore.getExploreReport(q({ period: '7d', filters: [F('page', '/about')] }), { now: NOW })
  assert.equal(about.page!.title, 'About')
  assert.equal(about.page!.readThrough, null)
  assert.deepEqual(about.page!.outbound.hosts.map((h) => h.key), ['example.org'])
  const cv = explore.getExploreReport(q({ period: '7d', filters: [F('page', '/cv')] }), { now: NOW })
  assert.deepEqual(cv.page!.cvPrints, { visitors: 0, events: 0 })
  assert.equal(explore.getExploreReport(q({ period: '7d', filters: [F('page', '/cv', 'not')] }), { now: NOW }).page, null)
})

test('dimension values for the filter picker ignore the dimension’s own filter', () => {
  seedTraffic()
  const values = explore.getDimensionValues(q({ period: '7d', filters: [F('country', 'JP')] }), 'country', { now: NOW })
  assert.deepEqual(values.map((r) => r.key).sort(), ['HK', 'JP', 'US'])
  const pages = explore.getDimensionValues(q({ period: '7d', filters: [F('country', 'JP')] }), 'page', { now: NOW })
  assert.deepEqual(pages.map((r) => r.key).sort(), ['/', '/cv'])
})

// ── 4. Goals, conversion and paths ─────────────────────────────────────────

test('goals under filters count the matching visitor-days only; a direct download matches no filter', () => {
  seedTraffic()
  const all = goalsQuery.getGoalsExplore(q({ period: '7d' }), { now: NOW })
  assert.equal(all.mode, 'rollup')
  assert.equal(all.goals.find((g) => g.name === 'cv_download')!.visitors.value, 2)
  const jp = goalsQuery.getGoalsExplore(q({ period: '7d', filters: [F('country', 'JP')] }), { now: NOW })
  assert.equal(jp.mode, 'raw')
  assert.equal(jp.siteVisitors, 1)
  const dl = jp.goals.find((g) => g.name === 'cv_download')!
  assert.deepEqual([dl.visitors.value, dl.events, dl.rate], [1, 1, 1])
  assert.equal(jp.goals.find((g) => g.name === 'read_through')!.events, 0)
  assert.equal(jp.funnel.directDownloads, 0)
  assert.deepEqual(jp.funnel.steps.map((s) => s.visitors), [1, 1, 1])
  const blog = goalsQuery.getGoalsExplore(q({ period: '7d', filters: [F('page', '/blog/hello-world')] }), { now: NOW })
  assert.equal(blog.siteVisitors, 2)
  assert.deepEqual(blog.goals.find((g) => g.name === 'outbound_click')!.props.map((p) => p.key).sort(), ['example.org', 'github.com'], 'every click of the visitor-days that read the page')
  assert.deepEqual(blog.funnel.sources.map((s) => s.key).sort(), ['google.com', 'linkedin.com'])
  assert.equal(blog.window?.clipped, false)
})

test('conversion paths: the referrer, then the pages up to the goal, repeats merged and long paths shortened', () => {
  reset()
  const d = dayMinus(TODAY, 1)
  const visit = (v: string, ref: string | null, pages: string[], goal = 'cv_download') => {
    pages.forEach((p, i) => hit({ day: d, time: `10:0${i}:00`, path: p, visitor: v, ref: i === 0 ? ref : null }))
    event(d, goal, goal === 'cv_download' ? 'en-pdf' : '', v, '10:30:00')
    hit({ day: d, time: '10:45:00', path: '/after', visitor: v })
  }
  visit('a', 'linkedin.com', ['/', '/cv'])
  visit('b', 'linkedin.com', ['/', '/cv', '/cv'])
  visit('c', null, ['/cv'])
  visit('d', 'google.com', ['/', '/about', '/work', '/blog', '/now', '/cv'])
  event(d, 'cv_download', 'en-pdf', 'e', '09:00:00')
  const p = goalsQuery.conversionPaths(db(), { from: dayMinus(TODAY, 6), to: TODAY }, 'cv_download')
  assert.equal(p.total, 5)
  assert.equal(p.noPageView, 1)
  assert.deepEqual(p.paths, [
    { source: 'linkedin.com', pages: ['/', '/cv'], visitors: 2 },
    { source: '(none)', pages: ['/cv'], visitors: 1 },
    { source: 'google.com', pages: ['/', '/about', '…', '/now', '/cv'], visitors: 1 },
  ])
  assert.ok(!JSON.stringify(p).includes('/after'), 'pages after the goal are not part of its path')
  assert.deepEqual(goalsQuery.shortenPath(['/a', '/b', '/c', '/d', '/e']), ['/a', '/b', '/c', '/d', '/e'])
  const filtered = goalsQuery.conversionPaths(db(), { from: dayMinus(TODAY, 6), to: TODAY }, 'cv_download', [F('source', 'google.com')])
  assert.equal(filtered.total, 1)
  assert.equal(goalsQuery.parsePathGoal('search_empty'), 'cv_download')
  assert.equal(goalsQuery.parsePathGoal('contact_sent'), 'contact_sent')
  const report = goalsQuery.getGoalsExplore(q({ period: '7d' }), { now: NOW, goal: 'cv_download' })
  assert.equal(report.paths?.total, 5)
})

// ── 5. Speed: the raw-window lookups use migration 7's indexes ──────────────

test('query plans: visitor-day lookups and the referrer filter use the explore indexes, never a full scan', () => {
  const plan = (sql: string, params: Record<string, unknown>) =>
    (db().prepare(`EXPLAIN QUERY PLAN ${sql}`).all(params) as Array<{ detail: string }>).map((r) => r.detail).join('\n')
  const f = explore.filterSql([F('source', 'linkedin.com')], 'h')
  const filtered = plan(`SELECT h.day, count(*) FROM hits h WHERE h.day BETWEEN @from AND @to AND ${f.where} GROUP BY h.day`, { ...f.params, from: '2026-01-01', to: '2026-02-01' })
  assert.match(filtered, /idx_hits_day_(ref|visitor)/)
  assert.doesNotMatch(filtered, /SCAN (h|hits|src_)\b(?! USING)/)
  const outbound = plan(
    `SELECT e.prop FROM events e WHERE e.name = 'outbound_click' AND e.day BETWEEN @from AND @to
     AND (SELECT h.path FROM hits h WHERE h.day = e.day AND h.visitor = e.visitor AND h.ts <= e.ts ORDER BY h.ts DESC LIMIT 1) = @page`,
    { from: '2026-01-01', to: '2026-02-01', page: '/' },
  )
  assert.match(outbound, /idx_hits_day_visitor/)

  // A month of a busy personal site: the filtered report stays quick.
  reset()
  const ins = db().prepare('INSERT INTO hits (ts, day, path, ref_host, country, device, browser, visitor, lang) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  db().transaction(() => {
    for (let d = 0; d < 30; d++) {
      const day = dayMinus(TODAY, d)
      for (let i = 0; i < 1500; i++) {
        const v = `v${d}-${i % 600}`
        ins.run(Date.parse(`${day}T10:00:00Z`) + i * 1000, day, ['/', '/cv', '/about', '/blog/hello-world'][i % 4], i % 7 === 0 ? 'linkedin.com' : null, ['HK', 'JP', 'US'][i % 3], i % 2 ? 'desktop' : 'mobile', 'Chrome', v, 'en')
      }
    }
  })()
  const t0 = performance.now()
  explore.getExploreReport(q({ period: '30d', compare: true, filters: [F('source', 'linkedin.com'), F('device', 'mobile')] }), { now: NOW })
  goalsQuery.getGoalsExplore(q({ period: '30d', filters: [F('source', 'linkedin.com')] }), { now: NOW })
  const ms = performance.now() - t0
  console.log(`explore: 45 000 page views, filtered report + goals in ${Math.round(ms)} ms`)
  assert.ok(ms < 3000, `45 000 page views filtered in ${Math.round(ms)} ms`)
})

// ── 6. CSV export ──────────────────────────────────────────────────────────

test('CSV cells: quoting, formula guard, numbers; tables start with a BOM and end lines with CRLF', () => {
  assert.equal(csv.csvCell('plain'), 'plain')
  assert.equal(csv.csvCell('a,b'), '"a,b"')
  assert.equal(csv.csvCell('say "hi"'), '"say ""hi"""')
  assert.equal(csv.csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`)
  assert.equal(csv.csvCell('+1'), "'+1")
  assert.equal(csv.csvCell('@cmd'), "'@cmd")
  assert.equal(csv.csvCell(' padded'), '" padded"')
  assert.equal(csv.csvCell(-3), '-3', 'numbers are never guarded')
  assert.equal(csv.csvCell(null), '')
  assert.equal(csv.csvCell(Number.NaN), '')
  assert.equal(csv.toCsv(['a', 'b'], [[1, 'x']]), '\uFEFFa,b\r\n1,x\r\n')
})

test('the export: every table of the view; search texts never leave the server', () => {
  seedTraffic()
  event(dayMinus(TODAY, 1), 'search_empty', 'synthetic secret query', 'v3')
  const view = q({ period: '7d', compare: true, filters: [F('page', '/blog/hello-world')] })
  const report = explore.getExploreReport(view, { now: NOW, limit: 1000 })
  const goals = goalsQuery.getGoalsExplore(q({ period: '7d' }), { now: NOW, limit: 1000 })
  const tables = csv.buildExportTables(report, goals, new Date(NOW))
  assert.deepEqual(Object.keys(tables), [...csv.EXPORT_TABLES])
  const all = Object.values(tables).join('\n')
  assert.ok(!all.includes('synthetic secret query'))
  assert.match(tables.summary, /searches_with_no_results,1\r\n/)
  assert.match(tables.summary, /filters,Page is \/blog\/hello-world/)
  assert.match(tables.pages, /\/blog\/hello-world,Hello, world|\/blog\/hello-world,"Hello, world"/)
  assert.match(tables.referrers, /linkedin\.com,1/)
  assert.match(tables.goals, /cv_download,CV downloads,2,2,/)
  assert.equal(csv.exportBaseName(report), `analytics_${report.window.from}_${report.window.to}_filtered`)
})

// ── 7. Routes ──────────────────────────────────────────────────────────────

type Out = { statusCode: number; headers: Record<string, string>; body: any }
function mockRes() {
  const out: Out = { statusCode: 200, headers: {}, body: undefined }
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
      res.headersSent = true
      res.writableEnded = true
      return res
    },
    send(b: unknown) {
      out.body = b
      res.headersSent = true
      res.writableEnded = true
      return res
    },
    end() {
      res.writableEnded = true
      return res
    },
  }
  return { res, out }
}

let ipSeq = 1
async function req(method: string, query: Record<string, string | string[]> = {}, body: unknown = undefined, auth = true) {
  const { signAdminToken, ADMIN_COOKIE } = await import('../lib/auth')
  const token = auth ? signAdminToken('owner@example.com') : ''
  return {
    method,
    query,
    body,
    url: '/api/admin/analytics',
    cookies: token ? { [ADMIN_COOKIE]: token } : {},
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', ...(token ? { cookie: `${ADMIN_COOKIE}=${token}` } : {}) },
    socket: { remoteAddress: `127.0.2.${ipSeq++}` },
  } as any
}

test('routes: the report, the picker values and the export answer the admin only, never cached', async () => {
  seedTraffic()
  const { default: analytics } = await import('../pages/api/admin/analytics')
  const { default: exportRoute } = await import('../pages/api/admin/analytics/export')
  const { default: goals } = await import('../pages/api/admin/goals')
  for (const handler of [analytics, exportRoute, goals]) {
    const { res, out } = mockRes()
    await handler(await req('GET', {}, undefined, false), res)
    assert.equal(out.statusCode, 401)
    assert.equal(out.headers['cache-control'], 'no-store')
  }
  let r = mockRes()
  await analytics(await req('GET', { period: '7d', f: ['page:is:/cv'] }), r.res)
  assert.equal(r.out.statusCode, 200)
  assert.equal(r.out.body.mode, 'raw')
  assert.deepEqual(r.out.body.query.filters, [F('page', '/cv')])
  r = mockRes()
  await analytics(await req('GET', { range: '12m' }), r.res)
  assert.equal(r.out.body.query.period, '12m')
  r = mockRes()
  await analytics(await req('GET', { period: '7d', values: 'country' }), r.res)
  assert.equal(r.out.body.dim, 'country')
  assert.ok(Array.isArray(r.out.body.values))
  r = mockRes()
  await analytics(await req('GET', { values: 'visitor' }), r.res)
  assert.equal(r.out.statusCode, 400)
  r = mockRes()
  await goals(await req('GET', { period: '7d', f: 'country:is:JP', goal: 'cv_download' }), r.res)
  assert.equal(r.out.body.mode, 'raw')
  assert.equal(r.out.body.paths.goal, 'cv_download')

  r = mockRes()
  await exportRoute(await req('GET', { period: '7d', table: 'pages' }), r.res)
  assert.equal(r.out.statusCode, 200)
  assert.equal(r.out.headers['content-type'], 'text/csv; charset=utf-8')
  assert.match(r.out.headers['content-disposition'], /^attachment; filename="analytics_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}_pages\.csv"$/)
  assert.ok(Buffer.isBuffer(r.out.body) && r.out.body.toString('utf8').startsWith('\uFEFFpage,title,visitor_days,views'))
  r = mockRes()
  await exportRoute(await req('GET', { period: '7d' }), r.res)
  assert.equal(r.out.headers['content-type'], 'application/zip')
  assert.equal(r.out.body.readUInt32LE(0), 0x04034b50, 'a zip archive')
  r = mockRes()
  await exportRoute(await req('GET', { table: 'everything' }), r.res)
  assert.equal(r.out.statusCode, 400)
})

// ── 8. The weekly digest ───────────────────────────────────────────────────

test('digest schedule: last week (Mon–Sun UTC), due Mondays from 01:00 for 48 h, once a week, three attempts', () => {
  const wed = Date.parse('2026-10-21T15:00:00Z')
  assert.deepEqual(ds.digestWeek(wed), { from: '2026-10-12', to: '2026-10-18' })
  assert.deepEqual(ds.digestWeek(Date.parse('2026-10-19T00:30:00Z')), { from: '2026-10-12', to: '2026-10-18' })
  assert.deepEqual(ds.digestWeek(Date.parse('2026-10-18T23:59:00Z')), { from: '2026-10-05', to: '2026-10-11' }, 'Sunday still belongs to the week')
  const mon0030 = Date.parse('2026-10-19T00:30:00Z')
  const mon0100 = Date.parse('2026-10-19T01:00:00Z')
  const on = { enabled: true, lastWeek: '2026-10-05', attempts: 0 }
  assert.equal(ds.isDigestDue(mon0030, on), false, 'not before 01:00')
  assert.equal(ds.isDigestDue(mon0100, on), true)
  assert.equal(ds.isDigestDue(Date.parse('2026-10-20T23:00:00Z'), on), true, 'a stopped server catches up within 48 h')
  assert.equal(ds.isDigestDue(Date.parse('2026-10-21T01:00:00Z'), on), false, 'then the week is skipped')
  assert.equal(ds.isDigestDue(mon0100, { ...on, lastWeek: '2026-10-12' }), false, 'sent already')
  assert.equal(ds.isDigestDue(mon0100, { ...on, attempts: 3 }), false, 'gave up after three failures')
  assert.equal(ds.isDigestDue(mon0100, { ...on, enabled: false }), false)
  assert.equal(ds.nextDigestAt(mon0030, on), mon0100)
  assert.equal(ds.nextDigestAt(mon0100 + 1000, { ...on, lastWeek: '2026-10-12' }), mon0100 + 7 * 86_400_000)
  assert.equal(ds.nextDigestAt(mon0100, { enabled: false, lastWeek: null }), null)
})

test('digest text: escaped, totals only, never a search text; a quiet week says so', () => {
  const kpiOf = (value: number, previous: number) => ({ value, previous, delta: previous ? (value - previous) / previous : null })
  const data = {
    site: 'site.example.com',
    week: { from: '2026-10-12', to: '2026-10-18' },
    previous: { from: '2026-10-05', to: '2026-10-11' },
    comparable: true,
    views: kpiOf(120, 100),
    visitors: kpiOf(40, 50),
    pages: [{ label: '/blog/<script>', value: 12, detail: 'A "title" & more' }],
    referrers: [{ label: 'linkedin.com', value: 9 }],
    countries: [{ label: 'Japan', value: 4 }],
    goals: [{ label: 'CV downloads', visitors: kpiOf(3, 1), events: 4, rate: 0.075 }],
    funnel: [
      { label: 'Visited the site', visitors: 40 },
      { label: 'Viewed the CV', visitors: 10 },
      { label: 'Downloaded the CV', visitors: 3 },
    ],
    emptySearches: { events: 5, texts: 2 },
    published: [{ title: 'Hello, world', path: '/blog/hello-world', day: '2026-10-14' }],
    vitals: [{ name: 'LCP' as const, p75: 1900, rating: 'good' as const, samples: 30 }],
    adminUrl: 'https://site.example.com/admin/dashboard?tab=analytics&period=custom&from=2026-10-12&to=2026-10-18&compare=1',
  }
  const mail = ds.renderDigest(data)
  assert.equal(mail.subject, 'site.example.com · week of Oct 12: 40 visitor-days (−20%)')
  assert.ok(mail.html.includes('/blog/&lt;script&gt;') && !mail.html.includes('<script>'))
  assert.ok(mail.html.includes('A &quot;title&quot; &amp; more'))
  assert.match(mail.text, /Views: 120 \(\+20% vs 100\)/)
  assert.match(mail.text, /5 searches \(2 different\) found nothing/)
  assert.match(mail.text, /CV downloads · 7\.5% \(\+200% vs 1\)/)
  assert.match(mail.text, /Visited the site 40 → Viewed the CV 10 → Downloaded the CV 3/)
  assert.ok(!/<img|https?:\/\/(?!site\.example\.com)/.test(mail.html), 'no images, no remote content')
  assert.match(ds.renderDigest(data, true).subject, /^Preview: /)
  const quiet = ds.renderDigest({ ...data, goals: [], funnel: [], emptySearches: { events: 0, texts: 0 }, published: [], vitals: [], pages: [], referrers: [], countries: [] })
  assert.match(quiet.text, /Goals: none reached this week\./)
})

/** A minimal SMTP server on loopback that accepts one login and records messages. */
async function fakeSmtp(): Promise<{ port: number; messages: Array<{ from: string; to: string[]; data: string }>; close: () => Promise<void> }> {
  const messages: Array<{ from: string; to: string[]; data: string }> = []
  const server = net.createServer((socket) => {
    let buffer = ''
    let inData = false
    let cur = { from: '', to: [] as string[], data: '' }
    const say = (line: string) => socket.write(`${line}\r\n`)
    say('220 smtp.example.com ESMTP')
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n')
          if (end < 0) return
          cur.data = buffer.slice(0, end)
          buffer = buffer.slice(end + 5)
          inData = false
          messages.push(cur)
          cur = { from: '', to: [], data: '' }
          say('250 OK queued')
          continue
        }
        const nl = buffer.indexOf('\r\n')
        if (nl < 0) return
        const line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 2)
        const cmd = line.slice(0, 4).toUpperCase()
        if (cmd === 'EHLO') say('250-smtp.example.com\r\n250 AUTH PLAIN LOGIN')
        else if (cmd === 'HELO') say('250 smtp.example.com')
        else if (cmd === 'AUTH') say('235 Authentication successful')
        else if (cmd === 'MAIL') {
          cur.from = line
          say('250 OK')
        } else if (cmd === 'RCPT') {
          cur.to.push(line)
          say('250 OK')
        } else if (cmd === 'DATA') {
          inData = true
          say('354 End data with <CR><LF>.<CR><LF>')
        } else if (cmd === 'QUIT') {
          say('221 Bye')
          socket.end()
        } else say('250 OK')
      }
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const port = (server.address() as net.AddressInfo).port
  return { port, messages, close: () => new Promise((r) => server.close(() => r())) }
}

test('sending: off and without SMTP nothing goes out; switched on it sends last week once, to the owner, and the claim survives', async () => {
  seedTraffic()
  const mondayOf = ds.mondayOf(NOW)
  const due = mondayOf + 3_600_000 + 60_000 // Monday 01:01 UTC of this week
  assert.deepEqual(await digest.sendDigest('scheduled', due), { ok: false, skipped: 'smtp', week: ds.digestWeek(due).from })

  const smtp = await fakeSmtp()
  process.env.SMTP_HOST = '127.0.0.1'
  process.env.SMTP_PORT = String(smtp.port)
  process.env.SMTP_USER = 'mailer@example.com'
  process.env.SMTP_PASS = 'synthetic-test-password'
  try {
    assert.equal((await digest.sendDigest('scheduled', due)).skipped, 'recipient')
    process.env.NOTIFY_EMAIL = 'owner@example.com'
    assert.equal(digest.digestStatus(due).recipient, 'o•••@example.com')
    assert.equal((await digest.sendDigest('scheduled', due)).skipped, 'not-due', 'off until switched on')
    digest.setDigestEnabled(true)
    const sent = await digest.sendDigest('scheduled', due)
    assert.equal(sent.ok, true)
    assert.equal(smtp.messages.length, 1)
    assert.match(smtp.messages[0].to[0], /owner@example\.com/)
    assert.match(smtp.messages[0].data, /Subject: =\?UTF-8\?Q\?site=2Eexample=2Ecom_=C2=B7_week_of_/)
    assert.match(smtp.messages[0].data, /Content-Type: text\/html/)
    const status = digest.digestStatus(due)
    assert.equal(status.lastWeek, ds.digestWeek(due).from)
    assert.equal(status.lastError, null)
    assert.equal((await digest.sendDigest('scheduled', due + 60_000)).skipped, 'not-due', 'once a week')
    const preview = await digest.sendDigest('manual', due + 120_000)
    assert.equal(preview.ok, true)
    assert.equal(smtp.messages.length, 2)
    assert.match(smtp.messages[1].data, /Preview/)
  } finally {
    await smtp.close()
  }

  // A mail server that is down: the claim is given back, the error kept (without addresses), three attempts.
  reset()
  digest.setDigestEnabled(true)
  process.env.SMTP_PORT = '9' // discard: nothing listens on loopback
  const failed = await digest.sendDigest('scheduled', due)
  assert.equal(failed.ok, false)
  assert.ok(failed.error && !failed.error.includes('owner@example.com'))
  const after = digest.readDigestState(due)
  assert.equal(after.lastWeek, null)
  assert.equal(after.attempts, 1)
  assert.ok(digest.digestStatus(due).lastError)
  for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'NOTIFY_EMAIL']) delete process.env[k]
})

test('digest route: status, switch and preview — admin only, recorded in the activity log', async () => {
  reset()
  const { default: route } = await import('../pages/api/admin/analytics/digest')
  let r = mockRes()
  await route(await req('GET', {}, undefined, false), r.res)
  assert.equal(r.out.statusCode, 401)
  r = mockRes()
  await route(await req('GET'), r.res)
  assert.equal(r.out.body.smtp, false)
  assert.equal(r.out.body.enabled, false)
  r = mockRes()
  await route(await req('PUT', {}, { enabled: 'yes' }), r.res)
  assert.equal(r.out.statusCode, 400)
  r = mockRes()
  await route(await req('PUT', {}, { enabled: true }), r.res)
  assert.equal(r.out.body.enabled, true)
  const { listAudit } = await import('../lib/audit/store')
  assert.equal(listAudit({}).entries[0]?.summary, 'Turned on the weekly analytics digest')
  r = mockRes()
  await route(await req('POST', {}, { action: 'send' }), r.res)
  assert.equal(r.out.statusCode, 200)
  assert.equal(r.out.body.skipped, 'smtp', 'without SMTP the preview explains instead of failing')
  r = mockRes()
  await route(await req('DELETE'), r.res)
  assert.equal(r.out.statusCode, 405)
})

test('digest timer: first check a few minutes after boot, then hourly; a failing check never stops it', async () => {
  const timers: Array<{ fn: () => void; ms: number }> = []
  let checks = 0
  const handle = startDigestSchedule({
    setTimeoutFn: (fn, ms) => {
      timers.push({ fn, ms })
      return timers.length
    },
    clearTimeoutFn: () => {},
    random: () => 0.5,
    check: async () => {
      checks++
      if (checks === 1) throw new Error('synthetic failure')
    },
  })
  assert.ok(timers[0].ms >= 2 * 60_000 && timers[0].ms <= 7 * 60_000)
  timers[0].fn()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(checks, 1)
  assert.equal(timers[1].ms, 3_600_000)
  timers[1].fn()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(checks, 2)
  handle.stop()
})
