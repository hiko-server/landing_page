import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

/**
 * Operations and security surface of a running build (desktop project only):
 * real-user Web Vitals reach the analytics beacon, /api/health tells the
 * public only its verdict, /.well-known/security.txt follows RFC 9116, and
 * the IndexNow rewrite matches nothing but the configured key.
 *
 * Safe against production: the analytics beacon is intercepted and answered
 * in the browser (it never reaches the server), everything else is a GET.
 */

type BeaconEvent = { t: string; route?: string; name?: string; value?: number; nav?: string | null; k?: string }

/** A web-vitals metric instance id: "v<version>-<page load time>-<random>" — it names a measurement, not a visitor. */
const INSTANCE_ID = /^v\d+-\d+-\d+$/

/** Intercepts the analytics beacon (answered in the browser) and collects its events; the client is made to see a visitor's browser. */
async function captureBeacons(page: Page): Promise<BeaconEvent[]> {
  // The client skips automated browsers (navigator.webdriver); look like a visitor's.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { configurable: true, get: () => false })
  })
  const events: BeaconEvent[] = []
  await page.route('**/api/a', async (route) => {
    const body = route.request().postData()
    if (body) {
      const parsed = JSON.parse(body) as BeaconEvent | BeaconEvent[]
      events.push(...(Array.isArray(parsed) ? parsed : [parsed]))
    }
    await route.fulfill({ status: 204 })
  })
  return events
}

/**
 * Hide or show the tab the way the browser does: visibilityState flips and
 * `visibilitychange` bubbles from the document (web-vitals reports the
 * final LCP / CLS on hide, and the client flushes what changed).
 */
async function setVisibility(page: Page, state: 'hidden' | 'visible'): Promise<void> {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s })
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
  }, state)
}

test('a page view sends LCP / FCP / TTFB in a vitals beacon when the tab is hidden, without visitor identifiers', async ({ page }) => {
  const events = await captureBeacons(page)
  await page.goto('/', { waitUntil: 'load' })
  await expect.poll(() => events.some((e) => e.t === 'pv'), { message: 'page view beacon' }).toBe(true)

  const vitalNames = async () => {
    await setVisibility(page, 'hidden')
    return events.filter((e) => e.t === 'v').map((e) => e.name)
  }
  await expect.poll(vitalNames, { timeout: 20_000, message: 'vitals beacon' }).toEqual(expect.arrayContaining(['LCP', 'FCP', 'TTFB']))

  const vitals = events.filter((e) => e.t === 'v')
  for (const v of vitals) {
    // The only id is the web-vitals instance id (random per page load and metric).
    expect(Object.keys(v).sort()).toEqual(['k', 'name', 'nav', 'route', 't', 'value'])
    expect(v.k).toMatch(INSTANCE_ID)
    expect(v.route).toBe('/')
    expect(['LCP', 'INP', 'CLS', 'FCP', 'TTFB']).toContain(v.name)
    expect(Number.isFinite(v.value)).toBe(true)
  }
  // Repeated hide events never re-send an unchanged value; one metric per instance id.
  const sent = vitals.map((v) => `${v.k}|${v.value}`)
  expect(new Set(sent).size).toBe(sent.length)
  for (const k of new Set(vitals.map((v) => v.k))) expect(new Set(vitals.filter((v) => v.k === k).map((v) => v.name)).size).toBe(1)
  for (const name of ['LCP', 'FCP', 'TTFB']) expect(vitals.filter((v) => v.name === name)).toHaveLength(1)
})

test('COR-1: a CLS that grows after the tab came back is sent again, latest value, same instance id', async ({ page }) => {
  const events = await captureBeacons(page)
  await page.goto('/', { waitUntil: 'load' })
  await expect.poll(() => events.some((e) => e.t === 'pv'), { message: 'page view beacon' }).toBe(true)
  const cls = () => events.filter((e) => e.t === 'v' && e.name === 'CLS')

  // First hide: the CLS so far (usually 0) goes out.
  await expect
    .poll(
      async () => {
        await setVisibility(page, 'hidden')
        return cls().length
      },
      { timeout: 20_000, message: 'first CLS report' },
    )
    .toBeGreaterThan(0)
  const [first] = cls()
  expect(first.k).toMatch(INSTANCE_ID)

  // Back to the tab; content in the viewport moves without any input — a layout shift.
  await setVisibility(page, 'visible')
  await page.evaluate(() => {
    const block = document.createElement('div')
    block.style.height = '320px'
    document.body.prepend(block)
  })
  await page.waitForTimeout(500)

  // Next hide: the same instance, reported again with its larger, final value.
  await expect
    .poll(
      async () => {
        await setVisibility(page, 'hidden')
        return cls().length
      },
      { timeout: 10_000, message: 'CLS re-reported after the layout shift' },
    )
    .toBe(2)
  const [, again] = cls()
  expect(again.k).toBe(first.k)
  expect(again.value!).toBeGreaterThan(first.value!)
  // Hiding again with nothing new sends nothing more.
  await setVisibility(page, 'hidden')
  await page.waitForTimeout(300)
  expect(cls()).toHaveLength(2)
})

test('/api/health answers the public with the verdict only', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  const body = (await res.json()) as Record<string, unknown>
  expect(Object.keys(body)).toEqual(['status'])
  expect(['ok', 'empty']).toContain(body.status)
  expect(res.headers()['cache-control']).toContain('no-store')
})

test('/.well-known/security.txt follows RFC 9116 (absent only while the CV hides the e-mail)', async ({ request }) => {
  const res = await request.get('/.well-known/security.txt')
  const text = await res.text()
  if (res.status() === 404) {
    expect(text).not.toContain('Contact:')
    return
  }
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toBe('text/plain; charset=utf-8')
  expect(text).toMatch(/^Contact: mailto:[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/m)
  expect(text).toMatch(/^Preferred-Languages: en, zh$/m)
  expect(text).toMatch(/^Canonical: https:\/\/[^/\s]+\/\.well-known\/security\.txt$/m)
  expect(text).toMatch(/^Policy: https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/blob\/main\/SECURITY\.md$/m)
  const expires = Date.parse(/^Expires: (\S+)$/m.exec(text)?.[1] ?? '')
  const daysLeft = (expires - Date.now()) / 86_400_000
  expect(daysLeft).toBeGreaterThan(170)
  expect(daysLeft).toBeLessThan(366)
})

test('a root .txt that is not the configured IndexNow key is not rewritten', async ({ request }) => {
  const res = await request.get('/e2e0not0the0indexnow0key0000.txt', { maxRedirects: 0 })
  expect(res.status()).toBe(404)
})
