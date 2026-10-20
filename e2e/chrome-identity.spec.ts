import { devices, type Locator, type Page } from '@playwright/test'
import { test, expect, settle, seriousA11yViolations, ADMIN, loginAsAdmin } from './fixtures'

/**
 * chrome-identity stream (desktop Chromium project; phone checks emulate a
 * Pixel 7): the footer, the mobile menu (theme control, quick actions,
 * drag to close), keyboard hints on touch, the brand icons and manifest,
 * the hero seam and portrait frame, the /colophon release timeline, /now's
 * single date and de-duplicated signals, the 404 recovery and the shared
 * EmptyState.
 */

const STORAGE_KEY = 'chakra-ui-color-mode'
const REPO = 'https://github.com/hiko-server/landing_page'
const { viewport: PHONE_VIEWPORT, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7']

async function useColorMode(page: Page, mode: 'light' | 'dark'): Promise<void> {
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [STORAGE_KEY, mode] as const)
}

const sleep = (page: Page, ms: number) => page.waitForTimeout(ms)

/** A mouse drag in small timed steps; `pauseBeforeRelease` lets the finger stop (no flick). */
async function drag(page: Page, from: { x: number; y: number }, dx: number, steps: number, stepMs: number, pauseBeforeRelease = 0) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + (dx * i) / steps, from.y + (i % 2))
    await sleep(page, stepMs)
  }
  if (pauseBeforeRelease) await sleep(page, pauseBeforeRelease)
  await page.mouse.up()
}

