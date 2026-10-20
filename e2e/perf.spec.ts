import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect, loginAsAdmin, settle } from './fixtures'

/**
 * Performance stream (wave 2B): font subsets (G3), the JavaScript diet (G5),
 * AVIF / small variants and blur-up placeholders (G4, C8) and Web Vitals
 * attribution (G6), on a running build with whatever content it has (tests
 * that need an article with images skip on an empty store). The CI gates on
 * the synthetic fixture store are e2e/gates.spec.ts and e2e/visual.spec.ts.
 *
 * Safe against production except the @admin test (which writes one
 * synthetic measurement into the analytics store).
 */

const chromiumOnly = (project: string) => project !== 'chromium'

/** Same-origin article paths listed on /blog and /work. */
async function articlePaths(request: APIRequestContext): Promise<string[]> {
  const out: string[] = []
  for (const index of ['/blog', '/work']) {
    const html = await (await request.get(index)).text()
    for (const m of html.matchAll(/href="(\/(?:blog|work)\/[a-z0-9][a-z0-9-]*)"/g)) if (!out.includes(m[1])) out.push(m[1])
  }
  return out
}

/** The first article whose body has an image with an AVIF source and a blur placeholder. */
async function articleWithVariants(request: APIRequestContext): Promise<string | null> {
  for (const path of await articlePaths(request)) {
    const html = await (await request.get(path)).text()
    if (/<source type="image\/avif"/.test(html) && /data-lqip=/.test(html) && /id="article-body"/.test(html)) return path
  }
  return null
}

test.describe('G3 font subsets', () => {
  test('an English page loads only the preloaded Latin cores; Greek letters fetch the sans extension on demand', async ({ page }, testInfo) => {
    test.skip(chromiumOnly(testInfo.project.name), 'font loading: once is enough')
    await page.goto('/colophon')
    await settle(page)
    const faces = () =>
      page.evaluate(() => {
        const covers = (range: string, cp: number) =>
          range.split(',').some((part) => {
            const [a, b] = part.trim().replace(/^U\+/i, '').split('-')
            return cp >= parseInt(a, 16) && cp <= parseInt(b || a, 16)
          })
        return Array.from(document.fonts).map((f) => ({
          family: f.family.replace(/['"]/g, ''),
          status: f.status,
          latin: covers(f.unicodeRange, 0x61),
          greek: covers(f.unicodeRange, 0x3bc),
        }))
      })
    for (const family of ['sans', 'sansItalic', 'mono']) {
      const own = (await faces()).filter((f) => f.family === family)
      expect(own, `${family}: a Latin core and an extension under one family`).toHaveLength(2)
      expect(own.filter((f) => f.latin && !f.greek), `${family}: the core`).toHaveLength(1)
      expect(own.filter((f) => f.greek && !f.latin), `${family}: the extension`).toHaveLength(1)
    }
    const before = await faces()
    expect(before.find((f) => f.family === 'sans' && f.latin)?.status).toBe('loaded')
    for (const f of before.filter((x) => ['sans', 'sansItalic', 'mono'].includes(x.family) && x.greek && !x.latin)) {
      expect(f.status, `${f.family} extension untouched by an English page`).toBe('unloaded')
    }
    const woff2 = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.endsWith('.woff2')).map((e) => e.name))
    expect(woff2.filter((u) => /\.p\.woff2$/.test(u)), 'the two preloaded cores').toHaveLength(2)

    // μ Ω π: the sans extension downloads and renders them in Geist.
    await page.evaluate(async () => {
      const p = document.createElement('p')
      p.id = 'g3-greek'
      p.textContent = 'μ Ω π'
      document.querySelector('main')?.append(p)
      await document.fonts.load('16px sans', 'μΩπ')
    })
    await expect.poll(async () => (await faces()).find((f) => f.family === 'sans' && f.greek)?.status).toBe('loaded')
    const after = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.endsWith('.woff2')).length)
    expect(after).toBeGreaterThan(woff2.length)
  })
})

