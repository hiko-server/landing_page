import { chromium, type CDPSession, type Page } from '@playwright/test'
import { test, expect, settle, ADMIN, loginAsAdmin } from './fixtures'

/**
 * Home and About (stream home-about-isr): ISR headers (G1), the compact Open
 * Source band and its trimmed payload (A2), the narrative /about (A4), the
 * owner-ordered sections and the proof strip (A1, @admin), and the
 * back/forward cache (FIX-22). Desktop Chromium project.
 */

/** The page's __NEXT_DATA__ props. */
async function pageProps(page: Page): Promise<Record<string, any>> {
  const raw = await page.locator('#__NEXT_DATA__').textContent()
  return (JSON.parse(raw || '{}') as { props?: { pageProps?: Record<string, any> } }).props?.pageProps || {}
}

/** Scroll to the bottom in steps so every lazy section mounts. */
async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += Math.round(innerHeight * 0.75)) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 80))
    }
  })
}

/** An If-Match header for a version-checked write (none when the version is unknown). */
const ifMatch = (etag: string | null): Record<string, string> => (etag ? { 'If-Match': etag } : {})

/** Same-origin fetch from the page (the session cookie is Secure: the browser sends it to 127.0.0.1, Playwright's request client does not). */
function adminFetch(page: Page, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  return page.evaluate(
    async ([m, u, b, h]) => {
      const res = await fetch(u as string, {
        method: m as string,
        headers: { 'Content-Type': 'application/json', ...(h as Record<string, string>) },
        body: b === undefined ? undefined : JSON.stringify(b),
      })
      return { status: res.status, etag: res.headers.get('ETag'), text: await res.text() }
    },
    [method, url, body, headers] as const,
  )
}

test.describe('G1: / and /about are statically regenerated', () => {
  for (const path of ['/', '/about']) {
    test(`${path} is served from the ISR cache with a time-based window`, async ({ request }) => {
      // The first hit after a deploy may still be the build-time copy (1 s window).
      await request.get(path)
      const res = await request.get(path)
      expect(res.status()).toBe(200)
      const cc = res.headers()['cache-control'] || ''
      expect(cc, `${path} Cache-Control`).not.toMatch(/no-store/)
      expect(cc, `${path} Cache-Control`).toMatch(/s-maxage=\d+/)
      expect(cc).toMatch(/stale-while-revalidate=\d+/)
    })
  }

  test('the contact nonce is never cached by a shared cache, and never no-store (FIX-22)', async ({ request }) => {
    const res = await request.get('/api/contact/nonce')
    expect(res.status()).toBe(200)
    expect(res.headers()['cache-control']).toBe('private, no-cache, max-age=0')
  })
})

test.describe('A2: the home page', () => {
  test('the contact section links to /contact: no form, no human-check nonce on the home page', async ({ page }) => {
    const nonces: string[] = []
    page.on('request', (r) => {
      if (new URL(r.url()).pathname === '/api/contact/nonce') nonces.push(r.url())
    })
    await page.goto('/')
    const contact = page.locator('#section-contact')
    test.skip((await contact.count()) === 0, 'the contact section is switched off in this content store')
    await scrollThrough(page)
    await contact.scrollIntoViewIfNeeded()
    const cta = contact.getByRole('link', { name: /write to me/i })
    await expect(cta).toBeVisible()
    await expect(cta).toHaveAttribute('href', '/contact')
    await expect(contact.locator('form, textarea, input')).toHaveCount(0)
    await page.waitForLoadState('networkidle')
    expect(nonces, 'the home page fetched a contact nonce').toEqual([])
  })

  test('the GitHub props carry only what the band renders (compact calendar, pinned repos, language stack)', async ({ page }) => {
    await page.goto('/')
    const { github } = await pageProps(page)
    test.skip(!github, 'no GitHub data was rendered into this page (not ready in the server budget)')
    expect(github.contributions, 'the 367 day objects are not shipped').toBeUndefined()
    expect(github.topRepos).toBeUndefined()
    if (github.calendar && github.calendar.available !== false) {
      expect(Array.isArray(github.calendar.counts)).toBe(true)
      expect(github.calendar.counts.every((n: unknown) => typeof n === 'number')).toBe(true)
    }
    if (github.repos) {
      expect(github.repos.repos.length).toBeLessThanOrEqual(3)
      for (const r of github.repos.repos) expect(Object.keys(r)).not.toContain('full_name')
    }
    if (github.languages?.available) expect(github.languages.slices.length).toBeLessThanOrEqual(6)
    expect(JSON.stringify(github).length, 'GitHub props size').toBeLessThan(12_000)
  })

  test('the contribution calendar is one path per level with a text summary, not a grid of cells', async ({ page }) => {
    await page.goto('/')
    const svg = page.locator('#section-open-source svg.contrib-svg')
    test.skip((await svg.count()) === 0, 'no contribution calendar in this environment (GitHub unreachable)')
    await expect(svg).toHaveAttribute('role', 'img')
    expect(await svg.locator('path[data-level]').count()).toBeLessThanOrEqual(5)
    await expect(page.locator('#section-open-source [role="gridcell"]')).toHaveCount(0)
    const summaryId = await svg.getAttribute('aria-describedby')
    expect(summaryId).toBeTruthy()
    await expect(page.locator(`[id="${summaryId}"]`)).toContainText(/Active on \d+ of \d+ days\./)
    // The markup stays small: one path string per level, no per-day elements.
    const html = await svg.evaluate((el) => el.outerHTML.length)
    expect(html).toBeLessThan(20_000)
  })

  test('languages are one stacked bar (top five + Other) with a text legend', async ({ page }) => {
    // Without server-rendered data (GitHub unreachable here), the widget's
    // retry fetches the API: answer it with a fixed breakdown of eight languages.
    await page.route('**/api/github/languages', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          available: true,
          total: 100,
          breakdown: { TypeScript: 40, Python: 20, Rust: 12, Go: 10, Shell: 8, CSS: 5, HTML: 3, C: 2 },
        }),
      }),
    )
    await page.goto('/')
    const legend = page.getByRole('list', { name: /languages by share of code/i })
    if ((await legend.count()) === 0) {
      const retry = page.locator('#section-open-source').getByText('Language breakdown is unavailable right now.').locator('..').getByRole('button', { name: 'Try again' })
      test.skip((await retry.count()) === 0, 'the Open Source band is not on this home page')
      await retry.click()
      await expect(legend).toHaveAttribute('aria-label', 'Languages by share of code, top 5 of 8')
      await expect(legend.getByRole('listitem').last()).toContainText('Other')
    }
    const items = await legend.getByRole('listitem').count()
    expect(items).toBeGreaterThan(0)
    expect(items).toBeLessThanOrEqual(6)
    expect(await page.locator('[data-language-bar] > div').count()).toBe(items)
  })
})

