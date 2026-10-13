/**
 * FIX-07: real-user Web Vitals reach the analytics beacon.
 *
 * Next 15 hands a legacy `reportWebVitals` export in pages/_app only its own
 * User Timing measures, so vitals are collected through next/web-vitals'
 * useReportWebVitals with a stable callback (lib/analytics/client.ts).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createVitalsCollector, type WebVitalMetric } from '../lib/analytics/client'
import { parseEvents } from '../lib/analytics/ingest'

const metric = (over: Partial<WebVitalMetric> = {}): WebVitalMetric => ({ id: 'v4-1-1', name: 'LCP', value: 1234.5, navigationType: 'navigate', ...over })

test('the collector keeps the LATEST value per metric instance (id) with the metric navigation type', () => {
  const c = createVitalsCollector('/blog')
  assert.equal(c.add(metric()), true)
  // web-vitals reports a CLS / INP instance again on every hide with a new value: the later value wins.
  assert.equal(c.add(metric({ id: 'v4-1-2', name: 'CLS', value: 0.02, navigationType: 'back-forward-cache' })), true)
  assert.equal(c.add(metric({ id: 'v4-1-2', name: 'CLS', value: 0.31, navigationType: 'navigate' })), true)
  assert.equal(c.add(metric({ id: 'v4-1-2', name: 'CLS', value: 0.31 })), false, 'an unchanged repeat is ignored')
  assert.equal(c.add(metric({ id: 'v4-1-3', name: 'TTFB', value: 80, navigationType: 'back_forward' })), true)
  assert.deepEqual(c.drain(), [
    [
      { t: 'v', route: '/blog', name: 'LCP', value: 1234.5, nav: 'navigate', k: 'v4-1-1' },
      // The larger later value is kept, in the instance's first position, with its first navigation type.
      { t: 'v', route: '/blog', name: 'CLS', value: 0.31, nav: 'back-forward-cache', k: 'v4-1-2' },
      { t: 'v', route: '/blog', name: 'TTFB', value: 80, nav: 'back-forward', k: 'v4-1-3' },
    ],
  ])
  assert.deepEqual(c.drain(), [], 'drain empties the queue')
  // An already sent value is not sent again…
  assert.equal(c.add(metric({ id: 'v4-1-2', name: 'CLS', value: 0.31 })), false)
  assert.deepEqual(c.drain(), [])
  // …but a CLS that grew after it was sent is: the same instance (k), the new value.
  assert.equal(c.add(metric({ id: 'v4-1-2', name: 'CLS', value: 0.45 })), true)
  assert.deepEqual(c.drain(), [[{ t: 'v', route: '/blog', name: 'CLS', value: 0.45, nav: 'back-forward-cache', k: 'v4-1-2' }]])
  // An id reused under another metric name is not a re-report of that instance.
  assert.equal(c.add(metric({ id: 'v4-1-2', name: 'INP', value: 200 })), false)
})

test('FID, unknown names, non-finite values and unmeasured routes are ignored; the fallback nav is used only when needed', () => {
  const c = createVitalsCollector('/')
  assert.equal(c.add(metric({ id: 'a', name: 'FID', value: 3 })), false)
  assert.equal(c.add(metric({ id: 'b', name: 'hydration', value: 3 })), false)
  assert.equal(c.add(metric({ id: 'c', value: Number.NaN })), false)
  assert.equal(c.add(metric({ id: 'd', value: Number.POSITIVE_INFINITY })), false)
  assert.equal(c.add(metric({ id: '' })), false)
  let asked = 0
  assert.equal(
    c.add(metric({ id: 'e', name: 'INP', value: 120, navigationType: undefined }), () => {
      asked++
      return 'reload'
    }),
    true,
  )
  assert.equal(c.add(metric({ id: 'f', name: 'FCP', value: 300 }), () => (asked++, 'reload')), true)
  assert.equal(asked, 1)
  assert.deepEqual(c.drain()[0].map((e) => [e.name, e.nav]), [['INP', 'reload'], ['FCP', 'navigate']])

  const none = createVitalsCollector(null)
  assert.equal(none.add(metric()), false)
  assert.deepEqual(none.drain(), [])
})

test('batches hold at most 10 events, and every event passes the ingest parser unchanged (no identifiers)', () => {
  const c = createVitalsCollector('/about')
  for (let i = 0; i < 23; i++) c.add(metric({ id: `id-${i}`, name: i % 2 ? 'FCP' : 'TTFB', value: 100 + i }))
  const batches = c.drain()
  assert.deepEqual(batches.map((b) => b.length), [10, 10, 3])
  // No visitor identifiers: the only id is the web-vitals instance id (random per page load and metric).
  for (const event of batches.flat()) assert.deepEqual(Object.keys(event).sort(), ['k', 'name', 'nav', 'route', 't', 'value'])
  const parsed = parseEvents(JSON.stringify(batches[0]))
  assert.equal(parsed.length, 10)
  assert.ok(parsed.every((e) => e.t === 'v' && e.route === '/about'))
  assert.deepEqual(
    parsed.map((e) => (e.t === 'v' ? e.key : null)),
    batches[0].map((e) => e.k),
    'ingest reads the instance id',
  )
})

test('reportWebVital queues the landing page vitals and flushes them in one beacon when the tab is hidden', async () => {
  const listeners: Record<string, Array<() => void>> = {}
  const beacons: Array<{ url: string; body: string }> = []
  const g = globalThis as Record<string, unknown>
  const saved = { window: g.window, document: g.document, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), performance: g.performance }
  const doc = { visibilityState: 'visible', referrer: '', documentElement: { lang: 'en' }, addEventListener() {} }
  g.window = {
    location: { pathname: '/blog/' },
    addEventListener: (type: string, fn: () => void) => (listeners[type] ||= []).push(fn),
  }
  g.document = doc
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { webdriver: false, doNotTrack: null, sendBeacon: (url: string, body: string) => (beacons.push({ url, body }), true) },
  })
  try {
    const { reportWebVital } = await import(`../lib/analytics/client.ts?vitals=${Date.now()}`)
    reportWebVital(metric({ id: 'ttfb', name: 'TTFB', value: 90 }))
    reportWebVital(metric({ id: 'fcp', name: 'FCP', value: 800 }))
    reportWebVital(metric({ id: 'fcp', name: 'FCP', value: 800 }))
    assert.equal(beacons.length, 0, 'nothing is sent while the page is visible')
    assert.equal(listeners.visibilitychange?.length, 1, 'one window listener, registered once')
    assert.equal(listeners.pagehide?.length, 1)
    // The final LCP / CLS arrive in the same hide event, before this listener runs.
    reportWebVital(metric({ id: 'lcp', name: 'LCP', value: 1500 }))
    reportWebVital(metric({ id: 'cls', name: 'CLS', value: 0, navigationType: 'reload' }))
    doc.visibilityState = 'hidden'
    listeners.visibilitychange[0]()
    assert.equal(beacons.length, 1)
    assert.equal(beacons[0].url, '/api/a')
    assert.deepEqual(JSON.parse(beacons[0].body), [
      { t: 'v', route: '/blog', name: 'TTFB', value: 90, nav: 'navigate', k: 'ttfb' },
      { t: 'v', route: '/blog', name: 'FCP', value: 800, nav: 'navigate', k: 'fcp' },
      { t: 'v', route: '/blog', name: 'LCP', value: 1500, nav: 'navigate', k: 'lcp' },
      { t: 'v', route: '/blog', name: 'CLS', value: 0, nav: 'reload', k: 'cls' },
    ])
    listeners.pagehide[0]()
    assert.equal(beacons.length, 1, 'an empty queue sends nothing')

    // Back to the tab: layout shifts and a slow interaction happen after the first hide.
    doc.visibilityState = 'visible'
    listeners.visibilitychange[0]()
    assert.equal(beacons.length, 1)
    // web-vitals reports the same CLS instance again (larger) and the INP on the next hide.
    reportWebVital(metric({ id: 'cls', name: 'CLS', value: 0.18, navigationType: 'reload' }))
    reportWebVital(metric({ id: 'inp', name: 'INP', value: 350 }))
    doc.visibilityState = 'hidden'
    listeners.visibilitychange[0]()
    assert.equal(beacons.length, 2, 'the final CLS / INP are sent on the next hide')
    assert.deepEqual(JSON.parse(beacons[1].body), [
      { t: 'v', route: '/blog', name: 'CLS', value: 0.18, nav: 'reload', k: 'cls' },
      { t: 'v', route: '/blog', name: 'INP', value: 350, nav: 'navigate', k: 'inp' },
    ])
    // pagehide right after (unload): nothing new, nothing re-sent.
    listeners.pagehide[0]()
    assert.equal(beacons.length, 2)
    // A last INP update that arrives at unload goes out on pagehide.
    reportWebVital(metric({ id: 'inp', name: 'INP', value: 420 }))
    listeners.pagehide[0]()
    assert.equal(beacons.length, 3)
    assert.deepEqual(JSON.parse(beacons[2].body), [{ t: 'v', route: '/blog', name: 'INP', value: 420, nav: 'navigate', k: 'inp' }])
  } finally {
    g.window = saved.window
    g.document = saved.document
    g.performance = saved.performance
    if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator)
  }
})

test('pages/_app subscribes through useReportWebVitals with the module-level callback (no legacy export)', () => {
  const app = fs.readFileSync(path.join(process.cwd(), 'pages/_app.tsx'), 'utf8')
  assert.match(app, /import \{ useReportWebVitals \} from 'next\/web-vitals'/)
  assert.match(app, /useReportWebVitals\(reportWebVital\)/)
  assert.doesNotMatch(app, /export \{ reportWebVitals \}|export function reportWebVitals/)
})
