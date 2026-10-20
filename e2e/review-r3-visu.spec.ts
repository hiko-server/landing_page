import type { Page } from '@playwright/test'
import { test, expect, ADMIN, adminCleanup, loginAsAdmin, settle } from './fixtures'

/**
 * Review round 3, visual findings (fix3-C):
 *   - VISU-1: the primary nav sits at one place whether or not a page has a
 *     language switch, and does not move during a navigation between them
 *   - VISU-2: on 320–360 px phones the switch never runs into the brand
 *     (with the production wordmark, the longest it gets)
 *   - VISU-3: Chinese typesetting on every Chinese page (faces, tracking,
 *     leading, autospace), English pages and the CV's A4 sheet unchanged
 *   - VISU-4: the viewer's previous / next arrows follow its fade frame by
 *     frame (no flash at full opacity on open)
 *   - VISU-5: a click / the zoom button zooms no further than the source's
 *     pixels; an image shown at its full size offers no such zoom
 *   - VISU-6: the palette's group badges and recent hints are in the
 *     page's language
 *   - @admin VISU-7 (CV Studio's toast has its words), VISU-8 (the review
 *     and draft bars line up with the page), VISU-9 (one rule under
 *     "Review links"), VISU-10 (the page-detail card's "View page" on the
 *     card's text edge when it wraps)
 *
 * Production-safe without @admin: only GETs and in-page actions. The
 * @admin tests write a synthetic draft and review link and delete them
 * again; the CV Studio one changes nothing on the server (it never saves).
 */

const desktopOnly = (project: string) => project !== 'chromium'

/** The left edge of the header nav's first link. */
const navLeft = (page: Page) => page.locator('header nav a').first().evaluate((el) => el.getBoundingClientRect().left)

// ── VISU-1 ────────────────────────────────────────────────────────────────────

test.describe('review-r3 visual: header', () => {
  test('VISU-1: the primary nav sits at the same place with and without a language switch, and stays put across the navigation', async ({ page }, testInfo) => {
    test.skip(desktopOnly(testInfo.project.name), 'sets its own desktop widths')
    for (const width of [1100, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      // /now never has a Chinese version; /cv always has /cv/zh.
      await page.goto('/now')
      await expect(page.locator('header [data-lang-switch]')).toHaveCount(0)
      await settle(page)
      const without = await navLeft(page)
      await page.goto('/cv')
      await expect(page.locator('header [data-lang-switch]')).toBeVisible()
      await settle(page)
      expect(Math.abs((await navLeft(page)) - without), `nav at ${width}px: /now vs /cv`).toBeLessThan(0.5)

      // A client-side navigation from a page without the switch to one with it: every frame.
      await page.goto('/now')
      await settle(page)
      await page.evaluate(() => {
        const w = window as unknown as { __navX: number[] }
        w.__navX = []
        const loop = () => {
          const a = document.querySelector('header nav a')
          if (a) w.__navX.push(Math.round(a.getBoundingClientRect().left * 100) / 100)
          if (w.__navX.length < 60) requestAnimationFrame(loop)
        }
        requestAnimationFrame(loop)
      })
      await page.locator('header nav').getByRole('link', { name: 'CV', exact: true }).click()
      await expect(page).toHaveURL(/\/cv$/)
      await expect(page.locator('header [data-lang-switch]')).toBeVisible()
      await expect.poll(() => page.evaluate(() => (window as unknown as { __navX: number[] }).__navX.length)).toBe(60)
      const xs = await page.evaluate(() => (window as unknown as { __navX: number[] }).__navX)
      expect(Math.max(...xs) - Math.min(...xs), `the nav never moved at ${width}px`).toBeLessThan(0.5)
    }
  })

  // ── VISU-2 ──────────────────────────────────────────────────────────────────

  test('VISU-2: on 320–360 px phones the language switch never runs into the brand; its label stays its name', async ({ page }, testInfo) => {
    test.skip(desktopOnly(testInfo.project.name), 'sets its own phone widths')
    for (const width of [320, 340, 360, 375]) {
      for (const path of ['/cv', '/cv/zh']) {
        await page.setViewportSize({ width, height: 740 })
        await page.goto(path)
        await settle(page)
        const sw = page.locator('header [data-lang-switch]')
        await expect(sw).toBeVisible()
        await expect(sw).toHaveAccessibleName(path === '/cv' ? '中文' : 'English')
        // The production wordmark, the widest the brand gets (the test server's host is shorter).
        const geometry = await page.evaluate(() => {
          const brand = document.querySelector<HTMLElement>('header a[href="/"]')!
          const spans = brand.querySelectorAll(':scope > span')
          spans[0].textContent = 'lucian-dev'
          if (spans[1]) spans[1].textContent = '.com'
          const range = document.createRange()
          range.selectNodeContents(brand)
          const text = range.getBoundingClientRect()
          const sw = document.querySelector('header [data-lang-switch]')!.getBoundingClientRect()
          const hit = document.elementFromPoint(text.right - 2, text.top + text.height / 2)
          return { textRight: text.right, switchLeft: sw.left, brandOnTop: !!hit && brand.contains(hit) }
        })
        expect(geometry.switchLeft, `${path} at ${width}px: the switch starts after the brand`).toBeGreaterThanOrEqual(geometry.textRight)
        expect(geometry.brandOnTop, `${path} at ${width}px: the brand's last letter is the brand's to tap`).toBe(true)
      }
    }
    // From 375 px the label is shown.
    await page.setViewportSize({ width: 375, height: 740 })
    await page.goto('/cv')
    const label = page.locator('header [data-lang-switch]')
    expect((await label.boundingBox())!.width).toBeGreaterThan(50)
  })
})

// ── VISU-3 ────────────────────────────────────────────────────────────────────

type Type = { ls: number; lh: number; fs: number; ff: string; ta: string }

const typeOf = (page: Page, selector: string): Promise<Type> =>
  page.locator(selector).first().evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      ls: parseFloat(cs.letterSpacing) || 0,
      lh: parseFloat(cs.lineHeight),
      fs: parseFloat(cs.fontSize),
      ff: cs.fontFamily,
      ta: (cs as CSSStyleDeclaration & { textAutospace?: string }).textAutospace ?? '',
    }
  })

