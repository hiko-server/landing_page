import { devices, type Page } from '@playwright/test'
import { test, expect, settle } from './fixtures'

/**
 * Route transitions, reveals, focus management and keyboard shortcuts
 * (desktop Chromium project; the drawer check emulates a Pixel 7).
 */

type VtRecord = { types: string[] | null; layers: string[]; hiddenAfterUpdate: boolean[] }

/** Records every document.startViewTransition call: its types and the open layers' names / visibility. */
async function recordViewTransitions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __vt: VtRecord[]; __vtRunning: number }
    w.__vt = []
    w.__vtRunning = 0
    const proto = Document.prototype as unknown as { startViewTransition?: (arg: unknown) => { finished: Promise<void> } }
    const original = proto.startViewTransition
    if (typeof original !== 'function') return
    proto.startViewTransition = function (this: Document, arg: unknown) {
      const layerEls = Array.from(document.querySelectorAll<HTMLElement>('.chakra-modal__overlay, .chakra-modal__content'))
      const record: VtRecord = {
        types: typeof arg === 'function' ? null : ((arg as { types?: string[] })?.types ?? null),
        layers: layerEls.map((el) => el.style.viewTransitionName),
        hiddenAfterUpdate: [],
      }
      w.__vt.push(record)
      const update = typeof arg === 'function' ? arg : (arg as { update: () => unknown }).update
      const wrapped = async () => {
        await update()
        record.hiddenAfterUpdate = layerEls.map((el) => el.style.visibility === 'hidden')
      }
      const vt = original.call(this, typeof arg === 'function' ? wrapped : { ...(arg as object), update: wrapped })
      w.__vtRunning += 1
      vt.finished.finally(() => {
        w.__vtRunning -= 1
      })
      return vt
    }
  })
}

const transitions = (page: Page) => page.evaluate(() => (window as unknown as { __vt: VtRecord[] }).__vt)
const idle = (page: Page) => page.waitForFunction(() => (window as unknown as { __vtRunning: number }).__vtRunning === 0)
const primaryNav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name, exact: true })

test('Back / Forward run the directional route transition (Chromium)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'transition types are Chromium-only')
  await recordViewTransitions(page)
  await page.goto('/blog')
  await settle(page)
  test.skip(!(await page.evaluate(() => 'startViewTransition' in document)), 'no View Transitions API')

  await primaryNav(page, 'Work').click()
  await page.waitForURL('**/work')
  await idle(page)
  await primaryNav(page, 'About').click()
  await page.waitForURL('**/about')
  await idle(page)
  expect((await transitions(page)).map((t) => t.types)).toEqual([['forward'], ['forward']])

  await page.goBack()
  await page.waitForURL('**/work')
  await expect.poll(async () => (await transitions(page)).length).toBe(3)
  expect((await transitions(page))[2].types).toEqual(['back'])
  await idle(page)

  await page.goForward()
  await page.waitForURL('**/about')
  await expect.poll(async () => (await transitions(page)).length).toBe(4)
  expect((await transitions(page))[3].types).toEqual(['forward'])
  await idle(page)
})

test('Back with the ⌘K palette open closes it, and it leaves the page snapshot', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'keyboard shortcut — desktop only')
  await recordViewTransitions(page)
  // Static pages: Back renders /work from Next's data cache at once, while
  // the palette is still on screen.
  await page.goto('/work')
  await settle(page)
  test.skip(!(await page.evaluate(() => 'startViewTransition' in document)), 'no View Transitions API')
  await primaryNav(page, 'Now').click()
  await page.waitForURL('**/now')
  await idle(page)
  await page.keyboard.press('ControlOrMeta+KeyK')
  const palette = page.getByRole('dialog', { name: /command palette/i })
  await expect(palette).toBeVisible()
  await page.goBack()
  await page.waitForURL('**/work')
  await expect(palette).toHaveCount(0)
  await expect.poll(async () => (await transitions(page)).length).toBe(2)
  await idle(page)
  const back = (await transitions(page))[1]
  expect(back.types).toEqual(['back'])
  // The palette had its own snapshot and was not part of the new state.
  expect(back.layers.length).toBeGreaterThan(0)
  expect(back.layers.every((name) => /^vt-layer-\d+$/.test(name))).toBe(true)
  expect(back.hiddenAfterUpdate.every(Boolean)).toBe(true)
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('main')
})

