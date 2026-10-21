import type { BrowserContext, Page } from '@playwright/test'
import { test, expect, ADMIN, loginAsAdmin, settle, seriousA11yViolations } from './fixtures'

/**
 * Review round 3, HEADER-ADMIN (fix3-D): the header with the owner signed
 * in. The two text buttons (Dashboard, Logout) used to fill the right-hand
 * group, so from 992 to about 1040 px the production wordmark ran up to
 * 42 px into the primary nav on pages with a language switch, and the nav
 * sat somewhere else on every page with or without one — and moved when
 * the buttons appeared, after the first paint. The owner's controls are now
 * one menu button beside the wordmark (components/Header/AdminMenu), which
 * the left share always has room for, and the switch's place is kept for
 * the owner too.
 *
 *   - signed in, 992–1280 px on /now and /cv (and /cv/zh): the wordmark,
 *     the owner's menu, the live status, the nav and the right-hand group
 *     never overlap; the nav is at one place on both pages, and where a
 *     visitor sees it;
 *   - nothing moves when the owner's menu appears (the session answer is
 *     held back, then released);
 *   - the owner's menu works from the keyboard and the pointer, in English
 *     and Chinese; below lg the drawer has the same actions;
 *   - 320–1920 px, signed in and out: no header item overlaps another or
 *     leaves the viewport;
 *   - with a ninth nav link (Publications, once the owner has a public
 *     paper) the row still fits, signed in and out.
 *
 * The production wordmark ("lucian-dev.com", the widest the brand gets) is
 * written into the header, as the VISU-2 check does; the live status is
 * given a commit 13 days old ("13d ago", its widest English form), so it
 * shows at xl (stubbed after signing in: with a route on the context, the
 * sign-in's full-page hop to /admin can abort Chromium's cross-document
 * view transition, an uncaught InvalidStateError — it happens without this
 * change too). Nothing is written to the server; the owner's Log out item
 * is never pressed (the session is shared by the run's admin tests).
 */

type Box = { name: string; left: number; right: number }
type HeaderGeometry = { items: Box[]; vw: number; scrollWidth: number; navLeft: number | null }

const LEFT = new Set(['brand', 'admin', 'status'])

/** A commit 13 days old: the live status shows (xl) at its widest English length. */
async function stubLiveStatus(context: BrowserContext): Promise<void> {
  const at = new Date(Date.now() - 13 * 86_400_000 - 3_600_000).toISOString()
  await context.route('**/api/github/events', (route) => route.fulfill({ json: { events: [{ type: 'PushEvent', created_at: at }] } }))
}

/** Every visible header item, left to right, with the production wordmark written in. */
async function headerGeometry(page: Page): Promise<HeaderGeometry> {
  return page.evaluate(() => {
    const header = document.querySelector('header') as HTMLElement
    const brand = header.querySelector('a[href="/"]') as HTMLElement
    const spans = brand.querySelectorAll(':scope > span')
    spans[0].textContent = 'lucian-dev'
    if (spans[1]) spans[1].textContent = '.com'
    const shown = (el: Element | null): el is HTMLElement => {
      if (!el) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
    }
    const box = (name: string, el: Element) => {
      const r = el.getBoundingClientRect()
      return { name, left: r.left, right: r.right }
    }
    const range = document.createRange()
    range.selectNodeContents(brand)
    const text = range.getBoundingClientRect()
    const items = [{ name: 'brand', left: text.left, right: text.right }]
    const admin = header.querySelector('[data-admin-menu]')
    if (shown(admin)) items.push(box('admin', admin))
    const status = header.querySelector('[data-live-status], [title^="Last commit"], [title^="最近提交"]')
    if (shown(status)) items.push(box('status', status))
    const nav = header.querySelector('nav')
    if (shown(nav)) nav.querySelectorAll('a').forEach((a) => items.push(box(`nav "${a.textContent}"`, a)))
    // The right-hand group: the language switch (not its kept, empty place), ⌘K, the theme control, the hamburger.
    const right = header.querySelector('nav')!.nextElementSibling as HTMLElement
    for (const el of Array.from(right.children)) {
      const target = el.matches('[data-lang-slot]') ? el.querySelector('[data-lang-switch]') : el
      if (shown(target)) items.push(box(target.getAttribute('aria-label') || target.textContent || target.tagName, target))
    }
    return {
      items: items.sort((a, b) => a.left - b.left),
      vw: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      navLeft: shown(nav) ? nav.querySelector('a')!.getBoundingClientRect().left : null,
    }
  })
}

