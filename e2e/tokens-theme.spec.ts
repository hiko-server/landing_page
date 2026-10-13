import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect, settle, seriousA11yViolations, loginAsAdmin } from './fixtures'

/**
 * Stream "tokens-theme" (desktop project; each test sets its own viewport):
 *   B1 design tokens — fluid type, the PageGrid column, motion variables;
 *   B2 System / Light / Dark preference — no flash, the header menu, the
 *      toggle, the palette, other tabs;
 *   B3 one Lucide icon set on public pages, licence on /colophon;
 *   B4 optically normalised affiliation logos (measured on save).
 */

const PREF_KEY = 'theme-preference'

/** Serve every Next.js script as an empty file: the server HTML plus its inline scripts, never hydrated. */
async function withoutHydration(page: Page): Promise<void> {
  await page.route(/\/_next\/static\/.*\.js(\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
}

const html = (page: Page) =>
  page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    preference: document.documentElement.getAttribute('data-theme-preference'),
    scheme: document.documentElement.style.colorScheme,
    stored: window.localStorage.getItem('theme-preference'),
    themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
  }))

/** fluid(min, max) between 360 and 1280 px viewports (theme/tokens.ts). */
const fluidAt = (min: number, max: number, vw: number) => min + (max - min) * Math.min(1, Math.max(0, (vw - 360) / 920))

/** First published post or case study path, or null on an empty content store. */
async function firstArticle(request: APIRequestContext): Promise<string | null> {
  for (const url of ['/api/blog/list', '/api/work/list']) {
    const res = await request.get(url)
    if (!res.ok()) continue
    const body = (await res.json()) as { items?: { slug: string; permalink?: string }[] }
    const it = body.items?.[0]
    if (it) return new URL(it.permalink || `${url.includes('blog') ? '/blog' : '/work'}/${it.slug}`, 'http://x').pathname
  }
  return null
}

// ── B1 ──────────────────────────────────────────────────────────────────────

test.describe('B1 design tokens', () => {
  test('the page title, eyebrow and content column follow the tokens at phone, tablet and desktop widths', async ({ page }) => {
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/work')
      await settle(page)
      const m = await page.evaluate(() => {
        const h1 = document.querySelector('main h1') as HTMLElement
        const eyebrow = document.querySelector('main header > p') as HTMLElement
        const brand = document.querySelector('header a') as HTMLElement
        const cs = getComputedStyle(eyebrow)
        return {
          h1: parseFloat(getComputedStyle(h1).fontSize),
          h1Left: h1.getBoundingClientRect().left,
          brandLeft: brand.getBoundingClientRect().left,
          eyebrow: parseFloat(cs.fontSize),
          transform: cs.textTransform,
          family: cs.fontFamily,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          grid: !!document.querySelector('.page-grid'),
        }
      })
      expect(Math.abs(m.h1 - fluidAt(36, 56, width)), `h1 @${width}`).toBeLessThan(1)
      expect(m.eyebrow, `label @${width}`).toBeGreaterThanOrEqual(11)
      expect(m.eyebrow).toBeLessThanOrEqual(12.01)
      expect(m.transform).toBe('uppercase')
      expect(m.family).toMatch(/mono/i)
      expect(Math.abs(m.h1Left - m.brandLeft), `content column lines up with the header @${width}`).toBeLessThan(1)
      expect(m.overflow, `no horizontal scroll @${width}`).toBeLessThanOrEqual(0)
      expect(m.grid).toBe(true)
    }
  })

  test('motion tokens are CSS variables, and reduced motion zeroes the durations', async ({ page, browser }) => {
    await page.goto('/')
    const vars = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement)
      return ['--ease-standard', '--duration-fast', '--duration-base', '--duration-slow', '--container-content'].map((v) => cs.getPropertyValue(v).trim())
    })
    // (The CSS minifier drops the spaces inside the curve.)
    expect(vars.map((v) => v.replace(/\s+/g, ''))).toEqual(['cubic-bezier(0.22,1,0.36,1)', '150ms', '250ms', '450ms', '1100px'])
    const ctx = await browser.newContext({ reducedMotion: 'reduce' })
    const reduced = await ctx.newPage()
    await reduced.goto('/')
    const zero = await reduced.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--duration-base').trim())
    expect(zero).toBe('0ms')
    await ctx.close()
  })

  test('article headings use the title text styles', async ({ page, request }) => {
    const article = await firstArticle(request)
    test.skip(!article, 'no published article in this data set')
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(article as string)
    await settle(page)
    const h2 = page.locator('.article-prose h2').first()
    test.skip((await h2.count()) === 0, 'the article has no h2')
    const size = await h2.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(Math.abs(size - fluidAt(22, 26, 1280))).toBeLessThan(1)
  })
})

// ── B2 ──────────────────────────────────────────────────────────────────────

