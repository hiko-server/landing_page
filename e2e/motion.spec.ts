import { devices, type APIResponse, type Page } from '@playwright/test'
import { test, expect, settle } from './fixtures'

/**
 * Motion and interaction (wave 2B "motion" stream): shared-element morphs
 * (C1), slow-navigation feedback (C2), command palette 4.0 (C5), touch
 * press feedback without sticky hover (C6), reading micro-motion (C7) and
 * the visitor keyboard layer (C9). Desktop Chromium unless a block says
 * otherwise; tests that need content skip on an empty store (CI).
 */

// Pixel 7 emulation (its defaultBrowserType cannot be set inside a describe).
const { viewport: PHONE_VIEWPORT, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7']
const PHONE = { viewport: PHONE_VIEWPORT, userAgent, deviceScaleFactor, isMobile, hasTouch }

type VtRecord = { types: string[] | null; before: string[]; after: string[] | null; settled: string[] | null }

/** Records every startViewTransition: its types and the morph names present before it, after its update and once settled. */
async function recordTransitions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __vt: VtRecord[]; __vtRunning: number }
    w.__vt = []
    w.__vtRunning = 0
    const proto = Document.prototype as unknown as { startViewTransition?: (arg: unknown) => { finished: Promise<void> } }
    const original = proto.startViewTransition
    if (typeof original !== 'function') return
    const names = () =>
      Array.from(document.querySelectorAll<HTMLElement>('[style*="view-transition-name"]'))
        .map((el) => el.style.viewTransitionName)
        .filter((n) => n.startsWith('vt-morph'))
    proto.startViewTransition = function (this: Document, arg: unknown) {
      const rec: VtRecord = { types: typeof arg === 'function' ? null : ((arg as { types?: string[] }).types ?? null), before: names(), after: null, settled: null }
      w.__vt.push(rec)
      const update = typeof arg === 'function' ? arg : (arg as { update: () => unknown }).update
      const wrapped = async () => {
        await update()
        rec.after = names()
      }
      const vt = original.call(this, typeof arg === 'function' ? wrapped : { ...(arg as object), update: wrapped })
      w.__vtRunning += 1
      vt.finished.finally(() => {
        // After the site's own clean-up (registered first) has run.
        setTimeout(() => {
          rec.settled = names()
          w.__vtRunning -= 1
        }, 0)
      })
      return vt
    }
  })
}

const transitions = (page: Page) => page.evaluate(() => (window as unknown as { __vt: VtRecord[] }).__vt)
const idle = (page: Page) => page.waitForFunction(() => (window as unknown as { __vtRunning: number }).__vtRunning === 0)
const hasVt = (page: Page) => page.evaluate(() => 'startViewTransition' in document)
/** The morph chunk (lib/viewTransitionMorph.ts) is fetched when the browser is idle after load. */
const morphReady = (page: Page) =>
  page.waitForFunction(
    () =>
      ((self as unknown as { webpackChunk_N_E?: [unknown, Record<string, unknown>][] }).webpackChunk_N_E || []).some(([, modules]) =>
        Object.values(modules || {}).some((f) => String(f).includes('vt-morph-')),
      ),
    undefined,
    { timeout: 8000 },
  )
const firstPost = async (page: Page) => {
  const link = page.locator('main li[data-kbd-item] a[href^="/blog/"]').first()
  return (await link.count()) ? link : null
}

// ── C1: shared-element morphs ───────────────────────────────────────────────