/** No two items overlap, none leaves the viewport, the page does not scroll sideways; left group, nav and right group keep `gap` px apart. */
function expectClear(g: HeaderGeometry, where: string, gap = 8): void {
  for (let i = 1; i < g.items.length; i++) {
    const [a, b] = [g.items[i - 1], g.items[i]]
    const between = LEFT.has(a.name) !== LEFT.has(b.name) || a.name.startsWith('nav') !== b.name.startsWith('nav') ? gap : 0
    expect(b.left - a.right, `${where}: ${a.name} [${a.left.toFixed(1)}–${a.right.toFixed(1)}] then ${b.name} [${b.left.toFixed(1)}–${b.right.toFixed(1)}]`).toBeGreaterThanOrEqual(between - 0.5)
  }
  for (const it of g.items) {
    expect(it.left, `${where}: ${it.name} starts on screen`).toBeGreaterThanOrEqual(0)
    expect(it.right, `${where}: ${it.name} ends on screen`).toBeLessThanOrEqual(g.vw + 0.5)
  }
  expect(g.scrollWidth, `${where}: no sideways scroll`).toBeLessThanOrEqual(g.vw)
}

/**
 * Load `path` and wait for what the header shows at this width: the owner's
 * controls (lg+, signed in), the live status (md, and xl+). Either form of
 * the controls and the status is waited for (the menu or the old Dashboard
 * link; the status by its title too), so against the previous header these
 * checks fail on its overlap rather than on a missing hook.
 */
async function openSettled(page: Page, path: string, { signedIn }: { signedIn: boolean }): Promise<void> {
  await page.goto(path)
  const width = page.viewportSize()!.width
  if (signedIn && width >= 992) await expect(page.locator('header [data-admin-menu], header a[href="/admin/dashboard"]').first()).toBeVisible()
  if (width >= 1280 || (width >= 768 && width < 992)) await expect(page.locator('header [data-live-status], header [title^="Last commit"], header [title^="最近提交"]').first()).toBeVisible()
  await settle(page)
}

/** A ninth primary link where Publications joins the nav (after CV): a copy of an inactive link (Contact). */
async function addNinthLink(page: Page): Promise<void> {
  await page.evaluate(() => {
    const nav = document.querySelector('header nav')!
    const links = Array.from(nav.querySelectorAll('a'))
    const cv = links.find((a) => /^\/cv(\/zh)?$/.test(a.getAttribute('href') || ''))!
    const extra = links[links.length - 1].cloneNode(true) as HTMLAnchorElement
    extra.textContent = document.documentElement.lang.startsWith('zh') ? '论文' : 'Publications'
    extra.setAttribute('href', '/publications')
    cv.after(extra)
  })
}

const desktopOnly = (project: string) => project !== 'chromium'

// ── Signed out (public) ───────────────────────────────────────────────────────

test.describe('review-r3 header (signed out)', () => {
  test('HEADER-ADMIN: from 320 to 1920 px no header item overlaps another or leaves the screen', async ({ page, context }, testInfo) => {
    test.skip(desktopOnly(testInfo.project.name), 'sets its own widths')
    test.setTimeout(120_000)
    await stubLiveStatus(context)
    for (const width of [320, 360, 375, 414, 768, 991, 992, 1024, 1100, 1279, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 800 })
      for (const path of ['/now', '/cv', '/cv/zh']) {
        await openSettled(page, path, { signedIn: false })
        expectClear(await headerGeometry(page), `${path} at ${width}px`, width >= 992 ? 8 : 0)
      }
    }
  })

  test('HEADER-ADMIN: with a ninth nav link (Publications) the row still fits; the links tighten and ⌘K keeps its icon and name', async ({ page, context }, testInfo) => {
    test.skip(desktopOnly(testInfo.project.name), 'sets its own widths')
    await stubLiveStatus(context)
    for (const width of [992, 1024, 1279, 1280, 1440]) {
      await page.setViewportSize({ width, height: 800 })
      for (const path of ['/cv', '/cv/zh']) {
        await openSettled(page, path, { signedIn: false })
        await addNinthLink(page)
        expectClear(await headerGeometry(page), `${path} at ${width}px with nine links`)
        const link = page.locator('header nav a').first()
        expect(await link.evaluate((a) => getComputedStyle(a).paddingLeft)).toBe('7px')
        await expect(page.locator('header [data-search-label]')).toBeHidden()
        await expect(page.locator('header').getByRole('button', { name: path === '/cv' ? 'Open command palette' : '打开命令面板' })).toBeVisible()
      }
    }
    // Eight links: as before (10 px, and the word at xl).
    await page.goto('/cv')
    expect(await page.locator('header nav a').first().evaluate((a) => getComputedStyle(a).paddingLeft)).toBe('10px')
    await expect(page.locator('header [data-search-label]')).toBeVisible()
  })
})