/**
 * Every element on the page with Chinese text of its own (outside the CV's
 * A4 sheet) that is tracked, or set in a face without the Chinese
 * punctuation (mono labels keep theirs).
 */
const hanOffenders = (page: Page) =>
  page.evaluate(() => {
    const han = /[\u3400-\u9fff]/
    const out: string[] = []
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (el.closest('script, style, noscript, #print-area')) continue
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join('')
        .trim()
      if (!han.test(own)) continue
      const cs = getComputedStyle(el)
      const ls = parseFloat(cs.letterSpacing) || 0
      if (ls !== 0) out.push(`tracked ${ls}px: ${own.slice(0, 16)}`)
      if (!/^"?CJK punctuation (SC|TC)/.test(cs.fontFamily) && !/^"?mono\b|Geist Mono/i.test(cs.fontFamily)) out.push(`face ${cs.fontFamily.slice(0, 24)}: ${own.slice(0, 16)}`)
    }
    return out
  })

test.describe('review-r3 visual: Chinese typesetting', () => {
  test('VISU-3: a Chinese page sets Chinese type in its header, title, lede, labels and footer; English pages and the A4 sheet are unchanged', async ({ page }, testInfo) => {
    test.skip(desktopOnly(testInfo.project.name), 'one engine (text-autospace is Chromium and Safari)')
    await page.setViewportSize({ width: 375, height: 812 })

    await page.goto('/cv')
    await settle(page)
    const enTitle = await typeOf(page, 'main h1')
    const enSheetH2 = await typeOf(page, '#print-area h2')
    const enBrand = await typeOf(page, 'header a[href="/"]')
    expect(enTitle.ls, 'the English title keeps its display tracking').toBeLessThan(0)
    expect(enTitle.ff).not.toMatch(/^"?CJK punctuation/)
    expect((await typeOf(page, 'body')).ff).not.toMatch(/^"?CJK punctuation/)
    expect((await typeOf(page, 'html')).ta).not.toBe('normal')
    // A Chinese run on an English page (the switch to 中文) gets the Chinese face.
    expect((await typeOf(page, 'header [data-lang-switch]')).ff).toMatch(/^"?CJK punctuation SC/)

    await page.goto('/cv/zh')
    await settle(page)
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('zh-Hans')
    const title = await typeOf(page, 'main h1')
    expect(title.ls, 'no tracking on the Chinese title').toBe(0)
    expect(title.lh / title.fs, 'Chinese title leading').toBeGreaterThanOrEqual(1.25 - 0.01)
    expect(title.ff).toMatch(/^"?CJK punctuation SC/)
    // Header, eyebrow, labels, footer: no tracking on Han, the Chinese face.
    expect(await hanOffenders(page)).toEqual([])
    expect((await typeOf(page, 'html')).ta, 'space between Han and Latin').toBe('normal')
    // An English run inside Chinese (the switch to English) keeps Geist and its punctuation.
    expect((await typeOf(page, 'header [data-lang-switch]')).ff).not.toMatch(/CJK punctuation/)
    // The domain wordmark keeps its own tracking.
    expect((await typeOf(page, 'header a[href="/"]')).ls).toBeCloseTo(enBrand.ls, 3)
    // The A4 sheet keeps its setting (the PDF shares it).
    const sheetH2 = await typeOf(page, '#print-area h2')
    expect(sheetH2.ls).toBeCloseTo(enSheetH2.ls, 3)
    expect(sheetH2.ff).toBe(enSheetH2.ff)
    expect(sheetH2.ta).not.toBe('normal')
    expect((await typeOf(page, '#print-area')).ta).not.toBe('normal')

    // The Chinese index pages, when this store has Chinese posts / case studies.
    for (const path of ['/zh/blog', '/zh/work']) {
      const res = await page.goto(path)
      if (res?.status() !== 200) continue
      await settle(page)
      const h1 = await typeOf(page, 'main h1')
      expect(h1.ls).toBe(0)
      expect(h1.lh / h1.fs).toBeGreaterThanOrEqual(1.24)
      const lede = await typeOf(page, 'main .lede')
      expect(lede.lh / lede.fs).toBeGreaterThanOrEqual(1.74)
      // Card titles and excerpts too: their dashes and quotation marks come from the Chinese face.
      expect(await hanOffenders(page), path).toEqual([])
    }
  })
})

// ── VISU-4 / VISU-5: the image viewer ─────────────────────────────────────────

/** Opens the home page's first Field Notes photo in the viewer (null without photos in this store). */
async function openFieldNote(page: Page, sample?: () => Promise<void>): Promise<boolean> {
  await page.goto('/', { waitUntil: 'load' })
  const section = page.locator('#section-photos')
  if (!(await section.count())) return false
  await section.scrollIntoViewIfNeeded()
  const tiles = section.locator('.field-notes-strip button')
  await tiles.first().waitFor()
  if ((await tiles.count()) < 2) return false
  await settle(page)
  await tiles.first().hover()
  await page.waitForTimeout(200)
  if (sample) await sample()
  await tiles.first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  return true
}

const idle = (page: Page) => expect(page.locator('.lightbox-stage')).toHaveAttribute('data-motion', 'idle')

/** The current image's scale (the layer's transform). */
const scaleNow = (page: Page) =>
  page.evaluate(() => {
    const layer = Array.from(document.querySelectorAll('.lightbox-layer')).find((l) => !l.closest('[aria-hidden="true"]'))
    const t = layer ? getComputedStyle(layer).transform : 'none'
    return t && t !== 'none' ? new DOMMatrixReadOnly(t).a : 1
  })

/** What the source offers against how the image is shown: native = file px / fitted CSS px. */
const zoomGeometry = (page: Page) =>
  page.evaluate(() => {
    const layer = Array.from(document.querySelectorAll<HTMLElement>('.lightbox-layer')).find((l) => !l.closest('[aria-hidden="true"]'))!
    const img = layer.querySelector<HTMLImageElement>('img:not([aria-hidden])')!
    const widths = [img.getAttribute('srcset'), img.closest('picture')?.querySelector('source')?.getAttribute('srcset')]
      .flatMap((s) => Array.from((s || '').matchAll(/\s(\d+)w(?=\s*(?:,|$))/g), (m) => Number(m[1])))
    const source = widths.length ? Math.max(...widths) : Number(img.getAttribute('width')) || img.naturalWidth
    const stage = document.querySelector('.lightbox-stage')!.getBoundingClientRect()
    const fill = Math.max(stage.width / layer.offsetWidth, stage.height / layer.offsetHeight)
    const native = source / layer.offsetWidth
    const r = layer.getBoundingClientRect()
    return { source, fitted: layer.offsetWidth, native, oneShot: Math.min(Math.max(2.5, fill), 4, native), cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
  })

test.describe('review-r3 visual: image viewer', () => {
  test('VISU-4: the previous / next arrows follow the viewer\'s fade every frame (no flash at full opacity)', async ({ page }, testInfo) => {
    test.skip(desktopOnly(testInfo.project.name), 'desktop pointer')
    const opened = await openFieldNote(page, () =>
      page.evaluate(() => {
        const w = window as unknown as { __arrow: [number, number][] }
        w.__arrow = []
        const loop = () => {
          const root = document.querySelector<HTMLElement>('.chakra-modal__content')
          const next = document.querySelector('[aria-label="Next image"]')
          // From the engine's first write of the controls' opacity on.
          const ui = root ? parseFloat(root.style.getPropertyValue('--lb-ui')) : NaN
          if (next && Number.isFinite(ui)) w.__arrow.push([ui, Number(getComputedStyle(next).opacity)])
          if (w.__arrow.length < 30) requestAnimationFrame(loop)
        }
        requestAnimationFrame(loop)
      }),
    )
    test.skip(!opened, 'no Field Notes photos in this content store')
    await expect.poll(() => page.evaluate(() => (window as unknown as { __arrow: unknown[] }).__arrow.length)).toBe(30)
    const frames = await page.evaluate(() => (window as unknown as { __arrow: [number, number][] }).__arrow)
    expect(frames[0][0], 'the open fade starts from transparent').toBeLessThan(0.2)
    for (const [ui, arrow] of frames) expect(Math.abs(arrow - ui), `arrow ${arrow} vs --lb-ui ${ui}`).toBeLessThan(0.02)
  })

  test('VISU-5: at full size the photo offers no zoom (a click closes it); where it is shown smaller, a click zooms to 1:1 and no further', async ({ page }, testInfo) => {
    test.skip(desktopOnly(testInfo.project.name), 'desktop pointer')
    // Wide and tall: the photo is shown at (or near) its own size.
    await page.setViewportSize({ width: 1440, height: 1000 })
    test.skip(!(await openFieldNote(page)), 'no Field Notes photos in this content store')
    await idle(page)
    let g = await zoomGeometry(page)
    const stage = page.locator('.lightbox-stage')
    if (g.native < 1.2) {
      await expect(page.getByRole('button', { name: 'Zoom in' })).toHaveCount(0)
      await expect(stage).toHaveAttribute('data-zoomable', 'false')
      await expect(stage.locator('.lightbox-frame').first()).toHaveCSS('cursor', 'default')
      // A click on the photo itself closes it, as a click beside it does.
      await page.mouse.click(g.cx, g.cy)
      await expect(page.getByRole('dialog')).toHaveCount(0)
      // + still magnifies on purpose.
      await page.locator('#section-photos .field-notes-strip button').first().click()
      await idle(page)
      await page.keyboard.press('+')
      await idle(page)
      expect(await scaleNow(page)).toBeCloseTo(1.5, 2)
      await expect(page.getByRole('button', { name: 'Zoom out' })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }

    // Narrow: the photo is shown smaller than its file, so the zoom button zooms — to 1:1 at most.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.locator('#section-photos .field-notes-strip button').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await idle(page)
    g = await zoomGeometry(page)
    test.skip(g.native < 1.2, 'this store\'s first photo is not larger than a phone shows it')
    await expect(stage).toHaveAttribute('data-zoomable', 'true')
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await idle(page)
    const s = await scaleNow(page)
    expect(s, `zoomed to ${s}, the source allows ${g.native}`).toBeCloseTo(g.oneShot, 2)
    expect(g.fitted * s, 'never drawn wider than the file').toBeLessThanOrEqual(g.source + 1)
    await page.getByRole('button', { name: 'Zoom out' }).click()
    await idle(page)
    expect(await scaleNow(page)).toBe(1)
  })
})

test.describe('review-r3 visual: image viewer focus', () => {
  test('VISU-5: stepping with the arrow keys from a photo with zoom to one without, the focused zoom button hands the focus to Close', async ({ page }, testInfo) => {
    test.skip(desktopOnly(testInfo.project.name), 'desktop keyboard')
    await page.setViewportSize({ width: 1440, height: 900 })
    test.skip(!(await openFieldNote(page)), 'no Field Notes photos in this content store')
    await idle(page)
    const stage = page.locator('.lightbox-stage')
    const count = await page.locator('#section-photos .field-notes-strip button').count()
    // A photo with zoom followed by one without (both kinds depend on the store's photos).
    let found = false
    for (let i = 0; i < count && !found; i++) {
      const here = await stage.getAttribute('data-zoomable')
      await page.keyboard.press('ArrowRight')
      await idle(page)
      const next = await stage.getAttribute('data-zoomable')
      if (here === 'true' && next === 'false') {
        await page.keyboard.press('ArrowLeft')
        await idle(page)
        found = true
      }
    }
    test.skip(!found, 'no photo with zoom followed by one without in this store')
    const zoom = page.getByRole('button', { name: 'Zoom in' })
    await zoom.focus()
    await page.keyboard.press('ArrowRight')
    await expect(stage).toHaveAttribute('data-zoomable', 'false')
    await expect(zoom).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Close image viewer' })).toBeFocused()
    // The keys still reach the viewer.
    await idle(page)
    await page.keyboard.press('ArrowLeft')
    await expect(stage).toHaveAttribute('data-zoomable', 'true')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

// ── VISU-6 ────────────────────────────────────────────────────────────────────

test.describe('review-r3 visual: command palette', () => {
  test('VISU-6: on a Chinese page the result badges and a recent item\'s hint name the group in Chinese', async ({ page }, testInfo) => {
    test.skip(desktopOnly(testInfo.project.name), 'desktop keyboard')
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cmdk:recent:v1', JSON.stringify([{ id: 'page:/now', label: '近况', href: '/now', group: 'Pages' }]))
      } catch {
        /* storage off: the recent row is then simply absent */
      }
    })
    await page.goto('/cv/zh')
    await settle(page)
    await page.getByRole('button', { name: '打开命令面板' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // Browse view: the recent row's hint is the group's Chinese name.
    const recent = dialog.getByRole('option').filter({ hasText: '近况' }).first()
    await expect(recent).toContainText('页面')
    await expect(recent).not.toContainText('Pages')

    await dialog.getByRole('combobox').fill('简历')
    await expect(dialog.getByRole('option').first()).toBeVisible()
    const badges = await dialog.locator('[role="option"] > div:last-child > span:first-child').allTextContents()
    expect(badges.length).toBeGreaterThan(0)
    const RAW = ['Recent', 'On this page', 'Admin', 'Pages', 'Actions', 'Writing', 'Work', 'Content']
    for (const b of badges) expect(RAW, `badge "${b}"`).not.toContain(b.trim())
    expect(badges.map((b) => b.trim())).toContain('页面')
    await page.keyboard.press('Escape')
  })
})

// ── @admin: VISU-7 … VISU-10 ──────────────────────────────────────────────────

const adminFetch = (page: Page, method: string, url: string, body?: unknown) =>
  page.evaluate(
    async ([m, u, b]) => {
      const res = await fetch(u as string, { method: m as string, headers: { 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) })
      return { status: res.status, text: await res.text() }
    },
    [method, url, body] as const,
  )

/** The left edge of an element's text (not its padding box). */
const textLeft = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0)
    return Math.min(...rects.map((r) => r.left))
  })

test.describe('review-r3 visual: admin', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test('VISU-7: a CV Studio audience change confirms in words (the toast is never an empty pill)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await loginAsAdmin(page)
    await page.goto('/admin/dashboard?tab=cv')
    await page.getByRole('navigation', { name: 'CV sections' }).getByText('Personal Info').first().click()
    const chip = page.locator('[data-audience-toggle]').first()
    await expect(chip).toBeVisible()
    const name = (await chip.getAttribute('aria-label')) || ''
    const field = /^Where (.+?) shows/.exec(name)?.[1] || ''
    await chip.click()
    const downloads = page.getByRole('menuitemcheckbox', { name: /Downloads/ })
    await downloads.click()
    // Before the fix the status region held an empty stack: no words at all.
    const toast = page.locator('.chakra-toast [role="status"]').first()
    await expect(toast).toBeVisible()
    await expect(toast).toHaveText(/^“.+” (only on .+|shows everywhere) \(.+\)$/)
    await expect(toast).toContainText(field.replace(/^the /, '').replace(/ section$/, ''))
    // Put it back (nothing reaches the server: the Studio saves on Save only).
    await downloads.click()
    await page.keyboard.press('Escape')
  })

  test('VISU-8 / VISU-9: the review and draft bars line up with the page at every width; one rule under "Review links"', async ({ page, browser }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 1440, height: 900 })
    await loginAsAdmin(page)
    const slug = `e2e-r3-bar-${Date.now()}`
    const created = await adminFetch(page, 'PUT', '/api/admin/posts', {
      slug,
      create: true,
      frontmatter: { title: 'E2E bar alignment', date: new Date().toISOString().slice(0, 10), description: 'Created by the review-r3 end-to-end suite; deleted afterwards.', draft: true },
      body: 'A paragraph long enough to read as the body of a synthetic draft.\n',
    })
    expect(created.status, created.text).toBe(200)
    let linkId = ''
    try {
      const made = await adminFetch(page, 'POST', '/api/admin/review-links', { collection: 'blog', slug, ttlHours: 1, label: 'Example reviewer' })
      expect(made.status, made.text).toBe(201)
      const link = JSON.parse(made.text).link as { id: string; path: string }
      linkId = link.id

      // VISU-9: the section label draws the only rule over the first link.
      await page.goto('/admin/publishing')
      const first = page.getByTestId('review-list').getByTestId('review-link').first()
      await expect(first).toBeVisible()
      await expect(first).toHaveCSS('border-top-width', '0px')
      const second = page.getByTestId('review-list').getByTestId('review-link').nth(1)
      if (await second.count()) await expect(second).toHaveCSS('border-top-width', '1px')

      const visitor = await browser.newContext()
      try {
        const vp = await visitor.newPage()
        for (const width of [1440, 1024, 768, 375]) {
          await vp.setViewportSize({ width, height: 900 })
          await vp.goto(link.path)
          const bar = vp.getByTestId('review-bar')
          await expect(bar).toBeVisible()
          const edges = await vp.evaluate(() => {
            const brand = document.querySelector('header a[href="/"]')!.getBoundingClientRect()
            const row = document.querySelector('[data-testid="review-bar"] > div')!.getBoundingClientRect()
            const badge = document.querySelector('[data-testid="review-bar"] > div > span')!.getBoundingClientRect()
            const headerRow = document.querySelector('header > div')!.getBoundingClientRect()
            const pad = parseFloat(getComputedStyle(document.querySelector('header > div')!).paddingRight)
            return { brand: brand.left, badge: badge.left, rowRight: row.right - parseFloat(getComputedStyle(document.querySelector('[data-testid="review-bar"] > div')!).paddingRight), headerRight: headerRow.right - pad }
          })
          expect(Math.abs(edges.badge - edges.brand), `review bar badge vs brand at ${width}px`).toBeLessThan(1)
          expect(Math.abs(edges.rowRight - edges.headerRight), `review bar text edge vs header at ${width}px`).toBeLessThan(1)
        }
      } finally {
        await visitor.close()
      }

      // The draft bar (Draft Mode) the same way.
      await page.goto(`/api/admin/draft?path=${encodeURIComponent(`/blog/${slug}`)}`)
      await expect(page).toHaveURL(new RegExp(`/blog/${slug}$`))
      for (const width of [1440, 768]) {
        await page.setViewportSize({ width, height: 900 })
        const bar = page.getByRole('region', { name: 'Draft preview' })
        await expect(bar).toBeVisible()
        const d = await page.evaluate(() => {
          const brand = document.querySelector('header a[href="/"]')!.getBoundingClientRect()
          const region = document.querySelector('[aria-label="Draft preview"] > div > p')!.getBoundingClientRect()
          return { brand: brand.left, text: region.left }
        })
        expect(Math.abs(d.text - d.brand), `draft bar vs brand at ${width}px`).toBeLessThan(1)
      }
    } finally {
      if (linkId) await adminCleanup(page, 'DELETE', '/api/admin/review-links', { id: linkId })
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('VISU-10: on a phone the page-detail card\'s "View page" starts on the card\'s text edge; wide, it stays flush right', async ({ page }) => {
    await loginAsAdmin(page)
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/admin/dashboard?tab=analytics&period=7d&f=page:is:/cv')
      const card = page.locator('[data-page-detail]')
      await expect(card).toBeVisible()
      const view = card.getByRole('link', { name: /View page/ })
      await expect(view).toBeVisible()
      const titleLeft = await textLeft(page, '[data-page-detail] h3')
      const labelLeft = await view.evaluate((el) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        const node = walker.nextNode()!
        const range = document.createRange()
        range.selectNodeContents(node)
        return range.getBoundingClientRect().left
      })
      const viewBox = (await view.boundingBox())!
      const titleBox = (await card.locator('h3').boundingBox())!
      if (viewBox.y > titleBox.y + titleBox.height) {
        // Wrapped under the title: the label on the text edge.
        expect(Math.abs(labelLeft - titleLeft), `"View page" vs the title at ${width}px`).toBeLessThan(1)
      } else {
        // One line: the actions end at the card's content edge.
        const right = await card.evaluate((el) => {
          const cs = getComputedStyle(el)
          return el.getBoundingClientRect().right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight)
        })
        const group = await view.evaluate((el) => el.parentElement!.getBoundingClientRect().right)
        expect(Math.abs(group - right), `actions flush right at ${width}px`).toBeLessThan(1)
      }
    }
  })
})