test.describe('C1 shared-element morph', () => {
  test('a post row morphs into the post and flies back on Back — one name at a time, none left behind', async ({ page }) => {
    await recordTransitions(page)
    await page.goto('/blog')
    await settle(page)
    test.skip(!(await hasVt(page)), 'no View Transitions API')
    const link = await firstPost(page)
    test.skip(!link, 'empty store: no post')
    await morphReady(page)
    const href = await link!.getAttribute('href')
    await link!.click()
    await page.waitForURL(`**${href}`)
    await idle(page)
    await page.goBack()
    await page.waitForURL('**/blog')
    await expect.poll(async () => (await transitions(page)).length).toBe(2)
    await idle(page)
    const [open, back] = await transitions(page)
    expect(open.types).toEqual(['forward', 'morph'])
    expect(open.before).toEqual(['vt-morph-title'])
    expect(open.after).toEqual(['vt-morph-title'])
    expect(open.settled).toEqual([])
    expect(back.types).toEqual(['back', 'morph'])
    expect(back.before).toEqual(['vt-morph-title'])
    expect(back.after).toEqual(['vt-morph-title'])
    expect(back.settled).toEqual([])
  })

  test('no page carries a view-transition name twice (nor a morph name at rest)', async ({ page, request }) => {
    const index = await (await request.get('/api/search-index')).json()
    const docs = (index.docs as { kind: string; href: string }[]).filter((d) => d.kind === 'post' || d.kind === 'work').slice(0, 4)
    for (const path of ['/', '/blog', '/work', '/now', '/about', ...docs.map((d) => d.href)]) {
      await page.goto(path)
      await settle(page)
      const names = await page.evaluate(() =>
        Array.from(document.querySelectorAll('*'))
          .map((el) => getComputedStyle(el).viewTransitionName)
          .filter((n) => n && n !== 'none'),
      )
      expect(names, path).toEqual([...new Set(names)])
      expect(names.filter((n) => n.startsWith('vt-morph')), path).toEqual([])
    }
  })

  test('a result opened from the ⌘K palette does not morph out from under it', async ({ page, request }) => {
    const index = await (await request.get('/api/search-index')).json()
    const post = (index.docs as { kind: string; href: string; title: string }[]).find((d) => d.kind === 'post')
    test.skip(!post, 'empty store: no post')
    await recordTransitions(page)
    await page.goto('/blog')
    await settle(page)
    test.skip(!(await hasVt(page)), 'no View Transitions API')
    await page.waitForTimeout(1500)
    await page.keyboard.press('ControlOrMeta+KeyK')
    const input = page.getByRole('combobox')
    const query = post!.title.slice(0, 24)
    // The search index has arrived once the post is a result.
    await input.fill(query)
    await expect(page.getByRole('option').filter({ hasText: query }).first()).toBeVisible()
    await input.fill('')
    // Enter right after typing: the result for the typed text opens, even
    // when the (deferred) list has not caught up yet.
    await input.fill(query)
    await page.keyboard.press('Enter')
    await page.waitForURL(`**${post!.href}`)
    await idle(page)
    const vt = await transitions(page)
    expect(vt.length).toBe(1)
    expect(vt[0].types).not.toContain('morph')
    expect(vt[0].before).toEqual([])
  })
})

test.describe('C1 with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('navigation is instant: no view transition at all', async ({ page }) => {
    await recordTransitions(page)
    await page.goto('/blog')
    await settle(page)
    const link = (await firstPost(page)) ?? page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Work', exact: true })
    await link.click()
    await page.waitForURL((url) => url.pathname !== '/blog')
    await page.waitForTimeout(500)
    expect(await transitions(page)).toEqual([])
  })
})

// ── C2: slow-navigation feedback ────────────────────────────────────────────

/** Records every state of the progress bar, <main>'s aria-busy and the status text. */
async function watchProgress(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __np: string[] }
    w.__np = []
    const bar = document.querySelector('.nav-progress')!
    const status = bar.parentElement!.querySelector('[role="status"]')!
    const main = document.getElementById('main')!
    const log = () => w.__np.push(`${bar.getAttribute('data-state')}|${main.getAttribute('aria-busy') ?? ''}|${status.textContent}`)
    const mo = new MutationObserver(log)
    mo.observe(bar, { attributes: true })
    mo.observe(main, { attributes: true, attributeFilter: ['aria-busy'] })
    mo.observe(status, { childList: true, characterData: true, subtree: true })
  })
}
const progressLog = (page: Page) => page.evaluate(() => [...new Set((window as unknown as { __np: string[] }).__np)])