test.describe('B2 theme preference', () => {
  test('a first visit gets the dark default and stores nothing, even on a light system', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'light' })
    const page = await ctx.newPage()
    await page.goto('/')
    await settle(page)
    expect(await html(page)).toMatchObject({ theme: 'dark', preference: 'dark', scheme: 'dark', stored: null, themeColor: '#050505' })
    await ctx.close()
  })

  test('System follows the operating system before hydration (no flash) and after', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'light' })
    await ctx.addInitScript((key) => window.localStorage.setItem(key, 'system'), PREF_KEY)
    const raw = await ctx.newPage()
    await withoutHydration(raw)
    await raw.goto('/cv')
    expect(await html(raw)).toMatchObject({ theme: 'light', preference: 'system', scheme: 'light', themeColor: '#fdfdfd' })
    await raw.close()

    const page = await ctx.newPage()
    await page.goto('/')
    await settle(page)
    expect(await html(page)).toMatchObject({ theme: 'light', preference: 'system' })
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#050505')
    expect((await html(page)).stored).toBe('system')
    await ctx.close()
  })

  test('the header menu: keyboard, choice, focus return and persistence', async ({ page }) => {
    await page.goto('/')
    await settle(page)
    const trigger = page.getByRole('button', { name: 'Theme preference' })
    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await trigger.focus()
    await page.keyboard.press('ArrowDown')
    const menu = page.getByRole('menu', { name: 'Theme' })
    await expect(menu).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const items = menu.getByRole('menuitemradio')
    await expect(items).toHaveCount(3)
    await expect(items.nth(0)).toBeFocused()
    await expect(items.nth(2)).toHaveAttribute('aria-checked', 'true')
    expect(await seriousA11yViolations(page)).toEqual([])

    // Escape closes and returns focus.
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(trigger).toBeFocused()

    // Open on the checked item (Enter), move with the arrows, choose Light.
    await page.keyboard.press('Enter')
    await expect(items.nth(2)).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(items.nth(1)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(menu).toBeHidden()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(trigger).toBeFocused()
    expect(await html(page)).toMatchObject({ preference: 'light', stored: 'light', themeColor: '#fdfdfd' })

    // First-letter jump, then a click outside closes without choosing.
    await trigger.click()
    await page.keyboard.press('s')
    await expect(items.nth(0)).toBeFocused()
    await page.mouse.click(5, 400)
    await expect(menu).toBeHidden()
    expect((await html(page)).preference).toBe('light')

    await page.reload()
    await settle(page)
    expect(await html(page)).toMatchObject({ theme: 'light', preference: 'light' })
    await trigger.click()
    await expect(items.nth(1)).toHaveAttribute('aria-checked', 'true')
  })

  test('the toggle stays one tap with the reveal; a context-menu gesture opens the menu instead', async ({ page }) => {
    await page.goto('/')
    await settle(page)
    const toggle = page.getByRole('button', { name: /switch to light theme/i })
    await toggle.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect((await html(page)).stored).toBe('light')

    // Right-click (and a touch long-press, which raises the same contextmenu event on Android).
    const darkToggle = page.getByRole('button', { name: /switch to dark theme/i })
    await darkToggle.click({ button: 'right' })
    const menu = page.getByRole('menu', { name: 'Theme' })
    await expect(menu).toBeVisible()
    expect((await html(page)).theme).toBe('light')
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(page.getByRole('button', { name: 'Theme preference' })).toBeFocused()
  })

  test('the ⌘K palette offers System, Light and Dark', async ({ page }) => {
    await page.goto('/')
    await settle(page)
    const run = async (query: string) => {
      await page.keyboard.press('ControlOrMeta+KeyK')
      const input = page.getByRole('combobox', { name: /search/i })
      await expect(input).toBeVisible()
      await input.fill(query)
      await expect(page.getByRole('option').first()).toContainText(new RegExp(query, 'i'))
      await page.keyboard.press('Enter')
      await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeHidden()
    }
    await run('light theme')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect((await html(page)).stored).toBe('light')
    await run('system theme')
    await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'system')
    expect((await html(page)).stored).toBe('system')
  })

  test('a choice made in another tab applies here', async ({ context }) => {
    const a = await context.newPage()
    const b = await context.newPage()
    await a.goto('/')
    await b.goto('/about')
    await settle(a)
    await b.evaluate((key) => window.localStorage.setItem(key, 'light'), PREF_KEY)
    await expect(a.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(a.locator('html')).toHaveAttribute('data-theme-preference', 'light')
  })
})

// ── B3 ──────────────────────────────────────────────────────────────────────

