import type { Browser, Page } from '@playwright/test'
import { test, expect } from './fixtures'

/**
 * Visual regression baselines (CRIT-cross-engine-visual): the home page, an
 * article, a case study, the CV and the contact page, in dark and light, on
 * a phone, a tablet and a desktop — full-page screenshots of the synthetic
 * CI fixture store (e2e/fixtures/store: "Example Person", generated images;
 * nothing personal is ever captured), compared pixel by pixel with the
 * baselines in e2e/visual.spec.ts-snapshots.
 *
 * Deterministic by construction: reduced motion and `animations: 'disabled'`
 * (no entrance, rotation or autoplay), every lazy image loaded and decoded,
 * web fonts in, the caret hidden, and the values that change on their own
 * — the copyright year, the CV's "Updated <month>", the contact form's
 * random human-check sum — masked. Rendering differs between operating
 * systems, so the baselines are made and compared in the same Linux image
 * scripts/check-fixture-gates.sh uses (mcr.microsoft.com/playwright, linux/arm64;
 * the `-linux` suffix); after an intended change regenerate them there:
 *
 *   scripts/check-fixture-gates.sh --update-snapshots
 *
 * Runs only against the fixture store (E2E_FIXTURE=1), in the `visual`
 * project, built with TZ=UTC and NEXT_PUBLIC_SITE_HOST=example.com like the
 * script (scripts/check-fixture-gates.sh).
 */

const FIXTURE = process.env.E2E_FIXTURE === '1'

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'article', path: '/blog/example-field-notes' },
  { name: 'case-study', path: '/work/example-sorting-station' },
  { name: 'cv', path: '/cv' },
  { name: 'contact', path: '/contact' },
] as const

const VIEWPORTS = [
  { name: 'phone', width: 375, height: 812, isMobile: true },
  { name: 'tablet', width: 768, height: 1024, isMobile: false },
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
] as const

const THEMES = ['dark', 'light'] as const

/** Load every lazy image, wait until all are decoded and the fonts are in, then return to the top. */
async function prepare(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // Scroll through once: lazily mounted sections render their content.
    const step = Math.max(300, Math.round(window.innerHeight * 0.8))
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 60))
    }
    for (const img of Array.from(document.images)) {
      if (img.loading !== 'lazy' || img.complete) continue
      // A deferred lazy image (e.g. off to the side in the photo strip) is not
      // fetched by the attribute change alone: setting its sources again is.
      img.loading = 'eager'
      const srcset = img.getAttribute('srcset')
      if (srcset) img.setAttribute('srcset', srcset)
      const src = img.getAttribute('src')
      if (src) img.setAttribute('src', src)
    }
    window.scrollTo(0, 0)
    const settled = (img: HTMLImageElement) =>
      new Promise<void>((resolve) => {
        if (img.complete) return resolve()
        img.addEventListener('load', () => resolve(), { once: true })
        img.addEventListener('error', () => resolve(), { once: true })
      })
    const all = Promise.all(Array.from(document.images).map((img) => settled(img).then(() => (img.naturalWidth ? img.decode().catch(() => undefined) : undefined))))
    const stuck = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`images still loading: ${Array.from(document.images).filter((i) => !i.complete).map((i) => i.currentSrc || i.src).join(', ')}`)), 20_000),
    )
    await Promise.race([all, stuck])
    await document.fonts.ready
  })
  // Blur-up placeholders hand over to their images; the back-to-top button hides.
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('img[data-lqip="pending"], img[data-lqip="reveal"]').length), { timeout: 10_000 }).toBe(0)
  await page.waitForTimeout(400)
}

/** Each context is its own visitor (see e2e/gates.spec.ts): the contact form's nonce is rate-limited per visitor. */
let visitors = 0

async function shoot(browser: Browser, baseURL: string, viewport: (typeof VIEWPORTS)[number], theme: (typeof THEMES)[number]) {
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { 'cf-connecting-ip': `198.51.100.${(visitors++ % 250) + 1}` },
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
    colorScheme: theme,
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
  })
  await context.addInitScript((t) => {
    try {
      window.localStorage.setItem('theme-preference', t)
    } catch {
      /* storage blocked: the colour scheme decides */
    }
  }, theme)
  const page = await context.newPage()
  return { context, page }
}

test.describe('@visual baselines', () => {
  test.skip(!FIXTURE, 'visual baselines are taken of the synthetic fixture store only (E2E_FIXTURE=1)')

  test.beforeAll(async ({ request }) => {
    const html = await (await request.get('/')).text()
    if (!html.includes('Example Person')) throw new Error('E2E_FIXTURE=1 but the server does not serve the fixture store')
  })

  for (const target of PAGES) {
    test(`@visual ${target.name}`, async ({ browser }, testInfo) => {
      test.setTimeout(180_000)
      for (const viewport of VIEWPORTS) {
        for (const theme of THEMES) {
          const { context, page } = await shoot(browser, testInfo.project.use.baseURL || '', viewport, theme)
          try {
            await page.goto(target.path, { waitUntil: 'load' })
            await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
            await prepare(page)
            await expect.soft(page, `${target.name} ${viewport.name} ${theme}`).toHaveScreenshot(`${target.name}-${viewport.name}-${theme}.png`, {
              fullPage: true,
              animations: 'disabled',
              caret: 'hide',
              scale: 'css',
              // What changes on its own: the copyright year, the CV's
              // "Updated <month>" (the month its document was stored) and the
              // contact form's random human-check sum.
              mask: [
                page.locator('footer').getByText(/^20\d\d$/),
                page.locator('time').locator('xpath=..').filter({ hasText: /^(Updated|更新于)\s/ }),
                page.getByText(/^What is \d+ \+ \d+\?$/),
              ],
              maxDiffPixelRatio: 0.001,
            })
          } finally {
            await context.close()
          }
        }
      }
    })
  }
})