test.describe('G5 JavaScript diet', () => {
  test('the toast host is not in the server HTML, mounts after load with its live regions, and toasts still show', async ({ page, request, context }, testInfo) => {
    test.skip(chromiumOnly(testInfo.project.name), 'once is enough')
    const html = await (await request.get('/cv')).text()
    expect(html).not.toContain('chakra-toast-manager')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/cv')
    await settle(page)
    const region = page.locator('#chakra-toast-manager-bottom')
    await expect(region).toBeAttached({ timeout: 15_000 })
    await expect(region).toHaveAttribute('aria-live', 'polite')
    await page.keyboard.press('ControlOrMeta+KeyK')
    await page.getByRole('combobox', { name: /search/i }).fill('copy link')
    await page.getByRole('option').first().click()
    const toast = region.locator('.chakra-toast [role="status"]').first()
    await expect(toast).toBeVisible()
    await expect(toast).toContainText(/copied/i)
  })

  test('the image viewer loads on demand and opens, steps and closes', async ({ page, request }, testInfo) => {
    test.skip(chromiumOnly(testInfo.project.name), 'once is enough')
    let path: string | null = null
    for (const p of await articlePaths(request)) {
      if (/class="[^"]*article-figure/.test(await (await request.get(p)).text())) {
        path = p
        break
      }
    }
    test.skip(!path, 'no published article with figures in this store')
    await page.goto(path!)
    await settle(page)
    const zoom = page.locator('#article-body .zoomable').first()
    await zoom.scrollIntoViewIfNeeded()
    await zoom.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('img').first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })
})

test.describe('G4 / C8 images', () => {
  test('article images: AVIF source, WebP srcset, blurred placeholder while loading, then the image — without layout shift', async ({ page, request }, testInfo) => {
    test.skip(chromiumOnly(testInfo.project.name), 'once is enough')
    const path = await articleWithVariants(request)
    test.skip(!path, 'no article with AVIF variants and placeholders yet (run the media optimisation)')
    // Hold every article image until the placeholder has been looked at.
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    await page.route(/\/uploads\/[^/]+\.(avif|webp|png|jpe?g)$/, async (route) => {
      if (/\.w16\.webp$/.test(route.request().url())) return route.continue()
      await held
      await route.continue()
    })
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number }
      w.__cls = 0
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) w.__cls += e.value
      }).observe({ type: 'layout-shift', buffered: true })
    })
    await page.goto(path!, { waitUntil: 'domcontentloaded' })
    const img = page.locator('#article-body img[data-lqip]').first()
    await img.scrollIntoViewIfNeeded()
    await expect(img).toHaveAttribute('data-lqip', 'pending')
    expect(await img.evaluate((el) => getComputedStyle(el).opacity)).toBe('0')
    const frame = img.locator('xpath=ancestor::span[1]')
    expect(await frame.evaluate((el) => (el as HTMLElement).style.backgroundImage)).toMatch(/^url\("data:image\/svg\+xml/)
    const source = page.locator('#article-body picture source[type="image/avif"]').first()
    expect(await source.getAttribute('srcset')).toMatch(/\.avif \d+w/)
    expect(await img.getAttribute('srcset')).toMatch(/\.webp \d+w/)
    const box = await img.boundingBox()

    release()
    await expect(img).toHaveAttribute('data-lqip', /reveal|shown/)
    await expect(img).toHaveAttribute('data-lqip', 'shown')
    expect(await img.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
    expect(await frame.evaluate((el) => (el as HTMLElement).style.backgroundImage), 'the placeholder is gone once loaded').toBe('')
    expect(await img.evaluate((el) => (el as HTMLImageElement).currentSrc)).toMatch(/\.avif$/)
    // The box was reserved before the file arrived (a variant's rounded height may differ by a fraction of a pixel).
    const after = await img.boundingBox()
    for (const k of ['x', 'y', 'width', 'height'] as const) expect(Math.abs((after?.[k] ?? 0) - (box?.[k] ?? 0)), k).toBeLessThan(1)
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.01)
  })

  test('an image already in the cache is never faded', async ({ page, request }, testInfo) => {
    test.skip(chromiumOnly(testInfo.project.name), 'once is enough')
    const path = await articleWithVariants(request)
    test.skip(!path, 'no article with AVIF variants and placeholders yet')
    await page.goto(path!)
    await page.evaluate(() => document.querySelector('#article-body img[data-lqip]')?.scrollIntoView())
    await expect(page.locator('#article-body img[data-lqip]').first()).toHaveAttribute('data-lqip', 'shown')
    await page.reload()
    const states = await page.evaluate(
      () =>
        new Promise<string[]>((resolve) => {
          const img = document.querySelector('#article-body img[data-lqip]')
          if (!img) return resolve([])
          const seen = [img.getAttribute('data-lqip') || '']
          new MutationObserver(() => seen.push(img.getAttribute('data-lqip') || '')).observe(img, { attributes: true, attributeFilter: ['data-lqip'] })
          img.scrollIntoView()
          setTimeout(() => resolve(seen), 1500)
        }),
    )
    expect(states).not.toContain('reveal')
  })
})