async function openMenu(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Open menu' }).click()
  const menu = page.getByRole('dialog', { name: 'Menu' })
  await expect(menu).toBeVisible()
  // Let the opening slide finish before measuring.
  await expect.poll(() => page.locator('.chakra-modal__content').evaluate((el) => getComputedStyle(el).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/)
  return menu
}

// ── Footer (A5) ─────────────────────────────────────────────────────────────

test.describe('footer', () => {
  test('three columns: the site, this site (colophon, privacy, feeds, source) and elsewhere', async ({ page }) => {
    await page.goto('/about')
    await settle(page)
    const footer = page.getByRole('contentinfo')
    const nav = footer.getByRole('navigation', { name: 'Footer' })
    for (const title of ['Site', 'This site']) await expect(nav.getByRole('heading', { name: title, exact: true })).toBeVisible()
    const site = nav.getByRole('list', { name: 'Site', exact: true })
    for (const name of ['Home', 'About', 'Work', 'Writing', 'CV', 'Now', 'Uses', 'Contact']) await expect(site.getByRole('link', { name, exact: true })).toBeVisible()
    const meta = nav.getByRole('list', { name: 'This site', exact: true })
    await expect(meta.getByRole('link', { name: 'Colophon', exact: true })).toHaveAttribute('href', '/colophon')
    await expect(meta.getByRole('link', { name: 'Privacy', exact: true })).toHaveAttribute('href', '/colophon#privacy')
    await expect(meta.getByRole('link', { name: 'Writing (RSS)' })).toHaveAttribute('href', '/feed.xml')
    await expect(meta.getByRole('link', { name: 'Writing (JSON Feed)' })).toHaveAttribute('href', '/feed.json')
    await expect(meta.getByRole('link', { name: /^Source/ })).toHaveAttribute('href', REPO)
    await expect(footer).not.toContainText('All rights reserved')
    // The build line names a real commit when the image carries one (CI and deploys do).
    const build = footer.getByRole('link', { name: /^Build [0-9a-f]{7}/ })
    if (await build.count()) await expect(build).toHaveAttribute('href', new RegExp(`^${REPO}/commit/[0-9a-f]{7,40}$`))
    await expect(footer.getByRole('link', { name: 'Built with Next.js · Set in Geist' })).toHaveAttribute('href', '/colophon')

    // The privacy link lands on the privacy section.
    await meta.getByRole('link', { name: 'Privacy', exact: true }).click()
    await page.waitForURL('**/colophon#privacy')
    await expect(page.getByRole('heading', { name: 'Privacy & analytics' })).toBeInViewport()
  })

  test.describe('on a phone', () => {
    test.use({ viewport: PHONE_VIEWPORT, userAgent, deviceScaleFactor, isMobile, hasTouch })

    test('every link sits in its column (no orphan row), at a 44px target, without sideways scroll', async ({ page }) => {
      await page.goto('/cv')
      await settle(page)
      const site = page.getByRole('contentinfo').getByRole('list', { name: 'Site', exact: true })
      const boxes = await site.getByRole('link').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ x: Math.round(r.left), h: r.height })))
      expect(boxes).toHaveLength(8)
      expect(new Set(boxes.map((b) => b.x)).size, 'one left edge: a column, not a wrapped row').toBe(1)
      expect(boxes.every((b) => b.h >= 44)).toBe(true)
      await page.getByRole('contentinfo').scrollIntoViewIfNeeded()
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    })
  })

  for (const width of [375, 768]) {
    test(`at ${width}px the scroll-to-top button never covers a footer link`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/about')
      await settle(page)
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const top = page.getByRole('button', { name: 'Scroll to top' })
      await expect(top).toBeVisible()
      await settle(page)
      const covered = await page.evaluate(() => {
        const btn = document.querySelector('[aria-label="Scroll to top"]')!.getBoundingClientRect()
        return Array.from(document.querySelectorAll('footer.glass a'))
          .filter((a) => {
            const r = a.getBoundingClientRect()
            return r.width > 0 && r.left < btn.right && r.right > btn.left && r.top < btn.bottom && r.bottom > btn.top
          })
          .map((a) => a.textContent)
      })
      expect(covered).toEqual([])
    })
  }

  test.describe('phone footer', () => {
    test.use({ viewport: PHONE_VIEWPORT, userAgent, deviceScaleFactor, isMobile, hasTouch })
    test('the brand mark links home, named by the visible wordmark', async ({ page }) => {
      await page.goto('/now')
      await settle(page)
      const home = page.getByRole('contentinfo').locator('a[href="/"]').filter({ has: page.locator('svg') })
      await expect(home).toHaveCount(1)
      await expect(home.locator('svg')).toBeVisible()
      await expect(home.locator('svg')).toHaveAttribute('aria-hidden', 'true')
      expect((await home.textContent())?.trim()).toBe(await page.evaluate(() => location.hostname.replace(/^www\./, '')))
    })
  })
})

// ── Mobile menu (A5 + C4) ───────────────────────────────────────────────────

