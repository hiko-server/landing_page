import { test, expect, settle, seriousA11yViolations, undersizedTargets } from './fixtures'

/**
 * Public pages: structure, SEO basics, accessibility, layout and the global
 * chrome. Runs in every project (desktop 1280, tablet 768, Pixel 7, reduced
 * motion). Each page is loaded once per project and checked in one go, so
 * the contact form fetches as few human-check nonces as possible.
 */

type Route = { path: string; lang?: string; status?: number }

const ROUTES: Route[] = [
  { path: '/' },
  { path: '/about' },
  { path: '/cv' },
  { path: '/cv/zh', lang: 'zh-Hans' },
  { path: '/blog' },
  { path: '/work' },
  { path: '/now' },
  { path: '/uses' },
  { path: '/contact' },
  { path: '/colophon' },
  { path: '/this-page-does-not-exist', status: 404 },
]

const TITLE_SOFT_MAX = 60

/**
 * Length as search results lay it out: a CJK / full-width character takes
 * about two Latin character widths, so the 70–160 range applies to the
 * Chinese pages in Latin-equivalent units.
 */
function displayLength(text: string): number {
  let n = 0
  for (const ch of text) n += /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/.test(ch) ? 2 : 1
  return n
}

async function checkPage(page: import('@playwright/test').Page, route: Route, projectName: string, isMobile: boolean) {
  const expectedStatus = route.status ?? 200
  const response = await page.goto(route.path, { waitUntil: 'load' })
  expect(response?.status(), `${route.path} status`).toBe(expectedStatus)

  if (projectName === 'reduced') {
    // With reduced motion nothing may still be animating once the page has
    // loaded, and nothing (a fading overlay, a sliding panel) may sit on top of
    // the visible links and buttons.
    const running = await page.evaluate(
      () =>
        document.getAnimations().filter((a) => {
          const timing = a.effect?.getComputedTiming()
          return a.playState === 'running' && timing?.endTime !== Infinity && Number(timing?.duration ?? 0) > 50
        }).length,
    )
    expect(running, 'finite animations still running under prefers-reduced-motion').toBe(0)
    const blocked = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('a[href], button'))
        .filter((el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
        .filter((el) => {
          const r = el.getBoundingClientRect()
          if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          return !!hit && !el.contains(hit) && !hit.contains(el)
        })
        .map((el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40)),
    )
    expect(blocked, 'controls covered by another element').toEqual([])
  }

  await settle(page)

  // Exactly one visible h1.
  await expect(page.locator('h1:visible'), 'exactly one visible <h1>').toHaveCount(1)

  // Document language.
  await expect(page.locator('html')).toHaveAttribute('lang', route.lang ?? /^en(-|$)/)

  // <title>: present; long titles are reported, not failed.
  const title = (await page.title()).trim()
  expect(title.length, '<title> is empty').toBeGreaterThan(0)
  if (title.length > TITLE_SOFT_MAX) {
    test.info().annotations.push({ type: 'warning', description: `${route.path}: <title> is ${title.length} chars (> ${TITLE_SOFT_MAX}): "${title}"` })
  }

  // Meta description length (not on the 404 page).
  if (expectedStatus === 200) {
    const description = ((await page.locator('meta[name="description"]').first().getAttribute('content')) || '').trim()
    const length = displayLength(description)
    expect.soft(length, `${route.path} meta description length (70–160): "${description}"`).toBeGreaterThanOrEqual(70)
    expect.soft(length, `${route.path} meta description length (70–160): "${description}"`).toBeLessThanOrEqual(160)
  }

  // No horizontal page scroll at this viewport.
  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }))
  expect.soft(widths.scroll, `${route.path} scrollWidth ${widths.scroll} > innerWidth ${widths.inner}`).toBeLessThanOrEqual(widths.inner)

  // Accessibility: no serious or critical axe violations.
  const violations = await seriousA11yViolations(page)
  expect.soft(violations, `${route.path} axe serious/critical violations`).toEqual([])

  // Touch targets on phones.
  if (isMobile) {
    const small = await undersizedTargets(page)
    expect.soft(small, `${route.path} targets below 24×24 without spacing`).toEqual([])
  }
}

for (const route of ROUTES) {
  test(`page ${route.path}`, async ({ page, isMobile }, testInfo) => {
    await checkPage(page, route, testInfo.project.name, !!isMobile)
  })
}

test('published posts and case studies pass the same page checks', async ({ page, request, isMobile }, testInfo) => {
  const lists = await Promise.all(
    ['/api/blog/list', '/api/work/list'].map(async (url) => {
      const res = await request.get(url)
      if (!res.ok()) return []
      const body = (await res.json()) as { items?: { slug: string; permalink?: string }[] }
      return (body.items || []).slice(0, 1).map((it) => it.permalink || `${url.includes('blog') ? '/blog' : '/work'}/${it.slug}`)
    }),
  )
  const paths = lists.flat()
  test.skip(paths.length === 0, 'the content store has no published posts or case studies (empty CI store)')
  for (const path of paths) {
    await checkPage(page, { path: new URL(path, 'http://x').pathname }, testInfo.project.name, !!isMobile)
  }
})

