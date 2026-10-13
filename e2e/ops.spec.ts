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

type BeaconEvent = { t: string; route?: string; name?: string; value?: number; nav?: string | null }

test('a page view sends LCP / FCP / TTFB in a vitals beacon when the tab is hidden, without identifiers', async ({ page }) => {
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

  await page.goto('/', { waitUntil: 'load' })
  await expect.poll(() => events.some((e) => e.t === 'pv'), { message: 'page view beacon' }).toBe(true)

  // Hide the tab the way the browser does: visibilityState flips and
  // `visibilitychange` bubbles from the document (web-vitals reports the
  // final LCP / CLS then, and the client flushes its queue).
  const vitalNames = async () => {
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
    })
    return events.filter((e) => e.t === 'v').map((e) => e.name)
  }
  await expect.poll(vitalNames, { timeout: 20_000, message: 'vitals beacon' }).toEqual(expect.arrayContaining(['LCP', 'FCP', 'TTFB']))

  const vitals = events.filter((e) => e.t === 'v')
  for (const v of vitals) {
    expect(Object.keys(v).sort()).toEqual(['name', 'nav', 'route', 't', 'value'])
    expect(v.route).toBe('/')
    expect(['LCP', 'INP', 'CLS', 'FCP', 'TTFB']).toContain(v.name)
    expect(Number.isFinite(v.value)).toBe(true)
  }
  // One event per metric instance, even across repeated hide events.
  const names = vitals.map((v) => v.name)
  expect(new Set(names).size).toBe(names.length)
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