test.describe('C2 slow-navigation feedback', () => {
  test('a slow navigation shows the bar after 150 ms, marks <main> busy and the link, then announces; all of it goes', async ({ page }) => {
    // Page data is held until the test lets it through: the navigation is
    // as slow as the assertions need, whatever the machine's load.
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/_next/data/**', async (route) => {
      await held
      await route.continue()
    })
    await page.goto('/about')
    await settle(page)
    await watchProgress(page)
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Now', exact: true }).click()
    await expect(page.locator('.nav-progress')).toHaveAttribute('data-state', 'loading')
    await expect(page.locator('#main')).toHaveAttribute('aria-busy', 'true')
    await expect(page.locator('a[data-nav-pending]')).toHaveText('Now')
    await expect(page.locator('.site-header-sticky [role="status"]')).toHaveText('Loading…')
    release()
    await page.waitForURL('**/now')
    await expect(page.locator('.nav-progress')).toHaveAttribute('data-state', 'idle')
    await expect(page.locator('#main')).not.toHaveAttribute('aria-busy', /.*/)
    await expect(page.locator('a[data-nav-pending]')).toHaveCount(0)
    expect(await progressLog(page)).toContain('loading|true|Loading…')
  })

  test('a fast navigation never shows it', async ({ page }) => {
    // As fast as the browser can render it, over any network: every request
    // for the next page's data (the header link's own prefetch included) is
    // answered from memory — fetched from the server once, as a navigation
    // asks for it — and the page's code is loaded and run beforehand. No
    // server round trip is left inside the 150 ms, whatever the latency
    // (production behind Cloudflare is a few hundred milliseconds away).
    let nowData: Promise<APIResponse> | undefined
    await page.route(
      (url) => /^\/_next\/data\/[^/]+\/now\.json$/.test(url.pathname),
      async (route) => {
        const response = await (nowData ??= page.request.get(route.request().url(), { headers: { 'x-nextjs-data': '1' } }))
        const headers = Object.fromEntries(Object.entries(response.headers()).filter(([name]) => !/^(content-encoding|content-length|transfer-encoding|connection)$/i.test(name)))
        await route.fulfill({ status: response.status(), headers, body: await response.body() })
      },
    )
    await page.goto('/about')
    await settle(page)
    await page.evaluate(async () => {
      const { router } = (window as unknown as { next: { router: { prefetch(url: string): Promise<void>; pageLoader: { loadPage(route: string): Promise<unknown> } } } }).next
      await router.prefetch('/now')
      await router.pageLoader.loadPage('/now')
    })
    expect(nowData, 'the prefetch asked for the data').toBeDefined()
    expect((await nowData!).ok()).toBe(true)
    await watchProgress(page)
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Now', exact: true }).click()
    await page.waitForURL('**/now')
    await page.waitForTimeout(400)
    expect((await progressLog(page)).filter((s) => s.startsWith('loading'))).toEqual([])
  })
})

test.describe('C2 with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the bar is a still line (no sweep)', async ({ page }) => {
    await page.goto('/about')
    await settle(page)
    const sweep = await page.locator('.nav-progress').evaluate((el) => {
      el.setAttribute('data-state', 'loading')
      const s = getComputedStyle(el, '::before')
      const out = { animation: s.animationName, width: s.width, parent: getComputedStyle(el).width }
      el.setAttribute('data-state', 'idle')
      return out
    })
    expect(sweep.animation).toBe('none')
    expect(sweep.width).toBe(sweep.parent)
  })
})

// ── C5: command palette 4.0 ─────────────────────────────────────────────────

/** Opacity and transform of the palette panel in the first frame it is in the DOM. */
async function armFirstPaletteFrame(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __pf?: { opacity: string; transform: string } }
    delete w.__pf
    const sample = () => {
      const el = document.querySelector('.chakra-modal__content')
      if (el) {
        const cs = getComputedStyle(el)
        w.__pf = { opacity: cs.opacity, transform: cs.transform }
      } else requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
}
const firstPaletteFrame = (page: Page) => page.waitForFunction(() => (window as unknown as { __pf?: unknown }).__pf).then((h) => h.jsonValue() as Promise<{ opacity: string; transform: string }>)