type BeaconEvent = { t: string; route?: string; name?: string; value?: number; nav?: string | null; k?: string; a?: Record<string, unknown> }

async function captureBeacons(page: Page): Promise<BeaconEvent[]> {
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

const SELECTOR = /^[A-Za-z0-9#._>-]{1,120}$/

test.describe('G6 Web Vitals attribution', () => {
  test('LCP and CLS reports carry their attribution: a selector of the site’s markup and phase timings, nothing else', async ({ page }, testInfo) => {
    test.skip(chromiumOnly(testInfo.project.name), 'web-vitals attribution: Chromium reports LCP / CLS')
    const events = await captureBeacons(page)
    await page.goto('/', { waitUntil: 'load' })
    const hide = async () => {
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
        document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
      })
      return events.filter((e) => e.t === 'v').map((e) => e.name)
    }
    await expect.poll(hide, { timeout: 20_000 }).toEqual(expect.arrayContaining(['LCP', 'CLS']))
    const lcp = events.find((e) => e.name === 'LCP')!
    expect(Object.keys(lcp.a || {}).sort()).toEqual(['el', 'kind', 'loadDelay', 'loadTime', 'renderDelay', 'ttfb'])
    expect(lcp.a!.el === null || SELECTOR.test(String(lcp.a!.el))).toBe(true)
    for (const k of ['ttfb', 'loadDelay', 'loadTime', 'renderDelay']) expect(Number.isInteger(lcp.a![k])).toBe(true)
    expect(['image', 'text']).toContain(lcp.a!.kind)
    const cls = events.find((e) => e.name === 'CLS')!
    expect(Object.keys(cls.a || {}).sort()).toEqual(['el', 'shift', 'state'])
    for (const e of events.filter((x) => x.name === 'FCP' || x.name === 'TTFB')) expect(e.a).toBeUndefined()
  })

  test('@admin the analytics panel shows where LCP comes from, per page and element, with its phases', async ({ page, request }) => {
    const probe = `main#main>img.e2e-g6-${Date.now().toString(36)}`
    const res = await request.post('/api/a', {
      headers: { 'content-type': 'text/plain', 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' },
      data: JSON.stringify([{ t: 'v', route: '/', name: 'LCP', value: 4800, nav: 'navigate', k: `v4-${Date.now()}-123`, a: { el: probe, kind: 'image', ttfb: 300, loadDelay: 900, loadTime: 3200, renderDelay: 400 } }]),
    })
    expect(res.status()).toBeLessThan(300)
    await page.waitForTimeout(2500) // ingest flushes every 2 s
    await loginAsAdmin(page)
    await page.goto('/admin/dashboard?tab=analytics')
    const panel = page.getByTestId('vitals-attribution')
    await expect(panel).toBeVisible({ timeout: 20_000 })
    await expect(panel.getByRole('button', { name: /^LCP/ })).toHaveAttribute('aria-pressed', 'true')
    const row = panel.getByRole('row').filter({ has: page.getByText(probe, { exact: true }) })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Load time 3.20 s')
    await expect(row).toContainText('image')
    await panel.getByRole('button', { name: /^CLS/ }).click()
    await expect(panel.getByRole('button', { name: /^CLS/ })).toHaveAttribute('aria-pressed', 'true')
  })
})