/**
 * From the next animation frame on, waits for `pathname` with its sections
 * rendered and returns, for that first frame, every section / reveal wrapper
 * / list row in the viewport whose effective opacity is below 1.
 */
async function armFirstFrameProbe(page: Page, pathname: string, readySelector: string): Promise<void> {
  await page.evaluate(
    ({ pathname, readySelector }) => {
      const w = window as unknown as { __firstFrame?: string[] }
      delete w.__firstFrame
      const effectiveOpacity = (el: Element | null) => {
        let o = 1
        for (let n = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity)
        return o
      }
      const sample = () => {
        if (location.pathname !== pathname || !document.querySelector(readySelector)) {
          requestAnimationFrame(sample)
          return
        }
        const nodes = Array.from(document.querySelectorAll('main section, main [data-reveal], main section li, main .section-heading'))
        w.__firstFrame = nodes
          .filter((n) => {
            const r = n.getBoundingClientRect()
            return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight
          })
          .filter((n) => effectiveOpacity(n) < 0.99)
          .map((n) => `${n.tagName.toLowerCase()}#${n.id || ''}.${(n.getAttribute('class') || '').split(' ')[0]} opacity=${effectiveOpacity(n).toFixed(2)}`)
      }
      requestAnimationFrame(sample)
    },
    { pathname, readySelector },
  )
}

const firstFrame = (page: Page) =>
  page.waitForFunction(() => (window as unknown as { __firstFrame?: string[] }).__firstFrame).then((h) => h.jsonValue())

test('after a client navigation, everything in the first viewport is visible in the first frame', async ({ page }) => {
  // /about: the identity rail, the tagline and the open CV sit in the first viewport.
  await page.goto('/')
  await settle(page)
  await armFirstFrameProbe(page, '/about', 'main [aria-labelledby="about-cv-heading"]')
  await primaryNav(page, 'About').click()
  expect(await firstFrame(page), 'hidden in the first frame on /about').toEqual([])

  // Back to / with the scroll position restored at the projects section.
  await page.goto('/')
  await settle(page)
  const projects = page.locator('#section-projects')
  test.skip((await projects.count()) === 0, 'the content store has no projects section')
  await projects.scrollIntoViewIfNeeded()
  await settle(page)
  await primaryNav(page, 'Writing').click()
  await page.waitForURL('**/blog')
  await settle(page)
  await armFirstFrameProbe(page, '/', '#section-projects')
  await page.goBack()
  expect(await firstFrame(page), 'hidden in the first frame on / after Back').toEqual([])
  await expect(projects).toBeInViewport()

  // Below the fold, sections still reveal as they scroll in (and are never left hidden).
  const contact = page.locator('#section-contact')
  await contact.scrollIntoViewIfNeeded()
  await expect.poll(() => contact.evaluate((el) => parseFloat(getComputedStyle(el.closest('[data-reveal]') || el).opacity))).toBe(1)
})