test.describe('C5 command palette 4.0', () => {
  test('from the keyboard it is simply there; from a click it scales in', async ({ page }) => {
    await page.goto('/about')
    await settle(page)
    await armFirstPaletteFrame(page)
    await page.keyboard.press('ControlOrMeta+KeyK')
    expect(await firstPaletteFrame(page)).toEqual({ opacity: '1', transform: 'none' })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0)

    await armFirstPaletteFrame(page)
    await page.getByRole('button', { name: 'Open command palette' }).click()
    const frame = await firstPaletteFrame(page)
    expect(Number(frame.opacity)).toBeLessThan(1)
  })

  test('opening it from the keyboard is fast (Event Timing, input → next paint)', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __ev: number[] }
      w.__ev = []
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as (PerformanceEntry & { interactionId?: number })[]) if (e.interactionId) w.__ev.push(e.duration)
      }).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit)
    })
    await page.goto('/blog')
    await settle(page)
    await page.waitForTimeout(1500) // the palette chunk is warmed while idle
    await page.evaluate(() => ((window as unknown as { __ev: number[] }).__ev = []))
    await page.keyboard.press('ControlOrMeta+KeyK')
    await expect(page.getByRole('combobox')).toBeFocused()
    await page.waitForTimeout(300)
    const worst = Math.max(0, ...(await page.evaluate(() => (window as unknown as { __ev: number[] }).__ev)))
    expect(worst, 'INP "good" is ≤ 200 ms').toBeLessThanOrEqual(200)
  })

  test('nested pages: Theme › opens in place, Escape and Backspace come back to its entry; the dialog stays open', async ({ page }) => {
    await page.goto('/about')
    await settle(page)
    await page.keyboard.press('ControlOrMeta+KeyK')
    const dialog = page.getByRole('dialog', { name: 'Command palette' })
    const input = page.getByRole('combobox')
    // The browse view lists the page, not what is inside it.
    const themeEntry = page.getByRole('option').filter({ hasText: /^Theme/ })
    await expect(themeEntry).toBeVisible()
    await expect(page.getByRole('option', { name: /^Dark theme/ })).toHaveCount(0)
    await themeEntry.click()
    await expect(page.getByRole('listbox', { name: 'Theme' })).toBeVisible()
    await expect(page.getByRole('option', { name: /^(System|Light|Dark) theme/ })).toHaveCount(3)
    await expect(input).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox', { name: 'Commands' })).toBeVisible()
    await expect(dialog).toBeVisible()
    const active = () => page.evaluate(() => document.getElementById(document.querySelector('[role="combobox"]')!.getAttribute('aria-activedescendant')!)?.textContent)
    await expect.poll(active).toMatch(/^Theme/)
    // CV ›: Enter opens it, Backspace in the empty field leaves it.
    await input.fill('cv')
    await expect(page.getByRole('option').first()).toBeVisible()
    await page.getByRole('option').filter({ hasText: 'PDF · 中文' }).click()
    await expect(page.getByRole('listbox', { name: 'CV' })).toBeVisible()
    await expect(page.getByRole('option', { name: /Download CV \(PDF\)/ })).toBeVisible()
    await page.keyboard.press('Backspace')
    await expect(page.getByRole('listbox', { name: 'Commands' })).toBeVisible()
    // A search from the top still finds what lives inside the pages.
    await input.fill('dark theme')
    await expect(page.getByRole('option', { name: /^Dark theme/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  test('"?" opens it on the Keyboard shortcuts page', async ({ page }) => {
    await page.goto('/about')
    await settle(page)
    await page.keyboard.press('Shift+Slash')
    await expect(page.getByRole('listbox', { name: 'Keyboard shortcuts' })).toBeVisible()
    const sheet = page.getByRole('dialog', { name: 'Command palette' }).getByRole('region', { name: 'Keyboard shortcuts' })
    for (const label of ['Next / previous item in a list', 'Previous / next article', 'Switch light / dark', 'Go to Home']) await expect(sheet.getByText(label)).toBeVisible()
    await expect(page.getByRole('option', { name: /Keyboard shortcuts: on/ })).toBeVisible()
  })

  test('a page that stays highlighted is prefetched', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }) // the header's nav (and its prefetches) are in the drawer
    await page.goto('/about')
    await settle(page)
    const prefetched = page.waitForRequest((r) => /\/_next\/(data\/[^/]+\/colophon\.json|static\/chunks\/pages\/colophon-)/.test(r.url()), { timeout: 5000 })
    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByRole('combobox').fill('colophon')
    await expect(page.getByRole('option', { name: /^Colophon/ })).toHaveAttribute('aria-selected', 'true')
    await prefetched
  })
})