test.describe('mobile menu', () => {
  test.use({ viewport: PHONE_VIEWPORT, userAgent, deviceScaleFactor, isMobile, hasTouch })

  test('large links, the current page marked, and a theme control whose icon and label agree', async ({ page }) => {
    await useColorMode(page, 'dark')
    await page.goto('/work')
    await settle(page)
    const menu = await openMenu(page)
    const current = menu.getByRole('link', { name: 'Work', exact: true })
    await expect(current).toHaveAttribute('aria-current', 'page')
    expect(await current.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(24)
    await expect(menu.getByRole('link', { name: 'CV as PDF' })).toHaveAttribute('href', '/cv.pdf')
    await expect(menu.getByRole('link', { name: '中文简历' })).toHaveAttribute('href', '/cv/zh')

    const theme = menu.getByRole('group', { name: 'Theme' })
    const light = theme.getByRole('button', { name: 'Light' })
    const dark = theme.getByRole('button', { name: 'Dark' })
    await expect(dark).toHaveAttribute('aria-pressed', 'true')
    await expect(light).toHaveAttribute('aria-pressed', 'false')
    await light.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(light).toHaveAttribute('aria-pressed', 'true')
    await expect(dark).toHaveAttribute('aria-pressed', 'false')
    // Pressing the current mode changes nothing.
    await light.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(await seriousA11yViolations(page)).toEqual([])
  })

  test('the drawer offers System like the header menu and the palette, and they agree', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await useColorMode(page, 'light')
    await page.goto('/work')
    await settle(page)
    const menu = await openMenu(page)
    const theme = menu.getByRole('group', { name: 'Theme' })
    const buttons = theme.getByRole('button')
    await expect(buttons).toHaveText(['System', 'Light', 'Dark'])
    await expect(theme.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true')
    const system = theme.getByRole('button', { name: 'System' })
    await system.click()
    // System follows the OS (dark here) and is what is stored.
    await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'system')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(system).toHaveAttribute('aria-pressed', 'true')
    await expect(theme.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'false')
    expect(await page.evaluate(() => localStorage.getItem('theme-preference'))).toBe('system')
    // The OS switching to light is followed live while on System.
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(system).toHaveAttribute('aria-pressed', 'true')
  })

  test('Search closes the menu and opens the palette', async ({ page }) => {
    await page.goto('/about')
    await settle(page)
    const menu = await openMenu(page)
    await menu.getByRole('button', { name: 'Search' }).click()
    await expect(page.getByRole('dialog', { name: 'Menu' })).toHaveCount(0)
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette).toBeVisible()
    await expect(palette.getByRole('combobox')).toBeFocused()
  })

  test('a short, slow drag springs back; a drag started on a link does not follow it', async ({ page }) => {
    await page.goto('/about')
    await settle(page)
    await openMenu(page)
    const panel = page.locator('[data-drawer-panel]')
    const box = (await panel.boundingBox())!
    // 25% of the width, stopped before release: stays open.
    await drag(page, { x: box.x + box.width * 0.4, y: box.y + box.height * 0.9 }, box.width * 0.25, 8, 30, 160)
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible()
    await expect.poll(() => panel.evaluate((el) => (el as HTMLElement).style.transform)).toBe('')
    // Starting on a link: the release is not a click.
    const writing = page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'Writing', exact: true })
    const w = (await writing.boundingBox())!
    await drag(page, { x: w.x + 20, y: w.y + w.height / 2 }, 60, 6, 30, 160)
    await sleep(page, 400)
    expect(new URL(page.url()).pathname).toBe('/about')
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible()
  })

  test('dragging past a third of the width closes it and returns focus to the hamburger', async ({ page }) => {
    await page.goto('/about')
    await settle(page)
    await openMenu(page)
    const box = (await page.locator('[data-drawer-panel]').boundingBox())!
    await drag(page, { x: box.x + box.width * 0.3, y: box.y + box.height * 0.5 }, box.width * 0.6, 10, 16)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Open menu')
    expect(new URL(page.url()).pathname).toBe('/about')
  })

  test('a real touch drag past the threshold closes it (vertical scrolling stays with the menu)', async ({ page }) => {
    await page.goto('/about')
    await settle(page)
    await openMenu(page)
    const box = (await page.locator('[data-drawer-panel]').boundingBox())!
    const cdp = await page.context().newCDPSession(page)
    const y = box.y + box.height * 0.92
    const x0 = box.x + box.width * 0.35
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
    await touch('touchStart', x0)
    for (let i = 1; i <= 8; i++) {
      await touch('touchMove', x0 + i * box.width * 0.06)
      await sleep(page, 12)
    }
    await touch('touchEnd', x0 + 8 * box.width * 0.06)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('tapping a link closes the menu and focus moves into the new page', async ({ page }) => {
    await page.goto('/about')
    await settle(page)
    const menu = await openMenu(page)
    await menu.getByRole('link', { name: 'Writing', exact: true }).click()
    await page.waitForURL('**/blog')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('main')
  })

  test('touch screens get no keyboard hints in the header or the palette', async ({ page }) => {
    await page.goto('/')
    await settle(page)
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
    await page.getByRole('button', { name: 'Open command palette' }).click()
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette).toBeVisible()
    const visibleKbd = await page.locator('kbd').evaluateAll((els) => els.filter((el) => el.checkVisibility()).map((el) => el.textContent))
    expect(visibleKbd).toEqual([])
    await expect(palette.getByRole('region', { name: 'Keyboard shortcuts' })).toBeHidden()
  })

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' })

    test('opens in place, without the link entrance', async ({ page }) => {
      await page.goto('/about')
      await settle(page)
      // Every frame's transform of the sheet, from before the tap until it settles.
      await page.evaluate(() => {
        const w = window as unknown as { __frames: string[] }
        w.__frames = []
        const t0 = performance.now()
        const sample = () => {
          const el = document.querySelector('.chakra-modal__content')
          if (el) w.__frames.push(getComputedStyle(el).transform)
          if (performance.now() - t0 < 1500) requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      })
      await page.getByRole('button', { name: 'Open menu' }).click()
      const menu = page.getByRole('dialog', { name: 'Menu' })
      await expect(menu).toBeVisible()
      await sleep(page, 1600)
      const frames = await page.evaluate(() => (window as unknown as { __frames: string[] }).__frames)
      const x = (m: string) => (m === 'none' ? 0 : Number(m.match(/matrix\(1, 0, 0, 1, (-?[\d.]+), 0\)/)?.[1] ?? Number.NaN))
      expect(frames.length).toBeGreaterThan(0)
      expect(x(frames[frames.length - 1]), 'settled in place').toBe(0)
      const width = (await page.locator('[data-drawer-panel]').boundingBox())!.width
      // No frame between "off screen" and "in place": it jumped, it did not slide.
      expect(frames.map(x).filter((v) => v !== 0 && Math.abs(v - width) > 1), frames.join(' | ')).toEqual([])
      const styles = await menu.locator('nav li').evaluateAll((els) => els.map((el) => (el as HTMLElement).style.transition))
      expect(styles.every((t) => t === '')).toBe(true)
    })
  })
})