test('focus moves to <main> after a page change, never under the sticky header', async ({ page }) => {
  await page.goto('/')
  await settle(page)
  // The header offset is a scroll margin on targets inside <main>, not a root scroll padding (UX-1).
  expect(
    await page.evaluate(() => ({
      root: getComputedStyle(document.documentElement).scrollPaddingTop,
      main: getComputedStyle(document.getElementById('main')!).scrollMarginTop,
      link: getComputedStyle(document.querySelector('main a[href]')!).scrollMarginTop,
      headerLink: getComputedStyle(document.querySelector('header a[href]')!).scrollMarginTop,
    })),
  ).toEqual({ root: 'auto', main: '73px', link: '73px', headerLink: '0px' })

  // Keyboard-activated header link: focus lands in the new page.
  await primaryNav(page, 'About').focus()
  await page.keyboard.press('Enter')
  await page.waitForURL('**/about')
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('main')
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => !!document.activeElement?.closest('main')), 'next Tab starts in the page').toBe(true)

  // A hash-only change on the same page leaves focus alone.
  const brand = page.getByRole('link', { name: /— home$/ })
  await brand.focus()
  await page.evaluate(() => (window as unknown as { next: { router: { push: (u: string) => Promise<boolean> } } }).next.router.push('/about#about-activity'))
  await page.waitForURL('**/about#about-activity')
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || '')).toMatch(/— home$/)

  // Shift+Tab sweep from the end of the page: no focused control hides under the header.
  for (const path of ['/about', '/contact']) {
    await page.goto(path)
    await settle(page)
    await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll<HTMLElement>('main a[href], main button, main input, main select, main textarea, main summary'))
      const visible = all.filter((el) => el.checkVisibility() && !el.closest('[inert], [aria-hidden="true"]'))
      visible[visible.length - 1]?.focus()
    })
    const covered: string[] = []
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Shift+Tab')
      const problem = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        const header = document.querySelector('header')
        if (!el || !header || el === document.body || header.contains(el) || el.classList.contains('skip-nav')) return null
        const r = el.getBoundingClientRect()
        const headerBottom = header.getBoundingClientRect().bottom
        const fits = r.height < innerHeight - headerBottom
        return (fits ? r.top < headerBottom - 1 : r.bottom <= headerBottom) ? `${(el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 40)} top=${Math.round(r.top)}` : null
      })
      if (problem) covered.push(problem)
    }
    expect(covered, `${path}: focused controls under the sticky header`).toEqual([])
  }
})

/** Scrolls the window to `y` (clamped to the page) and returns the settled scrollY. */
async function scrollToY(page: Page, y: number): Promise<number> {
  await page.evaluate((target) => window.scrollTo(0, Math.min(target, document.documentElement.scrollHeight - innerHeight)), y)
  return settledScrollY(page)
}

/** scrollY once it has stopped changing for two frames. */
async function settledScrollY(page: Page): Promise<number> {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const y = scrollY
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(scrollY === y)))
      }),
  )
  return page.evaluate(() => Math.round(scrollY))
}

const focusedIn = (page: Page, selector: string) => page.evaluate((sel) => !!document.activeElement?.closest(sel), selector)

test('focus moving into the sticky header never scrolls the page: Shift+Tab / Tab, closing the ⌘K palette', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'desktop header')
  await page.goto('/about')
  await settle(page)
  const y0 = await scrollToY(page, 1500)
  expect(y0, 'the page scrolls').toBeGreaterThan(300)

  // Focus on <main> (as after a page change), then Shift+Tab into the header and Tab / Shift+Tab across it.
  await page.locator('#main').evaluate((el: HTMLElement) => el.focus({ preventScroll: true }))
  for (const key of ['Shift+Tab', 'Shift+Tab', 'Shift+Tab', 'Tab', 'Tab']) {
    await page.keyboard.press(key)
    expect(await focusedIn(page, 'header'), `${key}: focus in the header`).toBe(true)
    expect(await settledScrollY(page), `${key} moved focus within the header`).toBe(y0)
  }

  // ⌘K from a header control, then Escape: focus returns to that control, the page stays put.
  await page.getByRole('button', { name: 'Open command palette' }).click()
  const palette = page.getByRole('dialog', { name: /command palette/i })
  await expect(palette).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(palette).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Open command palette')
  expect(await settledScrollY(page), 'closing the palette').toBe(y0)
})