test.describe('B3 icons', () => {
  test('public pages draw Lucide SVG icons on the 4 px grid and no font-dependent glyph icons', async ({ page }) => {
    for (const path of ['/', '/work', '/contact', '/cv']) {
      await page.goto(path)
      await settle(page)
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 700) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 60))
        }
      })
      const found = await page.evaluate(() => ({
        glyphs: (document.body.innerText.match(/[▾▸★✓]/g) || []).length,
        // Rendered icons only (an icon in a collapsed or hidden part has no box).
        sizes: Array.from(document.querySelectorAll('svg.ui-icon'))
          .map((s) => Math.round(s.getBoundingClientRect().width))
          .filter((w) => w > 0),
      }))
      expect(found.glyphs, path).toBe(0)
      expect(found.sizes.length, `${path}: header icons at least`).toBeGreaterThan(0)
      for (const w of found.sizes) expect([12, 16, 20, 24], `${path}: icon width ${w}`).toContain(w)
    }
  })

  test('the colophon credits Lucide and serves its licence', async ({ page, request }) => {
    await page.goto('/colophon')
    const link = page.locator('a[href="/licenses/lucide.txt"]')
    await expect(link).toHaveCount(1)
    await expect(link).toHaveText('licence text')
    await expect(page.locator('main strong', { hasText: 'Lucide' })).toBeVisible()
    const res = await request.get('/licenses/lucide.txt')
    expect(res.status()).toBe(200)
    expect(await res.text()).toContain('ISC License')
  })
})

// ── B4 ──────────────────────────────────────────────────────────────────────

const strip = (page: Page) => page.locator('section[aria-labelledby="affiliations-label"] ul')

test.describe('B4 affiliation logos', () => {
  test('phones: rows of 3 or 2 with no orphan, nothing wider than the screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/')
    await settle(page)
    test.skip((await strip(page).count()) === 0, 'no affiliation logos in this data set')
    const rows = await strip(page).evaluate((ul) => {
      const tops = new Map<number, number>()
      let overflow = false
      for (const li of Array.from(ul.children) as HTMLElement[]) {
        const r = li.getBoundingClientRect()
        const key = Math.round(r.top)
        tops.set(key, (tops.get(key) || 0) + 1)
        const inner = li.firstElementChild?.getBoundingClientRect()
        if (inner && (inner.right > window.innerWidth + 0.5 || inner.left < -0.5)) overflow = true
      }
      return { counts: Array.from(tops.values()), total: ul.children.length, overflow }
    })
    if (rows.total >= 2) for (const n of rows.counts) expect(n, JSON.stringify(rows.counts)).toBeGreaterThanOrEqual(2)
    for (const n of rows.counts) expect(n).toBeLessThanOrEqual(3)
    expect(rows.overflow).toBe(false)
  })

  test('saving the home document measures the logos; the strip sizes them optically and the editor previews it @admin', async ({ page }) => {
    await loginAsAdmin(page)
    // In-page fetches carry the session cookie exactly as the editor does.
    const current = await page.evaluate(async () => {
      const res = await fetch('/api/admin/home', { cache: 'no-store' })
      return { status: res.status, etag: res.headers.get('etag'), doc: res.ok ? await res.json() : null }
    })
    expect(current.status).toBe(200)
    const doc = current.doc as { brands?: { image?: string }[] } | null
    test.skip(!doc || !doc.brands?.some((b) => b.image), 'no brand logos in this data set')
    const put = await page.evaluate(
      async ([body, etag]) => {
        const res = await fetch('/api/home', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...(etag ? { 'If-Match': etag } : {}) },
          body: JSON.stringify(body),
        })
        return { status: res.status, text: await res.text() }
      },
      [doc, current.etag] as const,
    )
    expect(put.status, put.text).toBe(200)

    const saved = (await (await page.request.get('/api/home')).json()) as { brands: { image: string; metrics?: { source: string; aspect: number } }[] }
    const measured = saved.brands.filter((b) => b.metrics)
    expect(measured.length).toBeGreaterThan(0)
    for (const b of measured) expect(b.metrics?.source).toBe(b.image.trim())

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await settle(page)
    const frames = await strip(page).evaluate((ul) =>
      Array.from(ul.querySelectorAll('li > * > span')).flatMap((el) => {
        const r = (el as HTMLElement).getBoundingClientRect()
        const ratio = getComputedStyle(el as HTMLElement).aspectRatio
        return ratio && ratio !== 'auto' ? [{ area: r.width * r.height, ratio }] : []
      }),
    )
    expect(frames.length).toBe(measured.length)
    // Equal-area sizing: no logo covers more than ~2.6× another (density ±12 %, owner scale aside).
    const areas = frames.map((f) => f.area)
    const scaled = saved.brands.some((b) => (b as { scale?: number }).scale && (b as { scale?: number }).scale !== 1)
    if (!scaled) expect(Math.max(...areas) / Math.min(...areas)).toBeLessThan(2.6)

    await page.goto('/admin/dashboard?tab=home')
    const preview = page.getByRole('region', { name: 'Brand strip preview' })
    await expect(preview).toBeVisible()
    await expect(page.getByText(/^Optical size \d+ × \d+ px/).first()).toBeVisible()
  })
})