test('desktop keeps the keyboard hints', async ({ page }) => {
  await page.goto('/')
  await settle(page)
  await expect(page.getByRole('button', { name: 'Open command palette' }).locator('kbd')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+KeyK')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette.locator('kbd', { hasText: 'ESC' })).toBeVisible()
  await expect(palette.getByRole('region', { name: 'Keyboard shortcuts' })).toBeVisible()
})

// ── Brand mark, icons, manifest (A3, G8) ────────────────────────────────────

test('icons: an adaptive SVG favicon, its ICO fallback, the app icons and the manifest', async ({ page, request }) => {
  const svg = await request.get('/icon.svg')
  expect(svg.status()).toBe(200)
  expect(svg.headers()['content-type']).toMatch(/^image\/svg\+xml/)
  const text = await svg.text()
  expect(text).toContain('prefers-color-scheme:dark')
  expect(text).toContain('<title>LY</title>')
  const ico = await request.get('/favicon.ico')
  expect(ico.status()).toBe(200)
  expect((await ico.body()).readUInt16LE(2)).toBe(1)

  const manifest = await (await request.get('/manifest.json')).json()
  expect(manifest.name).toBe('Li Yanpei (Lucian)')
  expect(manifest.shortcuts.map((s: { url: string }) => s.url)).toEqual(['/cv', '/cv/zh', '/blog', '/contact'])
  for (const icon of manifest.icons) {
    const res = await request.get(icon.src)
    expect(res.status(), icon.src).toBe(200)
    const body = await res.body()
    const [w] = icon.sizes.split('x').map(Number)
    expect(body.readUInt32BE(16), icon.src).toBe(w)
  }
  for (const s of manifest.shortcuts) expect((await request.get(s.url)).status(), s.url).toBe(200)
  // No service worker anywhere.
  expect((await request.get('/sw.js')).status()).toBe(404)
  await page.goto('/')
  expect(await page.evaluate(() => navigator.serviceWorker?.getRegistrations().then((r) => r.length) ?? 0)).toBe(0)
})

test('hero: the imagery fades into the page, the dots continue the page grid, the portrait is matted in dark mode', async ({ page, browser }) => {
  await useColorMode(page, 'light')
  await page.goto('/')
  await settle(page)
  const light = await page.evaluate(() => {
    const img = document.querySelector('img.hero-drift') as HTMLElement
    const imagery = img.closest('picture')!.parentElement!.parentElement as HTMLElement
    const hero = imagery.parentElement as HTMLElement
    const grid = Array.from(hero.children).find((el) => getComputedStyle(el).backgroundSize === '16px 16px') as HTMLElement
    const posY = getComputedStyle(grid).backgroundPositionY
    const top = hero.getBoundingClientRect().top + window.scrollY
    return { mask: getComputedStyle(imagery).maskImage || getComputedStyle(imagery).webkitMaskImage, posY, top }
  })
  expect(light.mask).toContain('linear-gradient')
  const offset = Number(light.posY.match(/-?[\d.]+/)?.[0])
  expect(((light.top + offset) % 16 + 16) % 16, `hero grid ${light.posY} at y=${light.top}`).toBe(0)

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const dark = await ctx.newPage()
  await useColorMode(dark, 'dark')
  await dark.goto('/')
  await dark.waitForLoadState('networkidle').catch(() => undefined)
  const frame = await dark.evaluate(() => {
    const card = Array.from(document.querySelectorAll('main img:not(.hero-drift)')).find((img) => {
      const w = img.getBoundingClientRect().width
      return (img as HTMLElement).offsetParent !== null && w >= 200 && w <= 300
    })
    if (!card) return null
    // The portrait's frame: the <img>'s parent, or the <picture>'s when it has an AVIF source (G4).
    const frameEl = (card.closest('picture') ?? card).parentElement!
    return { after: getComputedStyle(frameEl, '::after').boxShadow, filter: getComputedStyle(card).filter }
  })
  await ctx.close()
  expect(frame).not.toBeNull()
  expect(frame!.after).toContain('inset')
  expect(frame!.filter).toContain('brightness')
})

// ── /colophon timeline (B5) ─────────────────────────────────────────────────

test('/colophon: a release timeline with only the latest release open; anchors open theirs', async ({ page }) => {
  await page.goto('/colophon')
  await settle(page)
  const buttons = page.locator('#changelog button[aria-expanded]')
  const count = await buttons.count()
  expect(count).toBeGreaterThan(1)
  await expect(buttons.first()).toHaveAttribute('aria-expanded', 'true')
  for (let i = 1; i < count; i++) await expect(buttons.nth(i)).toHaveAttribute('aria-expanded', 'false')
  const second = buttons.nth(1)
  const notesId = (await second.getAttribute('aria-controls'))!
  await expect(page.locator(`[id="${notesId}"]`)).toHaveAttribute('inert', '')
  await second.click()
  await expect(second).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator(`[id="${notesId}"]`)).not.toHaveAttribute('inert', '')
  await expect(page.locator(`[id="${notesId}"] h4`).first()).toBeVisible()
  expect(await seriousA11yViolations(page)).toEqual([])

  // A shared link to a release opens it.
  const releaseId = notesId.replace(/-notes$/, '')
  await page.goto(`/colophon#${releaseId}`)
  await settle(page)
  await expect(page.locator(`button[aria-controls="${notesId}"]`)).toHaveAttribute('aria-expanded', 'true')
})

