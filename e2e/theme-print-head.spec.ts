import type { Page, APIRequestContext } from '@playwright/test'
import { test, expect, settle } from './fixtures'

/**
 * Theme, print, language-of-parts and <head> checks (desktop project only,
 * see playwright.config.ts):
 *   - <head>: one icon, one Apple touch icon, one theme-color, no X-UA-Compatible;
 *   - theme-color follows the colour mode, also before hydration;
 *   - the English chrome is lang="en" on the Chinese CV;
 *   - semantic colours are already right before hydration (no repaint);
 *   - Geist Mono's fallback is metric-matched (the meta grid does not move);
 *   - print: the CV on its named A4 page, other pages with margins, dark
 *     mode printed in the light palette, link URLs, <details> opened.
 */

const STORAGE_KEY = 'chakra-ui-color-mode'

/** Serve every Next.js script as an empty file: the server HTML plus its inline scripts, never hydrated. */
async function withoutHydration(page: Page): Promise<void> {
  await page.route(/\/_next\/static\/.*\.js(\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
}

/** A returning visitor who chose the light theme (what the colour-mode script stores). */
async function useLightMode(page: Page): Promise<void> {
  await page.addInitScript((key) => window.localStorage.setItem(key, 'light'), STORAGE_KEY)
}

/** First published case study or post, or null on an empty content store. */
async function firstArticle(request: APIRequestContext): Promise<string | null> {
  for (const url of ['/api/work/list', '/api/blog/list']) {
    const res = await request.get(url)
    if (!res.ok()) continue
    const body = (await res.json()) as { items?: { slug: string; permalink?: string }[] }
    const it = body.items?.[0]
    if (it) return new URL(it.permalink || `${url.includes('blog') ? '/blog' : '/work'}/${it.slug}`, 'http://x').pathname
  }
  return null
}

/** Path of the self-hosted Geist Mono file (next/font hashes its name), read from the page's stylesheets. */
async function monoFontUrl(request: APIRequestContext, path: string): Promise<string> {
  const html = await request.get(path).then((r) => r.text())
  for (const href of html.match(/\/_next\/static\/css\/[^"]+\.css/g) || []) {
    const css = await request.get(href).then((r) => r.text())
    const src = css.match(/@font-face\{font-family:mono;src:url\(([^)]+)\)/)?.[1]
    if (src) return src
  }
  throw new Error('no @font-face for the mono face')
}

/** The language an element is read in: its nearest lang attribute. */
const nearestLang = (el: Element) => el.closest('[lang]')?.getAttribute('lang') ?? null

test.describe('head', () => {
  test('one icon, one apple-touch-icon, one theme-color and no X-UA-Compatible on every page type', async ({ page, request }) => {
    const article = await firstArticle(request)
    for (const path of ['/', '/about', '/cv', '/cv/zh', '/work', '/blog', '/contact', '/this-page-does-not-exist', ...(article ? [article] : [])]) {
      await page.goto(path)
      await settle(page)
      const head = await page.evaluate(() => ({
        icon: document.querySelectorAll('link[rel="icon"]').length,
        appleTouchIcon: document.querySelectorAll('link[rel="apple-touch-icon"]').length,
        themeColor: document.querySelectorAll('meta[name="theme-color"]').length,
        xUaCompatible: document.querySelectorAll('meta[http-equiv="X-UA-Compatible" i]').length,
        viewport: document.querySelectorAll('meta[name="viewport"]').length,
        hrefs: Array.from(document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')).map((l) => l.getAttribute('href') || ''),
      }))
      expect(head, path).toMatchObject({ icon: 1, appleTouchIcon: 1, themeColor: 1, xUaCompatible: 0, viewport: 1 })
      for (const href of head.hrefs) {
        const res = await request.get(href)
        expect(res.status(), `${path}: ${href}`).toBe(200)
        expect(res.headers()['content-type'], href).toMatch(/^image\//)
      }
    }
  })

  test('theme-color follows the colour mode, before hydration as well', async ({ page }) => {
    const meta = page.locator('meta[name="theme-color"]')
    await page.goto('/')
    await settle(page)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(meta).toHaveAttribute('content', '#050505')
    await page.getByRole('button', { name: /switch to light theme/i }).filter({ visible: true }).first().click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(meta).toHaveAttribute('content', '#fdfdfd')
    await expect(meta).toHaveCount(1)

    // A returning light-mode visitor, before any React code runs.
    const fresh = await page.context().newPage()
    await useLightMode(fresh)
    await withoutHydration(fresh)
    await fresh.goto('/cv')
    await expect(fresh.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(fresh.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#fdfdfd')
    await fresh.close()
  })
})

test.describe('language of the English chrome', () => {
  test('/cv/zh: header, footer, skip link, palette, its toasts and the drawer are lang="en"; the CV stays zh-Hans', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/cv/zh')
    await settle(page)
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans')
    expect(await page.locator('header').first().evaluate(nearestLang)).toBe('en')
    expect(await page.locator('footer.glass').evaluate(nearestLang)).toBe('en')
    expect(await page.locator('a.skip-nav').evaluate(nearestLang)).toBe('en')
    expect(await page.locator('main h1').first().evaluate(nearestLang)).toBe('zh-Hans')
    if (await page.locator('#A4Paper').count()) expect(await page.locator('#A4Paper').evaluate(nearestLang)).toBe('zh-Hans')

    // ⌘K palette (portaled to <body>) and a toast raised from it.
    await page.keyboard.press('ControlOrMeta+KeyK')
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette).toBeVisible()
    expect(await palette.evaluate(nearestLang)).toBe('en')
    await page.getByRole('combobox', { name: /search/i }).fill('copy link')
    await page.getByRole('option').first().click()
    const toast = page.locator('.chakra-toast [role="status"]').first()
    await expect(toast).toBeVisible()
    expect(await toast.getByText('Link copied').evaluate(nearestLang)).toBe('en')

    // Mobile drawer (below lg).
    await page.setViewportSize({ width: 800, height: 900 })
    await page.getByRole('button', { name: 'Open menu' }).click()
    const drawer = page.locator('.chakra-modal__content').filter({ hasText: 'Navigate' })
    await expect(drawer).toBeVisible()
    expect(await drawer.evaluate(nearestLang)).toBe('en')
  })

  test('/cv (English): the chrome simply inherits <html lang="en">', async ({ page }) => {
    await page.goto('/cv')
    await settle(page)
    expect(await page.locator('header').first().evaluate((el) => el.closest('[lang]')?.tagName)).toBe('HTML')
    expect(await page.locator('a.skip-nav').getAttribute('lang')).toBeNull()
  })
})

test('light mode: CV sections and work cards have their final colours before hydration (no repaint)', async ({ page, browser }) => {
  type Probe = { selector: string; props: string[] }
  const probes: Record<string, Probe[]> = {
    '/about': [
      { selector: '.chakra-accordion__item', props: ['border-top-color', 'background-color'] },
      { selector: '.chakra-accordion__button span', props: ['color'] },
    ],
    '/work': [{ selector: 'article.spotlight', props: ['border-top-color', 'background-color'] }],
  }
  const read = (p: Page, list: Probe[]) =>
    p.evaluate(
      (items) =>
        items.map(({ selector, props }) => {
          const el = document.querySelector(selector)
          if (!el) return null
          const cs = getComputedStyle(el)
          return props.map((prop) => cs.getPropertyValue(prop))
        }),
      list,
    )
  const ssr = await browser.newPage()
  await useLightMode(ssr)
  await withoutHydration(ssr)
  await useLightMode(page)
  for (const [path, list] of Object.entries(probes)) {
    await ssr.goto(path)
    await expect(ssr.locator('html')).toHaveAttribute('data-theme', 'light')
    const before = await read(ssr, list)
    await page.goto(path)
    await settle(page)
    const after = await read(page, list)
    expect(after, `${path}: hydrated light page`).toEqual(before)
  }
  await ssr.close()
})

test.describe('Geist Mono fallback', () => {
  test('each installed fallback face is exactly as wide as Geist Mono', async ({ page }) => {
    await page.goto('/colophon')
    await settle(page)
    const result = await page.evaluate(async () => {
      const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, '')
      const stack = getComputedStyle(document.documentElement).getPropertyValue('--font-geist-mono').split(',').map(unquote)
      const ctx = document.createElement('canvas').getContext('2d')!
      const sample = 'DATE 2026-10 · READ 6 MIN · [01] TAGS'
      const width = (family: string) => {
        ctx.font = `100px "${family}"`
        return ctx.measureText(sample).width
      }
      const faces: { family: string; ratio: number }[] = []
      for (const family of stack.filter((f) => f.startsWith('Geist Mono Fallback'))) {
        await document.fonts.load(`100px "${family}"`, sample).catch(() => [])
        const face = Array.from(document.fonts).find((f) => unquote(f.family) === family)
        if (face?.status === 'loaded') faces.push({ family, ratio: width(family) / width(stack[0]) })
      }
      return { stack, faces }
    })
    // Metric-matched monospace faces right after Geist Mono — never next/font's Arial stand-in.
    expect(result.stack.slice(1, 4)).toEqual(['Geist Mono Fallback Menlo', 'Geist Mono Fallback Consolas', 'Geist Mono Fallback Courier'])
    expect(result.stack.join(',')).not.toMatch(/mono Fallback/)
    test.skip(result.faces.length === 0, 'none of the fallback fonts is installed on this machine')
    for (const f of result.faces) {
      expect(f.ratio, f.family).toBeGreaterThan(0.995)
      expect(f.ratio, f.family).toBeLessThan(1.005)
    }
  })

  test('the article meta grid keeps its size when Geist Mono swaps in', async ({ page, request }) => {
    const article = await firstArticle(request)
    test.skip(!article, 'the content store has no published posts or case studies (empty CI store)')
    const monoUrl = await monoFontUrl(request, article!)
    // Hold Geist Mono back until the fallback layout has been measured.
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(
      (url) => url.pathname === monoUrl,
      async (route) => {
        await held
        await route.continue()
      },
    )
    await page.goto(article!, { waitUntil: 'domcontentloaded' })
    const grid = page.locator('main dl').first()
    await expect(grid).toBeVisible()
    const measure = () =>
      grid.evaluate((dl) => ({
        grid: Math.round(dl.getBoundingClientRect().height * 10) / 10,
        labels: Array.from(dl.querySelectorAll('dt')).map((dt) => {
          const r = dt.getBoundingClientRect()
          return { x: Math.round(r.left * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }
        }),
      }))
    const monoLoaded = () => page.evaluate(() => Array.from(document.fonts).some((f) => f.family === 'mono' && f.status === 'loaded'))
    expect(await monoLoaded(), 'Geist Mono is still held back').toBe(false)
    const fallback = await measure()
    release()
    await expect.poll(monoLoaded).toBe(true)
    const geist = await measure()
    expect(geist.labels.length).toBeGreaterThan(0)
    expect(Math.abs(geist.grid - fallback.grid), 'grid height').toBeLessThanOrEqual(0.5)
    geist.labels.forEach((l, i) => {
      expect(Math.abs(l.w - fallback.labels[i].w), `label ${i} width`).toBeLessThanOrEqual(1)
      expect(Math.abs(l.x - fallback.labels[i].x), `label ${i} x`).toBeLessThanOrEqual(1)
      expect(Math.abs(l.h - fallback.labels[i].h), `label ${i} height`).toBeLessThanOrEqual(0.5)
    })
  })
})

test.describe('print', () => {
  test('the CV prints on its named A4 page with no paper margin; other pages get margins', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Chromium-only print/PDF checks')
    await page.goto('/cv')
    await settle(page)
    test.skip((await page.locator('#A4Paper').count()) === 0, 'the CV has not been published (empty content store)')
    const pageRules = await page.evaluate(() => {
      const out: { selector: string; margin: string; size: string }[] = []
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList
        try {
          rules = sheet.cssRules
        } catch {
          continue
        }
        for (const r of Array.from(rules)) {
          if (r instanceof CSSPageRule) out.push({ selector: r.selectorText, margin: r.style.getPropertyValue('margin'), size: r.style.getPropertyValue('size').toLowerCase() })
        }
      }
      return out
    })
    expect(pageRules).toContainEqual({ selector: '', margin: '18mm 16mm', size: '' })
    expect(pageRules).toContainEqual({ selector: 'cv', margin: '0px', size: 'a4' })
    expect(pageRules.filter((r) => r.selector === '')).toHaveLength(1)

    await page.emulateMedia({ media: 'print' })
    const sheet = await page.evaluate(() => {
      const paper = document.getElementById('A4Paper')!
      return {
        page: getComputedStyle(document.body).getPropertyValue('page'),
        width: Math.round(paper.getBoundingClientRect().width),
        visibility: getComputedStyle(paper).visibility,
        header: getComputedStyle(document.querySelector('header')!).display,
      }
    })
    expect(sheet).toEqual({ page: 'cv', width: 794, visibility: 'visible', header: 'none' })
    // The real PDF: every page is A4.
    const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1')
    const boxes = Array.from(pdf.matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)).map((m) => [Number(m[1]), Number(m[2])])
    expect(boxes.length).toBeGreaterThan(0)
    for (const [w, h] of boxes) {
      expect(Math.abs(w - 595.3), `page width ${w}pt`).toBeLessThan(2)
      expect(Math.abs(h - 841.9), `page height ${h}pt`).toBeLessThan(2)
    }
  })

  test('an article printed from dark mode uses the light palette, prints link URLs and opens <details>', async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Chromium-only print checks')
    const article = await firstArticle(request)
    test.skip(!article, 'the content store has no published posts or case studies (empty CI store)')
    await page.goto(article!)
    await settle(page)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.emulateMedia({ media: 'print' })
    const printed = await page.evaluate(() => {
      const color = (sel: string) => {
        const el = document.querySelector(sel)
        return el ? getComputedStyle(el).color : null
      }
      const link = document.querySelector<HTMLAnchorElement>('.article-prose a[data-print-url]')
      return {
        page: getComputedStyle(document.body).getPropertyValue('page'),
        h1: color('main h1'),
        paragraph: color('.article-prose p'),
        background: getComputedStyle(document.body).backgroundColor,
        header: getComputedStyle(document.querySelector('header')!).display,
        link: link ? { url: link.dataset.printUrl, after: getComputedStyle(link, '::after').content } : null,
      }
    })
    expect(printed.page).not.toBe('cv')
    expect(printed.h1).toBe('rgb(10, 10, 10)')
    expect(printed.paragraph).toBe('rgb(39, 39, 42)')
    expect(printed.background).toBe('rgb(255, 255, 255)')
    expect(printed.header).toBe('none')
    if (printed.link) expect(printed.link.after).toBe(`" (${printed.link.url})"`)

    // <details> print open, and close again afterwards.
    const details = await page.evaluate(() => {
      const d = document.createElement('details')
      d.innerHTML = '<summary>More</summary><p>Hidden detail</p>'
      document.querySelector('.article-prose')!.append(d)
      window.dispatchEvent(new Event('beforeprint'))
      const during = d.open
      window.dispatchEvent(new Event('afterprint'))
      const after = d.open
      d.remove()
      return { during, after }
    })
    expect(details).toEqual({ during: true, after: false })
  })
})