test('theme toggle flips data-theme and the choice survives a reload', async ({ page }) => {
  await page.goto('/')
  await settle(page)
  const html = page.locator('html')
  const before = await html.getAttribute('data-theme')
  expect(before === 'light' || before === 'dark', `data-theme is "${before}"`).toBe(true)
  const after = before === 'dark' ? 'light' : 'dark'
  await page.getByRole('button', { name: /switch to (light|dark) theme/i }).filter({ visible: true }).first().click()
  await expect(html).toHaveAttribute('data-theme', after)
  await page.reload()
  await expect(html).toHaveAttribute('data-theme', after)
})

test('⌘K opens the command palette; "cv" + Enter navigates to the CV', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'keyboard shortcut — desktop only')
  await page.goto('/')
  await settle(page)
  await page.keyboard.press('ControlOrMeta+KeyK')
  const input = page.getByRole('combobox', { name: /search/i })
  await expect(input).toBeVisible()
  await input.fill('cv')
  await expect(page.getByRole('option').first()).toBeVisible()
  await input.press('Enter')
  await expect(page).toHaveURL(/\/cv(\/zh)?([?#].*)?$/)
})

test('legacy /cv?lang=zh answers 308 → /cv/zh keeping other parameters', async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'HTTP-level check: once is enough')
  for (const lang of ['zh', 'cn']) {
    const res = await request.get(`/cv?lang=${lang}&print=1`, { maxRedirects: 0 })
    expect(res.status()).toBe(308)
    const location = new URL(res.headers()['location'] || '', 'http://placeholder.invalid')
    expect(location.pathname + location.search).toBe('/cv/zh?print=1')
  }
})

test('the image optimizer is disabled', async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'HTTP-level check: once is enough')
  const res = await request.get('/_next/image?url=%2Ffavicon.ico&w=64&q=75', { maxRedirects: 0 })
  expect(res.status()).toBe(404)
  expect(res.headers()['content-security-policy'], 'security headers on the 404').toBeTruthy()
})

test('uploaded images whose WebP variants exist ship a srcset on posts and case studies', async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'HTTP-level check: once is enough')
  const lists = await Promise.all(
    ['/api/blog/list', '/api/work/list'].map(async (url) => {
      const res = await request.get(url)
      if (!res.ok()) return []
      const body = (await res.json()) as { items?: { slug: string; permalink?: string }[] }
      return (body.items || []).map((it) => it.permalink || `${url.includes('blog') ? '/blog' : '/work'}/${it.slug}`)
    }),
  )
  const paths = lists.flat().map((p) => new URL(p, 'http://x').pathname)
  test.skip(paths.length === 0, 'the content store has no published posts or case studies (empty CI store)')
  const missing: string[] = []
  for (const path of paths) {
    const html = await (await request.get(path)).text()
    for (const tag of html.match(/<img\b[^>]*>/g) || []) {
      const src = /\ssrc="(\/uploads\/[^"]+)"/.exec(tag)?.[1]
      if (!src || /\ssrcset="/i.test(tag)) continue
      // The narrowest variant is stored → the page must offer it (lib/uploadVariants variantSrcSet).
      const variant = await request.head(`${src}.w640.webp`)
      if (variant.ok()) missing.push(`${path}: ${src}`)
    }
  }
  expect(missing, 'uploads with a stored w640 WebP but no srcset').toEqual([])
})

// ── Home identity: layout after lazy sections mount, Field Notes focus, Person entity, hero facts ──

/**
 * Scroll the whole page in steps, the way a visitor does, so every lazy
 * section (WhenVisible, code-split widgets) mounts; stops once the bottom is
 * reached and the page has stopped growing.
 */
async function scrollThrough(page: import('@playwright/test').Page) {
  let stableAtBottom = 0
  for (let i = 0; i < 120 && stableAtBottom < 2; i++) {
    const atBottom = await page.evaluate(() => {
      const before = document.documentElement.scrollHeight
      window.scrollBy(0, Math.round(window.innerHeight * 0.75))
      return window.scrollY + window.innerHeight >= before - 2
    })
    await page.waitForTimeout(150)
    stableAtBottom = atBottom ? stableAtBottom + 1 : 0
  }
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
}