// ── /now (B5) ───────────────────────────────────────────────────────────────

test('/now shows one "Updated" date', async ({ page }) => {
  await page.goto('/now')
  await settle(page)
  const lines = page.locator('main').getByText(/^Updated /)
  expect(await lines.count()).toBeLessThanOrEqual(1)
  await expect(page.locator('main')).not.toContainText('Last updated')
})

test.describe('/now with an owner-written body', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test('the sidebar drops what the body already links to; one date remains', async ({ page }) => {
    await page.goto('/now')
    const latest = page.locator('main a[href^="/blog/"], main a[href^="/work/"]').first()
    test.skip(!(await latest.count()), 'no published writing to link to')
    const href = (await latest.getAttribute('href'))!
    await loginAsAdmin(page)
    const put = (payload: unknown) =>
      page.evaluate(
        async (body) => {
          const res = await fetch('/api/admin/page', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
          return res.status
        },
        payload as Record<string, unknown>,
      )
    const original = await page.evaluate(() => fetch('/api/admin/page?name=now').then((r) => r.json()))
    try {
      expect(await put({ name: 'now', frontmatter: { ...original.frontmatter, title: original.frontmatter?.title || 'Now' }, body: `## Lately\n\nI wrote about it in [this piece](${href}).\n` })).toBe(200)
      await page.goto('/now')
      await settle(page)
      await expect(page.locator('main').getByRole('link', { name: 'this piece' })).toHaveAttribute('href', href)
      const aside = page.locator('main aside')
      if (await aside.count()) expect(await aside.locator(`a[href="${href}"]`).count()).toBe(0)
      expect(await page.locator('main').getByText(/^Updated /).count()).toBe(1)
    } finally {
      expect(await put({ name: 'now', frontmatter: original.frontmatter, body: original.body ?? '' })).toBe(200)
    }
  })
})

