import type { Browser, Page } from '@playwright/test'
import { test, expect, seriousA11yViolations } from './fixtures'

/**
 * G7 — performance and layout gates on realistic content: the synthetic CI
 * fixture store (e2e/fixtures/store, installed with
 * scripts/ci/fixture-store.mjs before the build). They run only when the
 * server under test serves that store (E2E_FIXTURE=1, checked against the
 * page) — against real content the thresholds would gate the owner's
 * writing, not the code.
 *
 *   - layout: no horizontal scroll at 375 / 768 / 1440 px once every lazy
 *     section has mounted (Chromium, WebKit on an iPhone, Firefox);
 *   - Core Web Vitals on a mid-range phone profile (Chromium, a 1.6 Mbps /
 *     150 ms network and a CPU slowdown calibrated so every runner emulates
 *     the same phone — 4× on the reference machine, less on a slower one):
 *     the median of three cold loads per page; CLS ≤ 0.05 and Total Blocking
 *     Time ≤ 200 ms fail the build, LCP over 2.5 s is reported as a warning
 *     (it depends on the runner's network). TBT is measured from the long
 *     tasks the page really runs (not Lighthouse's simulation); the home page,
 *     the heaviest, measures ~150 ms (almost all of it React hydration) both
 *     on macOS and in the Linux CI image. Tagged @cwv: CI runs it on its own
 *     (one worker), since parallel tests would steal its CPU;
 *   - images: no same-site image over 200 KB, none decoded at more than
 *     twice the pixels it is shown at;
 *   - accessibility of the article: serious / critical axe violations fail,
 *     moderate ones are reported.
 */

const FIXTURE = process.env.E2E_FIXTURE === '1'

/**
 * Each test context is its own visitor (a TEST-NET-3 address in
 * cf-connecting-ip, believed from a loopback peer like Cloudflare's): the
 * contact form's human-check nonce is rate-limited per visitor (20 per 5
 * minutes), and the gates load /contact more often than that.
 */
let visitors = 0
const visitorHeaders = () => ({ 'cf-connecting-ip': `203.0.113.${(visitors++ % 250) + 1}` })
const FIXTURE_NAME = 'Example Person'

const GATE_PAGES = ['/', '/about', '/blog', '/blog/example-field-notes', '/blog/example-short-note', '/work', '/work/example-sorting-station', '/cv', '/cv/zh', '/contact']

const GATES = { cls: 0.05, tbtMs: 200, lcpWarnMs: 2500, imageKb: 200, overDecode: 2 }

/**
 * The benchmark below (ms) on the reference machine, where a 4× slowdown is
 * the target phone. A plain arithmetic loop is no measure (JIT and CPU
 * features make it 2.5× faster on Linux Arm than on macOS while real pages
 * run slower); the benchmark does what pages do: allocate, serialise, sort,
 * match and lay out DOM.
 */
const REFERENCE_BENCHMARK_MS = 32
const REFERENCE_SLOWDOWN = 4