for (const path of ['/', '/about']) {
  test(`no horizontal page scroll on ${path} once every lazy section has mounted`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'load' })
    await settle(page)
    await scrollThrough(page)
    if (path === '/' && (await page.locator('#section-photos').count())) {
      // The Field Notes strip is what used to widen the page: make sure it is really there.
      await expect(page.locator('#section-photos .field-notes-strip')).toBeAttached()
    }
    await settle(page)
    const device = page.viewportSize()?.width ?? 0
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }))
    // On phones an overflow grows the layout viewport itself, so innerWidth alone cannot catch it.
    expect(widths.inner, `${path}: layout viewport ${widths.inner} wider than the device (${device})`).toBeLessThanOrEqual(device)
    expect(widths.scroll, `${path}: scrollWidth ${widths.scroll} > innerWidth ${widths.inner}`).toBeLessThanOrEqual(widths.inner)

    // Labels wrap between words instead of being cut off (accordion titles)
    // or split mid-word (GitHub stat labels).
    const clipped = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[id^="accordion-button"] span, section[aria-label="GitHub stats"] p'))
        .filter((el) => el.clientWidth > 0)
        .filter(
          (el) =>
            el.scrollWidth > el.clientWidth + 1 ||
            el.scrollHeight > el.clientHeight + 1 ||
            (el.tagName === 'P' && !['normal', ''].includes(getComputedStyle(el).overflowWrap)),
        )
        .map((el) => (el.textContent || '').trim().slice(0, 40)),
    )
    expect.soft(clipped, `${path}: truncated or mid-word-broken labels`).toEqual([])
  })
}

test('the Field Notes scroller shows a visible focus ring when reached by keyboard', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'keyboard focus — desktop only')
  await page.goto('/')
  await settle(page)
  const section = page.locator('#section-photos')
  test.skip((await section.count()) === 0, 'no Field Notes photos in this content store')
  await section.scrollIntoViewIfNeeded()
  const strip = section.locator('.field-notes-strip')
  await expect(strip).toBeAttached()
  // Keyboard path: from the first photo, Shift+Tab lands on the scroller.
  await strip.locator('button').first().focus()
  await page.keyboard.press('Shift+Tab')
  const ring = await strip.evaluate((el) => {
    // The strip's edge mask would fade its own outline: the ring is on its parent.
    const cs = getComputedStyle(el.parentElement as HTMLElement)
    return { focused: document.activeElement === el, focusVisible: el.matches(':focus-visible'), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) }
  })
  expect(ring.focused, 'the scroller has focus').toBe(true)
  expect(ring.focusVisible, 'the scroller matches :focus-visible').toBe(true)
  expect(ring.style, 'focus ring style').not.toBe('none')
  expect(ring.width, 'focus ring width').toBeGreaterThanOrEqual(2)
})

/** Top-level JSON-LD nodes of an HTML document. */
function jsonLdNodes(html: string): Array<Record<string, any>> {
  const out: Array<Record<string, any>> = []
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    const data = JSON.parse(m[1])
    out.push(...(Array.isArray(data) ? data : [data]))
  }
  return out
}

test('the Person entity is identical on /, /about, /cv and /cv/zh and uses the hero portrait', async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'HTTP-level check: once is enough')
  const html: Record<string, string> = {}
  const persons: Record<string, Record<string, any>> = {}
  for (const path of ['/', '/about', '/cv', '/cv/zh']) {
    const res = await request.get(path)
    expect(res.status(), `${path} status`).toBe(200)
    html[path] = await res.text()
    const nodes = jsonLdNodes(html[path]).filter((n) => n['@type'] === 'Person')
    expect(nodes.length, `${path}: exactly one top-level Person node`).toBe(1)
    persons[path] = nodes[0]
  }
  for (const path of ['/about', '/cv', '/cv/zh']) {
    expect(persons[path], `${path}: Person differs from the home page's (same @id)`).toEqual(persons['/'])
  }
  // The image is the portrait the home hero shows (or its 640 px variant), as an absolute URL.
  const image = String(persons['/'].image || '')
  expect(image, 'absolute Person image URL').toMatch(/^https:\/\//)
  const shown = new URL(image).pathname.replace(/\.w\d+\.webp$/, '')
  expect(html['/'], `Person image ${image} is not the portrait the hero shows`).toContain(`src="${shown}"`)
})

test('hero facts come from the CV: languages in the CV’s order, no derived “since” year', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'content check: once is enough')
  await page.goto('/')
  const languages = page.locator('.hero-meta [data-meta="languages"]')
  const location = page.locator('.hero-meta [data-meta="location"]')
  const chip = page.locator('.hero-currently').first()
  const shownLanguages = (await languages.count()) ? (await languages.innerText()).split('·').map((s) => s.trim()) : []
  const shownLocation = (await location.count()) ? (await location.innerText()).trim() : ''
  if (await chip.count()) expect(await chip.textContent(), 'the chip carries no derived "since YYYY"').not.toMatch(/\bsince (19|20)\d\d\b/)

  await page.goto('/cv')
  const cvLanguages = page.locator('#cv-extraSkill')
  if (shownLanguages.length && (await cvLanguages.count())) {
    const text = await cvLanguages.innerText()
    const positions = shownLanguages.map((name) => text.indexOf(name))
    expect(positions.every((p) => p >= 0), `hero languages ${shownLanguages.join(', ')} are on the CV`).toBe(true)
    expect([...positions].sort((a, b) => a - b), 'hero languages follow the CV’s order').toEqual(positions)
  }
  const cvHeader = page.locator('#cv-personalInformation')
  if (shownLocation && (await cvHeader.count())) await expect(cvHeader).toContainText(shownLocation)
})