test.describe('A4: /about', () => {
  test('identity rail + the open CV; no GitHub widgets or experience timeline', async ({ page }) => {
    await page.goto('/about')
    await settle(page)
    const h1 = page.locator('h1')
    await expect(h1).toHaveCount(1)
    await expect(page.locator('header h1')).toBeVisible()
    await expect(page.locator('section[aria-label="GitHub stats"]')).toHaveCount(0)
    await expect(page.locator('svg.contrib-svg')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Recent Activity' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'View CV' })).toHaveAttribute('href', '/cv')
    // Every CV section starts open, inside an h3 (page outline).
    const toggles = page.locator('h3 > button[id^="accordion-button"]')
    const n = await toggles.count()
    test.skip(n === 0, 'the public CV renders no sections here')
    for (let i = 0; i < n; i++) await expect(toggles.nth(i)).toHaveAttribute('aria-expanded', 'true')
    // No bio was written in this store unless the owner did: never a CV fallback.
    const props = await pageProps(page)
    if (!props.bio) await expect(page.locator('#about-bio')).toHaveCount(0)
  })

  test('the section nav lists the rendered sections and jumps to them', async ({ page }) => {
    await page.goto('/about')
    const nav = page.getByRole('navigation', { name: 'On this page' })
    test.skip((await nav.count()) === 0 || !(await nav.isVisible()), 'fewer than two sections')
    const links = nav.getByRole('link')
    const count = await links.count()
    for (let i = 0; i < count; i++) {
      const id = ((await links.nth(i).getAttribute('href')) || '').replace(/^#/, '')
      await expect(page.locator(`[id="${id}"]`), `nav target #${id}`).toHaveCount(1)
    }
    const last = links.nth(count - 1)
    const id = ((await last.getAttribute('href')) || '').slice(1)
    await last.click()
    await expect(page).toHaveURL(new RegExp(`#${id}$`))
    await expect(page.locator(`[id="${id}"]`)).toBeInViewport()
  })
})

test.describe('FIX-22: back/forward cache', () => {
  // Playwright launches Chromium with --disable-back-forward-cache, and its
  // default headless shell never uses the cache (BackForwardCacheDisabledForDelegate).
  // This browser is the full Chromium build in new-headless mode with
  // Chrome's default, so a restore can actually happen (`playwright install
  // chromium` installs it next to the shell).
  for (const path of ['/', '/about']) {
    test(`${path} is restored from the back/forward cache`, async ({ baseURL, browserName }) => {
      test.skip(browserName !== 'chromium', 'CDP is Chromium-only')
      const browser = await chromium.launch({ channel: 'chromium', ignoreDefaultArgs: ['--disable-back-forward-cache'] })
      try {
        const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } })
        const page = await context.newPage()
        await page.addInitScript(() => {
          addEventListener('pageshow', (e) => {
            const w = window as unknown as { __restored: boolean }
            w.__restored = (e as PageTransitionEvent).persisted
          })
        })
        const cdp: CDPSession = await context.newCDPSession(page)
        await cdp.send('Page.enable')
        const notRestored: string[] = []
        cdp.on('Page.backForwardCacheNotUsed', (e) => {
          for (const r of e.notRestoredExplanations || []) notRestored.push(`${r.type}: ${r.reason}`)
        })
        await page.goto(path, { waitUntil: 'load' })
        // A cached copy is served once regenerated; scroll so every widget mounts.
        await scrollThrough(page)
        await page.waitForLoadState('networkidle')
        await page.goto('/colophon', { waitUntil: 'load' })
        // A restore fires pageshow, not load: wait for the commit, then read the flag
        // (the evaluation can land while the restored document takes over).
        await page.goBack({ waitUntil: 'commit' })
        const restored = () =>
          page.evaluate(() => (window as unknown as { __restored?: boolean }).__restored).catch(() => undefined)
        await expect.poll(restored).toBe(true)
        expect(notRestored, `${path} was not restored from the back/forward cache`).toEqual([])
      } finally {
        await browser.close()
      }
    })
  }
})