// ── 404 (B5) ────────────────────────────────────────────────────────────────

test('404: a real 404 with "Did you mean", a prefilled search and a platform-aware hint', async ({ page, request }) => {
  const res = await page.goto('/blgo')
  expect(res?.status()).toBe(404)
  await settle(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This page doesn’t exist.')
  const suggestions = page.getByRole('region', { name: 'Did you mean' })
  await expect(suggestions.getByRole('link', { name: /Writing/ })).toHaveAttribute('href', '/blog')
  await expect(page.locator('main').getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('href', '/')

  // The hint names this platform's shortcut.
  const apple = await page.evaluate(() => /mac|iphone|ipad|ipod|\bios\b/i.test((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform))
  const search = page.getByRole('button', { name: /^Search for “blgo”/ })
  await expect(search.locator('kbd')).toHaveText(apple ? '⌘K' : 'Ctrl K')
  await search.click()
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette).toBeVisible()
  await expect(palette.getByRole('combobox')).toHaveValue('blgo')
  await page.keyboard.press('Escape')
  // The page is checked once the dialog has left (a fading dialog has no settled contrast).
  await expect(palette).toBeHidden()
  expect(await seriousA11yViolations(page)).toEqual([])

  // With content: a typo in a real slug finds it.
  const index = await (await request.get('/api/search-index')).json()
  const work = (index.docs as { kind: string; href: string }[]).find((d) => d.kind === 'work' && /^\/work\/[\w-]{4,}$/.test(d.href))
  if (work) {
    const typo = work.href.slice(0, -1)
    expect((await page.goto(typo))?.status()).toBe(404)
    await expect(page.getByRole('region', { name: 'Did you mean' }).getByRole('link').first()).toHaveAttribute('href', work.href)
  }
})

// ── EmptyState (B5) ─────────────────────────────────────────────────────────

test('empty collections show the shared empty state with a way on', async ({ page }) => {
  for (const [path, title] of [
    ['/blog', 'No posts yet'],
    ['/work', 'No case studies yet'],
  ] as const) {
    await page.goto(path)
    await settle(page)
    const empty = page.locator('[data-empty-state="block"]')
    if (!(await empty.count())) continue // the collection has content
    await expect(empty.getByText(title)).toBeVisible()
    expect(await empty.getByRole('link').count()).toBeGreaterThan(0)
  }
})