test.describe('C5 on a phone', () => {
  test.use(PHONE)

  test('a plain scrim (no full-screen blur) and no Keyboard shortcuts page', async ({ page }) => {
    await page.goto('/about')
    await settle(page)
    await page.getByRole('button', { name: 'Open command palette' }).click()
    await expect(page.getByRole('combobox')).toBeVisible()
    expect(await page.locator('.chakra-modal__overlay').evaluate((el) => getComputedStyle(el).backdropFilter)).toBe('none')
    await expect(page.getByRole('option').filter({ hasText: /^Theme/ })).toBeVisible()
    await expect(page.getByRole('option').filter({ hasText: /^Keyboard shortcutsevery key/ })).toHaveCount(0)
  })
})

// ── C6: touch press feedback, no sticky hover ───────────────────────────────

/** Every style rule with :hover in its selector that is not inside a (hover: hover) media query. */
const unguardedHoverRules = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = []
    const walk = (rules: CSSRuleList, guarded: boolean) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSMediaRule) walk(rule.cssRules, guarded || /\(\s*hover\s*:\s*hover\s*\)/.test(rule.conditionText))
        else if (rule instanceof CSSSupportsRule || rule instanceof CSSLayerBlockRule) walk(rule.cssRules, guarded)
        else if (rule instanceof CSSStyleRule && /:hover\b/.test(rule.selectorText) && !guarded && !/scrollbar/.test(rule.selectorText)) out.push(rule.selectorText)
      }
    }
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(sheet.cssRules, false)
      } catch {
        /* cross-origin */
      }
    }
    return out
  })

test.describe('C6 on a touch screen', () => {
  test.use(PHONE)

  test('no hover style can stick after a tap, there is no grey tap flash, and cards sink while pressed', async ({ page }) => {
    await page.goto('/blog')
    await settle(page)
    // Open a dialog and a menu too, so their styles are in the sheets.
    await page.getByRole('button', { name: 'Open command palette' }).click()
    await expect(page.getByRole('combobox')).toBeVisible()
    expect(await unguardedHoverRules(page)).toEqual([])
    await page.keyboard.press('Escape')
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('-webkit-tap-highlight-color'))).toBe('rgba(0, 0, 0, 0)')

    const row = page.locator('main li[data-kbd-item]').first()
    test.skip((await row.count()) === 0, 'empty store: no post')
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument')
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'main li[data-kbd-item]' })
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['active'] })
    await expect.poll(() => row.evaluate((el) => getComputedStyle(el).transform)).toMatch(/^matrix\(0\.98/)
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
    await expect.poll(() => row.evaluate((el) => getComputedStyle(el).transform)).toBe('none')
  })

  test('scroll-to-top fades in after scrolling and is out of reach while hidden', async ({ page }) => {
    await page.goto('/about')
    await settle(page)
    const button = page.locator('.scroll-top')
    expect(await button.evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden')
    await expect(button).toBeHidden()
    await expect(page.getByRole('button', { name: 'Scroll to top' })).toHaveCount(0)
    await page.evaluate(() => window.scrollTo(0, 1200))
    await expect(page.getByRole('button', { name: 'Scroll to top' })).toBeVisible()
    await expect.poll(() => button.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  })
})

test('C6 with a mouse, hover styles still apply', async ({ page }) => {
  await page.goto('/blog')
  await settle(page)
  const trigger = page.getByRole('button', { name: 'Open command palette' })
  const before = await trigger.evaluate((el) => getComputedStyle(el).borderColor)
  await trigger.hover()
  await expect.poll(() => trigger.evaluate((el) => getComputedStyle(el).borderColor)).not.toBe(before)
})

