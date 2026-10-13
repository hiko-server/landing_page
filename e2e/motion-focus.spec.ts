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
        const nodes = Array.from(document.querySelectorAll('main section, main [data-reveal], main section li, main .section-label-rule'))
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
  // /about: the stats and contributions wrappers sit in the first viewport.
  await page.goto('/')
  await settle(page)
  await armFirstFrameProbe(page, '/about', 'main [aria-labelledby="about-activity"]')
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
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingTop)).toBe('73px')

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
    await page.getByRole('option', { name: new RegExp(`Keyboard shortcuts: ${state}`) }).click()
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
    // Scrim and panel each had their own snapshot when the old state was captured…
    expect(vt.layers.length).toBeGreaterThan(0)
    expect(vt.layers.every((name) => /^vt-layer-\d+$/.test(name))).toBe(true)
    expect(new Set(vt.layers).size).toBe(vt.layers.length)
    // …and none of them was part of the new state.
    expect(vt.hiddenAfterUpdate.every(Boolean)).toBe(true)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    // The menu closed because the page changed: focus is in the new page, not on the hamburger.
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('main')
  })
})
