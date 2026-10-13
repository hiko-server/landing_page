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