// ── C7: reading micro-motion ────────────────────────────────────────────────

test('C7 the header hairline appears once the header is stuck over the page', async ({ page }) => {
  await page.goto('/about')
  await settle(page)
  const supported = await page.evaluate(() => CSS.supports('container-type: scroll-state'))
  test.skip(!supported, 'no scroll-state container queries (the hairline stays)')
  const border = () => page.locator('.site-header').evaluate((el) => getComputedStyle(el).borderBottomColor)
  await expect.poll(border).toBe('rgba(0, 0, 0, 0)')
  await page.evaluate(() => window.scrollTo(0, 400))
  await expect.poll(border).not.toBe('rgba(0, 0, 0, 0)')
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect.poll(border).toBe('rgba(0, 0, 0, 0)')
})

test('C7 the outline marker glides to the current section', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const index = await (await request.get('/api/search-index')).json()
  const docs = (index.docs as { kind: string; href: string }[]).filter((d) => d.kind === 'post' || d.kind === 'work')
  let checked = false
  for (const doc of docs) {
    await page.goto(doc.href)
    await settle(page)
    // The rail (xl+): the visible "On this page" navigation.
    const rail = page.getByRole('navigation', { name: 'On this page' })
    if ((await rail.count()) !== 1 || (await rail.locator('a[href^="#"]').count()) < 2) continue
    const marker = rail.locator('.toc-marker')
    const ids = await rail.locator('a[href^="#"]').evaluateAll((els) => els.map((a) => a.getAttribute('href')!.slice(1)))
    for (const id of ids.slice(0, 2)) {
      await page.evaluate((target) => document.getElementById(target)!.scrollIntoView({ block: 'start' }), id)
      await page.mouse.wheel(0, 40)
      const link = rail.locator(`a[href="#${id}"]`)
      await expect(link).toHaveAttribute('aria-current', 'location')
      await expect(marker).toHaveAttribute('data-on', '')
      const top = await link.evaluate((el) => `${(el as HTMLElement).offsetTop}px`)
      await expect.poll(() => marker.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--toc-y'))).toBe(top)
    }
    // It moves by transform (composited), never by re-layout of the links.
    expect(await marker.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain('transform')
    checked = true
    break
  }
  test.skip(!checked, 'no article with an outline in this store')
})

test.describe('C7 on a phone', () => {
  test.use(PHONE)

  test('in a long article the header tucks away reading down, returns on the way up, and stays for the open outline', async ({ page, request }) => {
    const index = await (await request.get('/api/search-index')).json()
    const docs = (index.docs as { kind: string; href: string }[]).filter((d) => d.kind === 'post' || d.kind === 'work')
    let href: string | null = null
    for (const doc of docs) {
      await page.goto(doc.href)
      await settle(page)
      if (await page.evaluate(() => document.documentElement.scrollHeight >= innerHeight * 3)) {
        href = doc.href
        break
      }
    }
    test.skip(!href, 'no long article in this store')
    const headerTop = () => page.locator('.site-header-sticky').evaluate((el) => Math.round(el.getBoundingClientRect().top))
    await page.mouse.wheel(0, 700)
    await expect.poll(headerTop).toBeLessThan(-40)
    await page.mouse.wheel(0, -120)
    await expect.poll(headerTop).toBe(0)
    // Never while the article's outline is open.
    const toggle = page.getByRole('button', { name: /on this page/i })
    if ((await toggle.count()) > 0) {
      await page.evaluate(() => window.scrollTo(0, 0))
      await toggle.click()
      await page.mouse.wheel(0, 700)
      await page.waitForTimeout(600)
      expect(await page.evaluate(() => document.documentElement.hasAttribute('data-header-hidden'))).toBe(true)
      expect(await headerTop()).toBe(0)
    }
  })
})

// ── C9: visitor keyboard layer ──────────────────────────────────────────────

const activeHref = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('href') ?? null)