test.describe('A1 and A4: owner content', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test('Recruiter-first order and a CV-suggested highlight reach the home page right after the save', async ({ page }) => {
    await loginAsAdmin(page)
    const original = await adminFetch(page, 'GET', '/api/admin/home')
    expect(original.status).toBe(200)
    try {
      await page.goto('/admin/dashboard?tab=home')
      const recruiter = page.getByRole('button', { name: 'Recruiter-first' })
      await expect(recruiter).toBeVisible()
      if (await recruiter.isEnabled()) await recruiter.click()
      await expect(page.getByText('Order: recruiter-first.')).toBeVisible()

      const suggestions = page.getByRole('list', { name: 'Suggested highlights' })
      const hasSuggestion = (await suggestions.count()) > 0
      let href = ''
      if (hasSuggestion) {
        const add = suggestions.getByRole('button', { name: /^add highlight:/i }).first()
        await add.click()
        href = await page.getByLabel('Source link').first().inputValue()
        expect(href).toMatch(/^\/(cv|about)#/)
      }

      const saved = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/home' && r.request().method() === 'PUT')
      await page.getByRole('button', { name: 'Save changes' }).click()
      const res = await saved
      expect(res.status()).toBe(200)
      const body = (await res.json()) as { revalidated?: string[] }
      expect(body.revalidated).toEqual(expect.arrayContaining(['/', '/about']))

      await page.goto('/')
      const ids = await page.locator('main section[id^="section-"]').evaluateAll((els) => els.map((el) => el.id))
      const projects = ids.indexOf('section-projects')
      const openSource = ids.indexOf('section-open-source')
      if (projects >= 0 && openSource >= 0) expect(projects, `order: ${ids.join(', ')}`).toBeLessThan(openSource)
      if (hasSuggestion) {
        const strip = page.getByRole('region', { name: 'Highlights' })
        await expect(strip).toBeVisible()
        await expect(strip.getByRole('link').first()).toHaveAttribute('href', href)
      }
    } finally {
      const current = await adminFetch(page, 'GET', '/api/admin/home')
      const restored = await adminFetch(page, 'PUT', '/api/home', JSON.parse(original.text), ifMatch(current.etag))
      expect(restored.status, restored.text).toBe(200)
    }
  })

  test('a written bio shows on /about with a nav entry; "Remove from /about" takes it off', async ({ page }) => {
    await loginAsAdmin(page)
    const original = await adminFetch(page, 'GET', '/api/admin/page?name=about')
    expect(original.status).toBe(200)
    const before = JSON.parse(original.text) as { frontmatter: Record<string, unknown>; body: string }
    const text = 'E2E bio paragraph, written by the end-to-end suite and removed again.'
    try {
      const put = await adminFetch(page, 'PUT', '/api/admin/page', { name: 'about', frontmatter: { title: 'About' }, body: `${text}\n` }, ifMatch(original.etag))
      expect(put.status, put.text).toBe(200)
      expect((JSON.parse(put.text) as { revalidated: string[] }).revalidated).toContain('/about')

      await page.goto('/about')
      await expect(page.locator('#about-bio')).toContainText(text)
      await expect(page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'Bio' })).toHaveAttribute('href', '#about-bio')

      await page.goto('/admin/about')
      await page.getByRole('button', { name: 'Remove from /about' }).click()
      const saved = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/admin/page' && r.request().method() === 'PUT')
      await page.getByRole('alertdialog').getByRole('button', { name: 'Remove', exact: true }).click()
      expect((await saved).status()).toBe(200)
      await expect(page.getByTestId('page-body-note')).toContainText('no bio')

      await page.goto('/about')
      await expect(page.locator('#about-bio')).toHaveCount(0)
    } finally {
      // Leave the store as found (an empty body included) whatever step failed.
      const current = await adminFetch(page, 'GET', '/api/admin/page?name=about')
      const now = JSON.parse(current.text) as { body: string }
      if (now.body !== before.body) {
        const frontmatter = Object.keys(before.frontmatter).length ? before.frontmatter : { title: 'About' }
        const restored = await adminFetch(page, 'PUT', '/api/admin/page', { name: 'about', frontmatter, body: before.body }, ifMatch(current.etag))
        expect(restored.status, restored.text).toBe(200)
      }
    }
  })
})