test('heading, section and footnote anchors land just below the sticky header (not under it, not offset twice)', async ({ page }) => {
  /** Gap between the header's bottom edge and the target's top once scrolling settled; `clamped` when the page could not scroll further. */
  const landing = async (selector: string) => {
    await settledScrollY(page)
    return page.evaluate((sel) => {
      const el = document.querySelector(sel)!
      const header = document.querySelector('header')!
      const max = document.documentElement.scrollHeight - innerHeight
      return { gap: Math.round(el.getBoundingClientRect().top - header.getBoundingClientRect().bottom), clamped: scrollY <= 0 || scrollY >= max - 1 }
    }, selector)
  }
  const expectJustBelow = (where: string, r: { gap: number; clamped: boolean }) => {
    expect(r.gap, `${where}: not under the header`).toBeGreaterThanOrEqual(0)
    // header + 16px + a little air per target; a second header offset would add 73px more.
    if (!r.clamped) expect(r.gap, `${where}: just below the header`).toBeLessThanOrEqual(56)
  }

  // /colophon sections (always present): "On this page" links.
  await page.goto('/colophon')
  await settle(page)
  for (const id of ['hosting', 'privacy']) {
    if ((await page.locator(`#${id}`).count()) === 0) continue
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.evaluate((hash) => {
      location.hash = hash
    }, id)
    expectJustBelow(`/colophon#${id}`, await landing(`#${id}`))
  }

  // Footnotes inside rendered Markdown (the release notes' prose): a reference and its note,
  // placed mid-page, exactly as remark-gfm renders them.
  const prose = page.locator('main .article-prose').nth(1)
  if ((await prose.count()) > 0) {
    await prose.evaluate((el) => {
      el.insertAdjacentHTML(
        'afterbegin',
        '<p>Claim<sup><a href="#user-content-fn-e2e" id="user-content-fnref-e2e" data-footnote-ref="">1</a></sup></p>',
      )
      el.insertAdjacentHTML(
        'beforeend',
        '<section data-footnotes=""><ol><li id="user-content-fn-e2e"><p>Note <a href="#user-content-fnref-e2e" data-footnote-backref="">↩</a></p></li></ol></section>',
      )
    })
    await page.locator('#user-content-fnref-e2e').evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await page.locator('#user-content-fnref-e2e').click()
    expectJustBelow('footnote', await landing('#user-content-fn-e2e'))
    await page.locator('[data-footnote-backref][href="#user-content-fnref-e2e"]').click()
    expectJustBelow('footnote back link', await landing('#user-content-fnref-e2e'))
  }

  // Article headings, when the store has a post.
  await page.goto('/blog')
  await settle(page)
  // An empty store (the CI container) has no post: count first, so nothing waits for a link that never comes.
  const postLink = page.locator('main a[href^="/blog/"]').first()
  if ((await postLink.count()) === 0) return
  const post = await postLink.getAttribute('href')
  if (!post) return
  await page.goto(post)
  await settle(page)
  const ids = await page.locator('main .article-prose :is(h2, h3)[id]').evaluateAll((els) => els.map((el) => el.id))
  for (const id of ids.slice(1, 3)) {
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.evaluate((hash) => {
      location.hash = hash
    }, id)
    expectJustBelow(`${post}#${id}`, await landing(`[id="${id}"]`))
  }
})

test('single-key shortcuts can be turned off from the ⌘K palette (WCAG 2.1.4)', async ({ page }) => {
  await page.goto('/about')
  await settle(page)
  await page.keyboard.press('g')
  await page.keyboard.press('h')
  await page.waitForURL((url) => url.pathname === '/')

  const toggle = async (state: 'on' | 'off') => {
    await page.keyboard.press('ControlOrMeta+KeyK')
    const input = page.getByRole('combobox', { name: /search/i })
    await expect(input).toBeVisible()
    await input.fill('keyboard shortcuts')
    // The results replace the browse view (where a Recent repeats the toggle) once the deferred ranking lands.
    const row = page.getByRole('option', { name: new RegExp(`Keyboard shortcuts: ${state}`) })
    await expect(row).toHaveCount(1)
    await row.click()
    await expect(page.getByRole('dialog', { name: /command palette/i })).toBeHidden()
  }

  await page.goto('/about')
  await settle(page)
  await toggle('on')
  await expect(page.getByText('Keyboard shortcuts off', { exact: true })).toBeVisible()
  await page.keyboard.press('g')
  await page.keyboard.press('h')
  await page.keyboard.press('/')
  await page.waitForTimeout(1500)
  expect(new URL(page.url()).pathname).toBe('/about')
  await expect(page.getByRole('dialog', { name: /command palette/i })).toHaveCount(0)

  // The choice survives a reload (localStorage), and ⌘K still works.
  await page.reload()
  await settle(page)
  await page.keyboard.press('g')
  await page.keyboard.press('h')
  await page.waitForTimeout(1500)
  expect(new URL(page.url()).pathname).toBe('/about')
  await toggle('off')
  await page.keyboard.press('g')
  await page.keyboard.press('h')
  await page.waitForURL((url) => url.pathname === '/')
})