test.describe('@gate fixture store', () => {
  test.skip(!FIXTURE, 'gates run on the synthetic fixture store only (E2E_FIXTURE=1)')

  test.beforeAll(async ({ request }) => {
    const html = await (await request.get('/')).text()
    if (!html.includes(FIXTURE_NAME)) throw new Error(`E2E_FIXTURE=1 but the server does not serve the fixture store (no "${FIXTURE_NAME}" on /)`)
  })

  /** Scroll to the end in steps (lazy sections and images mount), then back to the top. */
  async function scrollThrough(page: Page) {
    await page.evaluate(async () => {
      const step = Math.max(200, Math.round(window.innerHeight * 0.8))
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 120))
      }
      window.scrollTo(0, document.documentElement.scrollHeight)
      await new Promise((r) => setTimeout(r, 400))
    })
  }

  for (const width of [375, 768, 1440]) {
    test(`@gate layout: no horizontal scroll on the fixture pages at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      const offenders: string[] = []
      for (const path of GATE_PAGES) {
        await page.setExtraHTTPHeaders(visitorHeaders())
        await page.goto(path, { waitUntil: 'load' })
        await scrollThrough(page)
        const result = await page.evaluate(() => {
          const doc = document.documentElement
          const overflow = doc.scrollWidth - doc.clientWidth
          let widest = ''
          if (overflow > 1) {
            let right = doc.clientWidth
            for (const el of Array.from(document.body.querySelectorAll('*'))) {
              const r = el.getBoundingClientRect()
              if (r.right > right + 1 && getComputedStyle(el).position !== 'fixed') {
                right = r.right
                widest = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${Array.from(el.classList).slice(0, 2).join('.')}` : ''}`
              }
            }
          }
          return { overflow, widest }
        })
        if (result.overflow > 1) offenders.push(`${path}: ${result.overflow}px wider (${result.widest || 'unknown element'})`)
      }
      expect(offenders).toEqual([])
    })
  }

  test('@gate images: none over 200 KB, none decoded far larger than shown', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'resource sizes: Chromium reports them')
    const problems: string[] = []
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      for (const path of GATE_PAGES) {
        await page.setExtraHTTPHeaders(visitorHeaders())
        await page.goto(path, { waitUntil: 'load' })
        await scrollThrough(page)
        await page.waitForTimeout(300)
        const found = await page.evaluate(
          ({ imageKb, overDecode }) => {
            const out: string[] = []
            for (const e of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
              if (e.initiatorType !== 'img' || new URL(e.name).origin !== location.origin) continue
              if (e.encodedBodySize > imageKb * 1024) out.push(`${new URL(e.name).pathname} is ${Math.round(e.encodedBodySize / 1024)} KB`)
            }
            for (const img of Array.from(document.images)) {
              if (!img.complete || !img.naturalWidth || !img.currentSrc || new URL(img.currentSrc).origin !== location.origin) continue
              const r = img.getBoundingClientRect()
              if (r.width < 24) continue
              const needed = r.width * devicePixelRatio
              // Only an image with a smaller candidate available counts (an original narrower than every variant is what it is).
              if (img.srcset && img.naturalWidth > needed * overDecode && img.naturalWidth > 480) {
                out.push(`${new URL(img.currentSrc).pathname}: ${img.naturalWidth}px decoded for ${Math.round(needed)}px`)
              }
            }
            return out
          },
          { imageKb: GATES.imageKb, overDecode: GATES.overDecode },
        )
        problems.push(...found.map((f) => `${path} @${width}: ${f}`))
      }
    }
    expect(Array.from(new Set(problems))).toEqual([])
  })

  test('@gate accessibility: the fixture article has no serious or critical axe violations (moderate ones reported)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'axe: once is enough')
    const { default: AxeBuilder } = await import('@axe-core/playwright')
    for (const path of ['/blog/example-field-notes', '/work/example-sorting-station']) {
      await page.goto(path, { waitUntil: 'load' })
      await scrollThrough(page)
      expect(await seriousA11yViolations(page), path).toEqual([])
      const moderate = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations.filter((v) => v.impact === 'moderate')
      for (const v of moderate) testInfo.annotations.push({ type: 'warning', description: `${path}: ${v.id} — ${v.help} (${v.nodes.length})` })
    }
  })

  test('@gate @cwv Core Web Vitals on a mid-range phone: CLS ≤ 0.05, TBT ≤ 200 ms (LCP > 2.5 s is a warning)', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'CPU and network throttling: Chromium only')
    test.setTimeout(600_000)
    const slowdown = await calibratedSlowdown(browser)
    const results: string[] = [`CPU slowdown ${slowdown.toFixed(2)}×`]
    const failures: string[] = []
    for (const path of GATE_PAGES) {
      const runs: Vitals[] = []
      for (let i = 0; i < 3; i++) runs.push(await measureVitals(browser, testInfo.project.use.baseURL || '', path, slowdown))
      const median = (pick: (v: Vitals) => number) => runs.map(pick).sort((a, b) => a - b)[1]
      const m: Vitals = { cls: median((v) => v.cls), tbt: median((v) => v.tbt), lcp: median((v) => v.lcp), shifts: runs.flatMap((v) => v.shifts).slice(0, 5) }
      results.push(`${path}: CLS ${m.cls.toFixed(3)}, TBT ${Math.round(m.tbt)} ms, LCP ${Math.round(m.lcp)} ms`)
      if (m.cls > GATES.cls) failures.push(`${path}: CLS ${m.cls.toFixed(3)} > ${GATES.cls}${m.shifts.length ? ` (${m.shifts.join(', ')})` : ''}`)
      if (m.tbt > GATES.tbtMs) failures.push(`${path}: TBT ${Math.round(m.tbt)} ms > ${GATES.tbtMs} ms`)
      if (m.lcp > GATES.lcpWarnMs) testInfo.annotations.push({ type: 'warning', description: `${path}: LCP ${Math.round(m.lcp)} ms > ${GATES.lcpWarnMs} ms` })
    }
    testInfo.annotations.push({ type: 'vitals', description: results.join(' · ') })
    expect(failures).toEqual([])
  })
})

type Vitals = { cls: number; tbt: number; lcp: number; shifts: string[] }

/** The CPU slowdown that makes this machine run like the reference one at REFERENCE_SLOWDOWN×. */
async function calibratedSlowdown(browser: Browser): Promise<number> {
  const page = await browser.newPage()
  try {
    const runs: number[] = []
    for (let i = 0; i < 5; i++) {
      runs.push(
        await page.evaluate(() => {
          const t = performance.now()
          const items: Array<{ id: number; name: string; tags: string[]; v: number }> = []
          for (let n = 0; n < 60_000; n++) items.push({ id: n, name: `item-${(n * 7919) % 100_000}`, tags: [`a${n % 13}`, `b${n % 7}`], v: n / 3 })
          const back = JSON.parse(JSON.stringify(items)) as typeof items
          back.sort((a, b) => (a.name < b.name ? -1 : 1))
          let matches = 0
          for (const o of back) if (/item-1\d{3}$/.test(o.name)) matches++
          const host = document.createElement('div')
          document.body.append(host)
          for (let n = 0; n < 3000; n++) {
            const row = document.createElement('div')
            row.className = `c${n % 20}`
            row.textContent = `row ${n}`
            row.style.padding = `${n % 5}px`
            host.append(row)
          }
          void host.offsetHeight
          host.remove()
          return performance.now() - t + (matches < 0 ? 1 : 0)
        }),
      )
    }
    const ms = Math.min(...runs)
    return Math.min(8, Math.max(1, (REFERENCE_SLOWDOWN * REFERENCE_BENCHMARK_MS) / ms))
  } finally {
    await page.close()
  }
}

/**
 * One cold load of `path` on a throttled Pixel 7 (`slowdown`× CPU), scrolled to the end:
 * CLS (largest session window, as web-vitals computes it), TBT (long tasks
 * after the first contentful paint, until the page has been idle) and LCP.
 */
async function measureVitals(browser: Browser, baseURL: string, path: string, slowdown: number): Promise<Vitals> {
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: visitorHeaders(),
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  })
  const page = await context.newPage()
  try {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: slowdown })
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 })
    await page.addInitScript(() => {
      type Shift = PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: Array<{ node?: Node | null }> }
      const w = window as unknown as { __v: { windows: number[]; current: number; first: number; last: number; long: Array<[number, number]>; lcp: number; fcp: number; shifts: string[] } }
      w.__v = { windows: [], current: 0, first: 0, last: 0, long: [], lcp: 0, fcp: 0, shifts: [] }
      const v = w.__v
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as Shift[]) {
          if (e.hadRecentInput) continue
          if (v.current && e.startTime - v.last < 1000 && e.startTime - v.first < 5000) v.current += e.value
          else {
            if (v.current) v.windows.push(v.current)
            v.current = e.value
            v.first = e.startTime
          }
          v.last = e.startTime
          const node = e.sources?.[0]?.node as Element | undefined
          if (node && e.value > 0.005) v.shifts.push(`${node.nodeName?.toLowerCase?.() || '?'}${node.id ? `#${node.id}` : ''} ${e.value.toFixed(3)}`)
        }
      }).observe({ type: 'layout-shift', buffered: true })
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) v.long.push([e.startTime, e.duration])
      }).observe({ type: 'longtask', buffered: true })
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) v.lcp = Math.max(v.lcp, e.startTime)
      }).observe({ type: 'largest-contentful-paint', buffered: true })
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') v.fcp = e.startTime
      }).observe({ type: 'paint', buffered: true })
    })
    await page.goto(path, { waitUntil: 'load', timeout: 90_000 })
    // Quiet for 2 s after load: the end of the blocking window (an approximation of TTI).
    await page.waitForTimeout(2000)
    const loadPhase = await page.evaluate(() => {
      const v = (window as unknown as { __v: { long: Array<[number, number]>; lcp: number; fcp: number } }).__v
      const tbt = v.long.filter(([start]) => start >= v.fcp).reduce((sum, [, d]) => sum + Math.max(0, d - 50), 0)
      return { tbt, lcp: v.lcp }
    })
    // Scrolling through mounts the lazy sections and images: their shifts count too.
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 500) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 250))
      }
    })
    await page.waitForTimeout(1000)
    const cls = await page.evaluate(() => {
      const v = (window as unknown as { __v: { windows: number[]; current: number; shifts: string[] } }).__v
      return { cls: Math.max(v.current, ...v.windows, 0), shifts: v.shifts.slice(0, 5) }
    })
    return { cls: cls.cls, tbt: loadPhase.tbt, lcp: loadPhase.lcp, shifts: cls.shifts }
  } finally {
    await context.close()
  }
}