// ── Signed in (@admin) ────────────────────────────────────────────────────────

test.describe('review-r3 header (signed in)', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test('HEADER-ADMIN: at 992–1280 px on /now and /cv the wordmark, the owner\'s menu, the nav and the right-hand group never overlap; the nav stays put', async ({ page, context, browser }) => {
    test.setTimeout(180_000)
    await loginAsAdmin(page)
    await stubLiveStatus(context)
    // A visitor's header, for where the nav belongs.
    const visitor = await browser.newContext()
    await stubLiveStatus(visitor)
    const visitorPage = await visitor.newPage()
    try {
      for (const width of [992, 1000, 1024, 1040, 1100, 1280]) {
        await page.setViewportSize({ width, height: 800 })
        await visitorPage.setViewportSize({ width, height: 800 })
        const navAt: Record<string, number> = {}
        for (const path of ['/now', '/cv', '/cv/zh']) {
          await openSettled(page, path, { signedIn: true })
          const g = await headerGeometry(page)
          expectClear(g, `signed in, ${path} at ${width}px`)
          // Brand, then the owner's menu right beside it, then (xl) the live status.
          expect(g.items.slice(0, width >= 1280 ? 3 : 2).map((i) => i.name)).toEqual(width >= 1280 ? ['brand', 'admin', 'status'] : ['brand', 'admin'])
          navAt[path] = g.navLeft!
          // Where a visitor sees it: the owner's menu moved nothing.
          await openSettled(visitorPage, path, { signedIn: false })
          const v = await headerGeometry(visitorPage)
          expect(Math.abs(g.navLeft! - v.navLeft!), `${path} at ${width}px: the nav where a visitor sees it`).toBeLessThan(0.5)
          const lastRight = (x: HeaderGeometry) => x.items[x.items.length - 1].right
          expect(Math.abs(lastRight(g) - lastRight(v)), `${path} at ${width}px: the right-hand group where a visitor sees it`).toBeLessThan(0.5)
        }
        expect(Math.abs(navAt['/now'] - navAt['/cv']), `nav at ${width}px: /now vs /cv`).toBeLessThan(0.5)
      }
    } finally {
      await visitor.close()
    }
  })

  test('HEADER-ADMIN: the nav does not move between /now and /cv during a client-side navigation, signed in', async ({ page, context }) => {
    await loginAsAdmin(page)
    await stubLiveStatus(context)
    for (const width of [992, 1024, 1280]) {
      await page.setViewportSize({ width, height: 800 })
      await openSettled(page, '/now', { signedIn: true })
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

  test('HEADER-ADMIN: nothing in the header moves when the owner\'s menu appears after the first paint', async ({ page, context }) => {
    await loginAsAdmin(page)
    await stubLiveStatus(context)
    for (const width of [992, 1280]) {
      await page.setViewportSize({ width, height: 800 })
      // Hold the session answer back: the header paints as a visitor's first.
      let release: () => void = () => undefined
      const held = new Promise<void>((resolve) => (release = resolve))
      await page.route('**/api/admin/session', async (route) => {
        await held
        await route.fallback()
      })
      await page.goto('/cv')
      await settle(page)
      await expect(page.locator('header [data-admin-menu]')).toHaveCount(0)
      const before = await headerGeometry(page)
      // Every frame from the answer on: where the live status is, and whether the menu is there yet.
      await page.evaluate(() => {
        const w = window as unknown as { __frames: { menu: boolean; status: number | null }[] }
        w.__frames = []
        const loop = () => {
          const status = document.querySelector('header [data-live-status]')
          w.__frames.push({ menu: !!document.querySelector('header [data-admin-menu]'), status: status ? status.getBoundingClientRect().left : null })
          if (w.__frames.length < 90) requestAnimationFrame(loop)
        }
        requestAnimationFrame(loop)
      })
      release()
      await expect(page.locator('header [data-admin-menu]')).toBeVisible()
      if (width >= 1280) await expect(page.locator('header [data-live-status]')).toBeVisible()
      await expect.poll(() => page.evaluate(() => (window as unknown as { __frames: unknown[] }).__frames.length)).toBe(90)
      await settle(page)
      const after = await headerGeometry(page)
      // The wordmark, the nav and the right-hand group: exactly where they were painted.
      for (const it of before.items) {
        const now = after.items.find((x) => x.name === it.name)!
        expect(Math.abs(now.left - it.left), `${it.name} at ${width}px stays put`).toBeLessThan(0.5)
      }
      // The live status never shows before the owner's menu, so the menu never pushes it aside.
      const frames = await page.evaluate(() => (window as unknown as { __frames: { menu: boolean; status: number | null }[] }).__frames)
      const shown = frames.filter((f) => f.status !== null)
      expect(shown.every((f) => f.menu), `at ${width}px the status waits for the menu`).toBe(true)
      expect(new Set(shown.map((f) => Math.round(f.status! * 10))).size, `at ${width}px the status never moves`).toBeLessThanOrEqual(1)
      await page.unroute('**/api/admin/session')
    }
  })

  test('HEADER-ADMIN: the owner\'s menu — keyboard, pointer, Chinese, and the drawer below lg', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await loginAsAdmin(page)
    await page.goto('/cv')
    const trigger = page.locator('header [data-admin-menu]').getByRole('button', { name: 'Admin' })
    await expect(trigger).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    // The old pair is gone from the right-hand group.
    await expect(page.locator('header').getByRole('link', { name: 'Dashboard' })).toHaveCount(0)

    // Keyboard: Enter opens on the first item; arrows wrap; Escape returns focus.
    await trigger.focus()
    await page.keyboard.press('Enter')
    const menu = page.getByRole('menu', { name: 'Admin' })
    await expect(menu).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const dashboard = menu.getByRole('menuitem', { name: 'Dashboard' })
    const logout = menu.getByRole('menuitem', { name: 'Logout' })
    await expect(dashboard).toBeFocused()
    await expect(dashboard).toHaveAttribute('href', '/admin/dashboard')
    await expect(logout).toHaveAttribute('title', /Sign out of this browser/)
    await page.keyboard.press('ArrowDown')
    await expect(logout).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(dashboard).toBeFocused()
    await page.keyboard.press('End')
    await expect(logout).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(trigger).toBeFocused()
    // ArrowUp opens on the last item.
    await page.keyboard.press('ArrowUp')
    await expect(logout).toBeFocused()
    await page.keyboard.press('Escape')

    // Pointer: a click opens, a click outside closes. Open, the page passes axe (WCAG 2.2 AA).
    await trigger.click()
    await expect(menu).toBeVisible()
    await settle(page)
    expect(await seriousA11yViolations(page)).toEqual([])
    await page.mouse.click(640, 500)
    await expect(menu).toHaveCount(0)

    // Dashboard opens the admin.
    await trigger.click()
    await dashboard.click()
    await page.waitForURL(/\/admin\/dashboard/)

    // Chinese page: its own words.
    await page.goto('/cv/zh')
    const zhTrigger = page.locator('header [data-admin-menu]').getByRole('button', { name: '管理' })
    await zhTrigger.click()
    await expect(page.getByRole('menu', { name: '管理' }).getByRole('menuitem', { name: '后台' })).toBeVisible()
    await page.keyboard.press('Escape')

    // Below lg the header has no room for it; the drawer lists the same actions.
    await page.setViewportSize({ width: 991, height: 800 })
    await page.goto('/cv')
    await expect(page.locator('header [data-admin-menu]')).toBeHidden()
    await page.locator('header').getByRole('button', { name: 'Open menu' }).click()
    await expect(page.getByRole('dialog').getByRole('link', { name: 'Dashboard' })).toBeVisible()
  })

  test('HEADER-ADMIN: from 320 to 1920 px, and with a ninth nav link, nothing overlaps while signed in', async ({ page, context }) => {
    test.setTimeout(180_000)
    await loginAsAdmin(page)
    await stubLiveStatus(context)
    for (const width of [320, 375, 768, 991, 992, 1024, 1279, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 800 })
      for (const path of ['/now', '/cv', '/cv/zh']) {
        await openSettled(page, path, { signedIn: true })
        expectClear(await headerGeometry(page), `signed in, ${path} at ${width}px`, width >= 992 ? 8 : 0)
        if (width >= 992 && path !== '/now') {
          await addNinthLink(page)
          expectClear(await headerGeometry(page), `signed in, ${path} at ${width}px with nine links`)
        }
      }
    }
  })
})