test.describe('mobile menu', () => {
  // Pixel 7 emulation (its defaultBrowserType cannot be set inside a describe).
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7']
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch })

  test('an open menu fades out on its own instead of sliding over the next page', async ({ page }) => {
    await recordViewTransitions(page)
    await page.goto('/about')
    await settle(page)
    test.skip(!(await page.evaluate(() => 'startViewTransition' in document)), 'no View Transitions API')
    await page.getByRole('button', { name: 'Open menu' }).click()
    const menu = page.getByRole('dialog')
    await expect(menu).toBeVisible()
    // /blog is static and prefetched: the route renders a few ms after the
    // tap, while the menu is still fully open (the case that ghosted).
    await page.evaluate(() => (window as unknown as { next: { router: { prefetch: (u: string) => Promise<void> } } }).next.router.prefetch('/blog'))
    await menu.getByRole('link', { name: 'Writing', exact: true }).click()
    await page.waitForURL('**/blog')
    await expect.poll(async () => (await transitions(page)).length).toBe(1)
    await idle(page)
    const [vt] = await transitions(page)
    // Every modal layer still in the DOM when the old state was captured had its
    // own snapshot (locally the static route renders while the menu is fully
    // open, so scrim and panel are there). Over a real network the next page's
    // data can arrive after the menu has already closed — then no layer is left
    // to capture and nothing can ghost, so an empty list is fine too.
    expect(vt.layers.every((name) => /^vt-layer-\d+$/.test(name))).toBe(true)
    expect(new Set(vt.layers).size).toBe(vt.layers.length)
    // …and none of them was part of the new state.
    expect(vt.hiddenAfterUpdate.every(Boolean)).toBe(true)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    // The menu closed because the page changed: focus is in the new page, not on the hamburger.
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('main')
  })

  test('closing the menu returns focus to the hamburger without scrolling the page', async ({ page }) => {
    await page.goto('/about')
    await settle(page)
    const y0 = await scrollToY(page, 1500)
    expect(y0, 'the page scrolls').toBeGreaterThan(300)
    await page.getByRole('button', { name: 'Open menu' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Open menu')
    expect(await settledScrollY(page), 'focus back on the header button').toBe(y0)
  })

  test('Tab into and across the /cv bottom action bar never scrolls the page', async ({ page }) => {
    await page.goto('/cv')
    await settle(page)
    const bar = page.locator('nav[data-bottom-bar]')
    test.skip(!(await bar.isVisible()), 'no action bar on this page')
    const y0 = await scrollToY(page, 900)
    expect(y0, 'the page scrolls').toBeGreaterThan(200)
    // Focus the last control before the bar (in DOM order) without scrolling, then Tab into the bar.
    const entered = await page.evaluate(() => {
      const nav = document.querySelector('nav[data-bottom-bar]')!
      const focusable = Array.from(document.querySelectorAll<HTMLElement>('main a[href], main button:not([disabled]), main [tabindex="0"], main details > summary')).filter(
        (el) => el.checkVisibility() && !nav.contains(el) && el.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING,
      )
      const before = focusable[focusable.length - 1]
      if (!before) return false
      before.focus({ preventScroll: true })
      return true
    })
    expect(entered).toBe(true)
    const y1 = await settledScrollY(page)
    await page.keyboard.press('Tab')
    expect(await focusedIn(page, 'nav[data-bottom-bar]'), 'Tab entered the bar').toBe(true)
    expect(await settledScrollY(page), 'Tab into the bar').toBe(y1)
    const controls = await bar.locator('a[href], button:not([disabled])').count()
    for (let i = 1; i < controls; i++) {
      await page.keyboard.press('Tab')
      expect(await focusedIn(page, 'nav[data-bottom-bar]')).toBe(true)
      expect(await settledScrollY(page), `Tab ${i} within the bar`).toBe(y1)
    }
    await page.keyboard.press('Shift+Tab')
    expect(await settledScrollY(page), 'Shift+Tab within the bar').toBe(y1)
  })
})
