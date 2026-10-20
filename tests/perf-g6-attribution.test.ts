/**
 * G6 — Web Vitals attribution: which element and which phase made a page
 * slow, collected without identifiers, validated twice (browser and
 * ingest), stored in vitals.attr and aggregated for the admin.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import {
  SELECTOR_MAX,
  buildAttribution,
  dominantPhase,
  lcpKindLabel,
  parseAttribution,
  phaseSegments,
  reduceSelector,
  type VitalAttributionRow,
} from '../lib/analytics/attribution'
import { createVitalsCollector, type WebVitalMetric } from '../lib/analytics/client'
import { parseEvents } from '../lib/analytics/ingest'
import { ATTRIBUTION_ROWS_PER_METRIC, vitalAttributionSince } from '../lib/analytics/query'
import { runMigrations } from '../scripts/db/migrate.mjs'
import { ANALYTICS_MIGRATIONS } from '../scripts/db/analytics/index.mjs'

const ROOT = process.cwd()

test('reduceSelector keeps tag#id.class of the last three meaningful parts, never text, generated classes or odd ids', () => {
  assert.equal(reduceSelector('html>body>div#__next>main#main>img.hero-photo'), 'div#__next>main#main>img.hero-photo')
  assert.equal(reduceSelector('div.css-1x2y3z.card.featured.extra>p'), 'div.card.featured>p')
  assert.equal(reduceSelector('section#:r1:>button.css-abc12'), 'section>button')
  assert.equal(reduceSelector('main>p>TEXT'), 'main>p', 'a text node part (web-vitals names it TEXT) is dropped')
  assert.equal(reduceSelector('BODY>DIV'), 'body>div')
  assert.equal(reduceSelector(''), null)
  assert.equal(reduceSelector(null), null)
  assert.equal(reduceSelector('div[data-x="secret"]'), null, 'attribute selectors never pass')
  const long = Array.from({ length: 10 }, (_, i) => `div#${'x'.repeat(50)}${i}`).join('>')
  const reduced = reduceSelector(long) as string
  assert.ok(reduced.length <= SELECTOR_MAX)
  assert.match(reduced, /x9$/, 'the element itself is kept, leading parts go first')
})

test('buildAttribution maps web-vitals v4 attribution to numbers, enumerations and a reduced selector', () => {
  const lcp = buildAttribution('LCP', {
    element: 'html>body>div#__next>main>img.cover',
    url: 'https://example.com/uploads/a.jpg',
    timeToFirstByte: 120.4,
    resourceLoadDelay: 40,
    resourceLoadDuration: 800.6,
    elementRenderDelay: 12,
    navigationEntry: { name: 'secret' },
  })
  assert.deepEqual(lcp, { el: 'div#__next>main>img.cover', kind: 'image', ttfb: 120, loadDelay: 40, loadTime: 801, renderDelay: 12 })
  const textLcp = buildAttribution('LCP', { timeToFirstByte: 1, resourceLoadDelay: 0, resourceLoadDuration: 0, elementRenderDelay: 3 })
  assert.ok(textLcp && 'kind' in textLcp && textLcp.kind === 'text', 'no resource URL: a text LCP')
  assert.equal(buildAttribution('LCP', { timeToFirstByte: -1, resourceLoadDelay: 0, resourceLoadDuration: 0, elementRenderDelay: 0 }), null)

  const inp = buildAttribution('INP', {
    interactionTarget: 'html>body>header>button#menu',
    interactionType: 'pointer',
    inputDelay: 8,
    processingDuration: 140.2,
    presentationDelay: 30,
    loadState: 'complete',
    longAnimationFrameEntries: [{ scripts: [{ sourceURL: 'https://x' }] }],
  })
  assert.deepEqual(inp, { el: 'body>header>button#menu', type: 'pointer', inputDelay: 8, processing: 140, presentation: 30, state: 'complete' })
  assert.equal(buildAttribution('INP', { inputDelay: 1, processingDuration: 1, presentationDelay: 1, interactionType: 'gesture', loadState: 'nope' })?.el, null)

  const cls = buildAttribution('CLS', { largestShiftTarget: 'main>figure.article-figure', largestShiftValue: 0.123456, loadState: 'dom-content-loaded' })
  assert.deepEqual(cls, { el: 'main>figure.article-figure', shift: 0.1235, state: 'dom-content-loaded' })
  assert.equal(buildAttribution('CLS', { largestShiftValue: 99 }), null)
  assert.equal(buildAttribution('FCP', { timeToFirstByte: 1 }), null)
  assert.equal(buildAttribution('LCP', null), null)
})

test('parseAttribution accepts exactly the browser shape and rejects anything else', () => {
  const lcp = { el: 'main>img.cover', kind: 'image', ttfb: 1, loadDelay: 2, loadTime: 3, renderDelay: 4 }
  assert.deepEqual(parseAttribution('LCP', { ...lcp, extra: 'dropped' }), lcp)
  assert.equal(parseAttribution('LCP', { ...lcp, el: 'main img' }), null, 'spaces are not a reduced selector')
  assert.equal(parseAttribution('LCP', { ...lcp, el: 'a'.repeat(121) }), null)
  assert.equal(parseAttribution('LCP', { ...lcp, el: 'p:contains(hello)' }), null)
  assert.equal(parseAttribution('LCP', { ...lcp, kind: 'video' }), null)
  assert.equal(parseAttribution('LCP', { ...lcp, loadTime: 1e9 }), null)
  assert.deepEqual(parseAttribution('LCP', { ...lcp, el: null }), { ...lcp, el: null })
  assert.deepEqual(parseAttribution('INP', { el: 'button#x', type: 'keyboard', inputDelay: 1, processing: 2, presentation: 3, state: 'loading' }), {
    el: 'button#x',
    type: 'keyboard',
    inputDelay: 1,
    processing: 2,
    presentation: 3,
    state: 'loading',
  })
  assert.deepEqual(parseAttribution('CLS', { el: null, shift: 0.05, state: 'bogus' }), { el: null, shift: 0.05, state: null })
  assert.equal(parseAttribution('CLS', { el: null, shift: -1 }), null)
  assert.equal(parseAttribution('TTFB', { el: null }), null)
  assert.equal(parseAttribution('LCP', [lcp]), null)
})

const metric = (over: Partial<WebVitalMetric> = {}): WebVitalMetric => ({ id: 'v4-1', name: 'LCP', value: 2100, navigationType: 'navigate', ...over })

test('the collector sends the attribution with LCP / INP / CLS, updates it with a grown value, and ingest validates it', () => {
  const c = createVitalsCollector('/blog')
  c.add(metric({ attribution: { element: 'main>img.cover', url: '/u.jpg', timeToFirstByte: 100, resourceLoadDelay: 10, resourceLoadDuration: 900, elementRenderDelay: 5 } }))
  c.add(metric({ id: 'cls', name: 'CLS', value: 0.02, attribution: { largestShiftTarget: 'main>p', largestShiftValue: 0.02, loadState: 'complete' } }))
  c.add(metric({ id: 'ttfb', name: 'TTFB', value: 90, attribution: { waitingDuration: 10 } }))
  let [batch] = c.drain()
  assert.deepEqual(batch[0].a, { el: 'main>img.cover', kind: 'image', ttfb: 100, loadDelay: 10, loadTime: 900, renderDelay: 5 })
  assert.deepEqual(batch[1].a, { el: 'main>p', shift: 0.02, state: 'complete' })
  assert.equal('a' in batch[2], false, 'TTFB carries no attribution')
  // CLS grows: its attribution follows the new value.
  c.add(metric({ id: 'cls', name: 'CLS', value: 0.3, attribution: { largestShiftTarget: 'main>figure.article-figure', largestShiftValue: 0.25, loadState: 'complete' } }))
  ;[batch] = c.drain()
  assert.deepEqual(batch[0].a, { el: 'main>figure.article-figure', shift: 0.25, state: 'complete' })

  const parsed = parseEvents(JSON.stringify([...batch, { t: 'v', route: '/blog', name: 'LCP', value: 100, k: 'x1', a: { el: 'bad selector!', kind: 'text', ttfb: 1, loadDelay: 1, loadTime: 1, renderDelay: 1 } }]))
  assert.equal(parsed.length, 2)
  assert.ok(parsed[0].t === 'v' && parsed[0].attr && 'shift' in parsed[0].attr)
  assert.ok(parsed[1].t === 'v' && parsed[1].attr === null, 'a malformed attribution is dropped, the measurement still counts')
})

function analyticsDb() {
  const db = new Database(':memory:')
  runMigrations(db, ANALYTICS_MIGRATIONS, { label: 'analytics' })
  return db
}

test('migration 5 adds the nullable vitals.attr column, idempotently', () => {
  const db = analyticsDb()
  const cols = (db.prepare(`PRAGMA table_info(vitals)`).all() as Array<{ name: string; notnull: number }>).map((c) => [c.name, c.notnull])
  assert.deepEqual(cols.find(([n]) => n === 'attr'), ['attr', 0])
  const last = ANALYTICS_MIGRATIONS[ANALYTICS_MIGRATIONS.length - 1]
  assert.equal(last.name, 'vitals-attribution')
  assert.doesNotThrow(() => last.up(db))
})

test('vitalAttributionSince groups per metric × page × element, worst first, with phase p75s', () => {
  const db = analyticsDb()
  const insert = db.prepare(`INSERT INTO vitals (ts, day, route, name, value, rating, device, nav, vkey, attr) VALUES (?, ?, ?, ?, ?, 'good', 'mobile', 'navigate', NULL, ?)`)
  const lcp = (el: string, loadTime: number, image = true) => JSON.stringify({ el, kind: image ? 'image' : 'text', ttfb: 100, loadDelay: 50, loadTime, renderDelay: 10 })
  for (const v of [1800, 2000, 4600, 5200]) insert.run(1, '2026-10-10', '/', 'LCP', v, lcp('main>img.hero-photo', v - 160))
  insert.run(1, '2026-10-10', '/blog', 'LCP', 1500, lcp('main>h1', 0, false))
  insert.run(1, '2026-10-01', '/old', 'LCP', 9000, lcp('main>img.old', 8000))
  insert.run(1, '2026-10-10', '/', 'LCP', 9999, '{not json')
  insert.run(1, '2026-10-10', '/', 'LCP', 9999, JSON.stringify({ el: 'has space', kind: 'image', ttfb: 1, loadDelay: 1, loadTime: 1, renderDelay: 1 }))
  insert.run(1, '2026-10-10', '/', 'INP', 320, JSON.stringify({ el: 'button#menu', type: 'pointer', inputDelay: 20, processing: 250, presentation: 50, state: 'complete' }))
  insert.run(1, '2026-10-10', '/', 'INP', 600, JSON.stringify({ el: 'button#menu', type: 'pointer', inputDelay: 40, processing: 500, presentation: 60, state: 'loading' }))
  insert.run(1, '2026-10-10', '/', 'CLS', 0.3, JSON.stringify({ el: 'main>figure', shift: 0.2, state: 'dom-content-loaded' }))
  insert.run(1, '2026-10-10', '/', 'FCP', 100, null)

  const rows = vitalAttributionSince(db, '2026-10-05')
  assert.deepEqual(rows.map((r) => [r.name, r.route, r.el]), [
    ['LCP', '/', 'main>img.hero-photo'],
    ['LCP', '/blog', 'main>h1'],
    ['INP', '/', 'button#menu'],
    ['CLS', '/', 'main>figure'],
  ])
  const hero = rows[0] as VitalAttributionRow
  assert.equal(hero.samples, 4)
  assert.equal(hero.poor, 2)
  assert.equal(hero.imageShare, 1)
  assert.deepEqual(Object.keys(hero.phases || {}), ['ttfb', 'loadDelay', 'loadTime', 'renderDelay'])
  assert.equal(rows[1].imageShare, 0)
  assert.equal(rows[2].type, 'pointer')
  assert.equal(rows[2].poor, 1)
  assert.equal(rows[3].state, 'dom-content-loaded')
  assert.equal(rows[3].phases, undefined)

  // At most ATTRIBUTION_ROWS_PER_METRIC groups per metric.
  for (let i = 0; i < ATTRIBUTION_ROWS_PER_METRIC + 4; i++) insert.run(1, '2026-10-10', `/p${i}`, 'LCP', 1000 + i, lcp(`main>img.n${i}`, 500))
  const capped = vitalAttributionSince(db, '2026-10-05').filter((r) => r.name === 'LCP')
  assert.equal(capped.length, ATTRIBUTION_ROWS_PER_METRIC)
  assert.equal(capped[0].el, 'main>img.hero-photo', 'the group with poor samples stays first')
})

test('phase segments, the dominant phase and the LCP kind label (admin view)', () => {
  const row = { name: 'LCP' as const, phases: { ttfb: 100, loadDelay: 0, loadTime: 300, renderDelay: 100 } }
  const segs = phaseSegments(row)
  assert.deepEqual(segs.map((s) => [s.key, s.share]), [['ttfb', 0.2], ['loadDelay', 0], ['loadTime', 0.6], ['renderDelay', 0.2]])
  assert.equal(segs[2].label, 'Load time')
  assert.equal(dominantPhase(row)?.key, 'loadTime')
  assert.deepEqual(phaseSegments({ name: 'CLS', phases: undefined }), [])
  assert.equal(dominantPhase({ name: 'INP', phases: { inputDelay: 0, processing: 0, presentation: 0 } }), null)
  assert.equal(lcpKindLabel(1), 'image')
  assert.equal(lcpKindLabel(0.1), 'text')
  assert.equal(lcpKindLabel(0.5), 'image or text')
  assert.equal(lcpKindLabel(undefined), null)
})

test('installWebVitals loads the attribution build once, after the load event and an idle moment, and not when tracking is off', async () => {
  const g = globalThis as Record<string, unknown>
  const saved = { window: g.window, document: g.document, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator') }
  const listeners: Record<string, Array<() => void>> = {}
  const idle: Array<() => void> = []
  const doc = { readyState: 'loading', visibilityState: 'visible', referrer: '', documentElement: { lang: 'en' }, addEventListener() {} }
  g.window = {
    location: { pathname: '/work/' },
    addEventListener: (type: string, fn: () => void) => (listeners[type] ||= []).push(fn),
    requestIdleCallback: (fn: () => void) => (idle.push(fn), 1),
    setTimeout,
  }
  g.document = doc
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { webdriver: false, doNotTrack: null, sendBeacon: () => true } })
  try {
    const mod = (await import(`../lib/analytics/client.ts?install=${Date.now()}`)) as typeof import('../lib/analytics/client')
    const subscribed: string[] = []
    let loads = 0
    const fake = async () => {
      loads++
      const on = (name: string) => () => subscribed.push(name)
      return { onLCP: on('LCP'), onINP: on('INP'), onCLS: on('CLS'), onFCP: on('FCP'), onTTFB: on('TTFB') }
    }
    mod.installWebVitals(fake)
    mod.installWebVitals(fake)
    assert.equal(loads, 0, 'nothing before the load event')
    assert.equal(listeners.load?.length, 1)
    listeners.load[0]()
    assert.equal(loads, 0, 'waits for an idle moment')
    idle.shift()?.()
    await new Promise((r) => setImmediate(r))
    assert.equal(loads, 1, 'loaded once')
    assert.deepEqual(subscribed, ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'])
  } finally {
    g.window = saved.window
    g.document = saved.document
    if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator)
  }

  // Do Not Track: nothing is loaded at all.
  g.window = { location: { pathname: '/' }, addEventListener: () => assert.fail('no listener'), setTimeout }
  g.document = { readyState: 'complete', visibilityState: 'visible', referrer: '', documentElement: { lang: 'en' }, addEventListener() {} }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { webdriver: false, doNotTrack: '1' } })
  try {
    const mod = (await import(`../lib/analytics/client.ts?dnt=${Date.now()}`)) as typeof import('../lib/analytics/client')
    mod.installWebVitals(async () => assert.fail('must not load') as never)
  } finally {
    g.window = saved.window
    g.document = saved.document
    if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator)
  }
})

test('Next’s bundled web-vitals attribution build has the entry points the client subscribes to', () => {
  const file = path.join(ROOT, 'node_modules/next/dist/compiled/web-vitals-attribution/web-vitals.attribution.js')
  const src = fs.readFileSync(file, 'utf8')
  for (const name of ['onLCP', 'onINP', 'onCLS', 'onFCP', 'onTTFB']) assert.match(src, new RegExp(`\\b${name}\\b`))
  for (const field of ['interactionTarget', 'largestShiftTarget', 'resourceLoadDuration', 'elementRenderDelay', 'processingDuration', 'presentationDelay']) {
    assert.ok(src.includes(field), `web-vitals attribution field ${field}`)
  }
})