test.describe('C9 keyboard layer', () => {
  test('J / K move through /blog and /work, Enter opens the item', async ({ page }) => {
    for (const path of ['/blog', '/work']) {
      await page.goto(path)
      await settle(page)
      const hrefs = await page.locator('main [data-kbd-item]').evaluateAll((els) => els.map((el) => el.getAttribute('data-vt-morph')))
      if (hrefs.length < 1) continue
      await page.keyboard.press('j')
      await expect.poll(() => activeHref(page)).toBe(hrefs[0])
      if (hrefs.length > 1) {
        await page.keyboard.press('j')
        await expect.poll(() => activeHref(page)).toBe(hrefs[1])
        await page.keyboard.press('k')
        await expect.poll(() => activeHref(page)).toBe(hrefs[0])
      }
      await page.keyboard.press('k')
      await expect.poll(() => activeHref(page), 'no wrap at the top').toBe(hrefs[0])
      await page.keyboard.press('Enter')
      await page.waitForURL(`**${hrefs[0]}`)
    }
  })

  test('nothing fires in a text field, while composing, or with the shortcuts off', async ({ page }) => {
    await page.goto('/blog')
    await settle(page)
    test.skip((await page.locator('main [data-kbd-item]').count()) === 0, 'empty store: no post')
    // An input method composing: J belongs to the composition.
    await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', isComposing: true, bubbles: true })))
    await page.waitForTimeout(300)
    expect(await activeHref(page)).toBeNull()
    // Turned off from the palette: J, ? and G H do nothing.
    await page.keyboard.press('ControlOrMeta+KeyK')
    await page.getByRole('combobox').fill('keyboard shortcuts')
    await page.getByRole('option', { name: /Keyboard shortcuts: on/ }).click()
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0)
    await page.locator('main').click({ position: { x: 2, y: 2 } })
    for (const key of ['j', 'Shift+Slash', 'g', 'h']) await page.keyboard.press(key)
    await page.waitForTimeout(1500)
    expect(await activeHref(page)).toBeNull()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(new URL(page.url()).pathname).toBe('/blog')
    await page.evaluate(() => localStorage.removeItem('kbd:shortcuts:v1'))
  })

  test('G shows its hint when held a moment, then the second key goes', async ({ page }) => {
    await page.goto('/about')
    await settle(page)
    await page.keyboard.press('g')
    const hint = page.locator('.kbd-hint')
    await expect(hint).toHaveAttribute('data-open', '')
    await expect(hint).toContainText('Go to')
    await expect(hint).toHaveAttribute('aria-hidden', 'true')
    await page.keyboard.press('w')
    await page.waitForURL('**/work')
    await expect(hint).not.toHaveAttribute('data-open', '')
  })

  test('[ and ] follow the article pager; T switches the theme', async ({ page }) => {
    await page.goto('/blog')
    await settle(page)
    const link = await firstPost(page)
    test.skip(!link, 'empty store: no post')
    await link!.click()
    await page.waitForURL('**/blog/*')
    await settle(page)
    const hrefOf = async (rel: string) => {
      const a = page.locator(`main a[rel="${rel}"]`)
      return (await a.count()) ? a.first().getAttribute('href') : null
    }
    const next = await hrefOf('next')
    const prev = await hrefOf('prev')
    const here = new URL(page.url()).pathname
    if (next) {
      await page.keyboard.press(']')
      await page.waitForURL(`**${next}`)
      await expect(page.locator('main a[rel="prev"]')).toHaveAttribute('href', here)
      await settle(page)
      await page.keyboard.press('[')
      await page.waitForURL(`**${here}`)
    } else if (prev) {
      await page.keyboard.press('[')
      await page.waitForURL(`**${prev}`)
    }
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme)
    const before = await theme()
    await page.keyboard.press('t')
    await expect.poll(theme).not.toBe(before)
    // As with the button, a press during the circular reveal is ignored.
    await page.waitForFunction(() => !document.documentElement.classList.contains('theme-vt'))
    await page.keyboard.press('t')
    await expect.poll(theme).toBe(before)
  })
})
