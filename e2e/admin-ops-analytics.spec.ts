import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { test, expect, settle, ADMIN, loginAsAdmin } from './fixtures'

/**
 * H9 — goal events in the browser and in Admin → Analytics.
 *
 * Public tests (desktop project): link clicks, ⌘K searches that find
 * nothing, CV printing and article read-through send ONE minimal event to
 * POST /api/g — `{ n, p, v? }`, never an address, a full URL or an
 * identifier — and nothing at all under Do Not Track or Global Privacy
 * Control. Safe against production: /api/g and /api/a are intercepted and
 * answered in the browser, nothing reaches the server.
 *
 * @admin: the Analytics panel shows Goals, Conversion and Searches with no
 * results, with truthful empty states, a labelled source picker and no
 * serious axe violations.
 */

type Goal = { n: string; p: string; v?: string }

/** Intercept the goal and page-view beacons (answered in the browser); the client is made to see a visitor's browser. */
async function captureGoals(page: Page, privacy: { dnt?: boolean; gpc?: boolean } = {}): Promise<Goal[]> {
  await page.addInitScript((p) => {
    // The client skips automated browsers (navigator.webdriver); look like a visitor's.
    Object.defineProperty(Navigator.prototype, 'webdriver', { configurable: true, get: () => false })
    if (p.dnt) Object.defineProperty(Navigator.prototype, 'doNotTrack', { configurable: true, get: () => '1' })
    if (p.gpc) Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { configurable: true, get: () => true })
  }, privacy)
  const goals: Goal[] = []
  await page.route('**/api/g', async (route) => {
    const body = route.request().postData()
    if (body) goals.push(JSON.parse(body) as Goal)
    await route.fulfill({ status: 204 })
  })
  await page.route('**/api/a', (route) => route.fulfill({ status: 204 }))
  return goals
}

/**
 * Two test links in the page's main region; a window-level listener (it runs
 * after the site's document-level one) keeps the browser from following them,
 * so no mail client opens and no other site is loaded.
 */
async function addTestLinks(page: Page) {
  await page.evaluate(() => {
    const box = document.createElement('p')
    box.id = 'e2e-goal-links'
    box.innerHTML =
      '<a id="e2e-mail" href="mailto:someone@example.com?subject=Hello">Write</a> <a id="e2e-out" href="https://www.example.org/some/path?ref=e2e#top">Elsewhere</a>'
    ;(document.querySelector('main') || document.body).append(box)
    window.addEventListener('click', (e) => {
      if ((e.target as Element | null)?.closest?.('#e2e-goal-links')) e.preventDefault()
    })
  })
}

test.describe('goal events (H9)', () => {
  test('a mailto: and an outbound link click each send one minimal event — no address, path or query', async ({ page }) => {
    const goals = await captureGoals(page)
    await page.goto('/about', { waitUntil: 'load' })
    await addTestLinks(page)
    await page.locator('#e2e-mail').click()
    await page.locator('#e2e-out').click()
    await expect.poll(() => goals.length, { message: 'two goal beacons' }).toBe(2)
    expect(goals).toEqual([
      { n: 'email_click', p: '/about' },
      { n: 'outbound_click', p: '/about', v: 'www.example.org' },
    ])
    expect(Object.keys(goals[0]).sort()).toEqual(['n', 'p'])
    expect(Object.keys(goals[1]).sort()).toEqual(['n', 'p', 'v'])
    const raw = JSON.stringify(goals)
    for (const leak of ['someone@example.com', 'some/path', 'ref=e2e', 'subject']) expect(raw).not.toContain(leak)
  })

  for (const privacy of [{ dnt: true }, { gpc: true }]) {
    test(`nothing is sent when the browser asks not to be tracked (${privacy.dnt ? 'DNT' : 'GPC'})`, async ({ page }) => {
      const goals = await captureGoals(page, privacy)
      const sent: string[] = []
      page.on('request', (r) => {
        if (new URL(r.url()).pathname === '/api/g') sent.push(r.url())
      })
      await page.goto('/about', { waitUntil: 'load' })
      await addTestLinks(page)
      await page.locator('#e2e-mail').click()
      await page.locator('#e2e-out').click()
      await page.waitForTimeout(600)
      expect(goals).toEqual([])
      expect(sent).toEqual([])
    })
  }

  test('⌘K: a search that finds nothing is sent once, normalised, after typing settles; addresses and long numbers never are', async ({ page }) => {
    const goals = await captureGoals(page)
    await page.goto('/', { waitUntil: 'load' })
    await settle(page)
    // The content index (fetched when the palette first opens) is part of every real search.
    const index = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/search-index', { timeout: 15_000 })
    await page.keyboard.press('ControlOrMeta+k')
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette).toBeVisible()
    const input = palette.getByRole('combobox')
    await expect(input).toBeFocused()
    expect((await index).ok()).toBe(true)

    await input.fill('  Qqzzxxjj   KFP ')
    await expect.poll(() => goals.filter((g) => g.n === 'search_empty'), { timeout: 8_000 }).toEqual([{ n: 'search_empty', p: '/', v: 'qqzzxxjj kfp' }])

    // The same text again in this page view, an e-mail address, six digits: nothing more.
    await input.fill('')
    await input.fill('QQZZXXJJ kfp')
    await page.waitForTimeout(2_000)
    await input.fill('someone@example.com')
    await page.waitForTimeout(2_000)
    await input.fill('order 123456')
    await page.waitForTimeout(2_000)
    expect(goals.filter((g) => g.n === 'search_empty')).toHaveLength(1)
    // A no-result search the visitor leaves by closing the palette is sent at once.
    await input.fill('Wwvvqqzz')
    await page.keyboard.press('Escape')
    await expect(palette).toBeHidden()
    await expect.poll(() => goals.filter((g) => g.n === 'search_empty').map((g) => g.v)).toEqual(['qqzzxxjj kfp', 'wwvvqqzz'])
    for (const g of goals) expect(Object.keys(g).sort()).toEqual(['n', 'p', 'v'])
  })

  test('printing the CV sends cv_print once per page view', async ({ page }) => {
    const goals = await captureGoals(page)
    const res = await page.goto('/cv', { waitUntil: 'load' })
    test.skip(res?.status() !== 200, 'no public CV (empty store)')
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeprint'))
      window.dispatchEvent(new Event('afterprint'))
      window.dispatchEvent(new Event('beforeprint'))
    })
    await expect.poll(() => goals.length).toBe(1)
    await page.waitForTimeout(400)
    expect(goals).toEqual([{ n: 'cv_print', p: '/cv' }])
  })

  test('reaching the end of a post after reading sends read_through once, with the path only', async ({ page }) => {
    const res = await page.request.get('/api/blog/list')
    const items = res.ok() ? (((await res.json()) as { items?: Array<{ slug: string }> }).items ?? []) : []
    test.skip(items.length === 0, 'no published posts (empty store)')
    const path = `/blog/${items[0].slug}`

    const goals = await captureGoals(page)
    await page.clock.install()
    // A short viewport: the end of the body starts below the fold.
    await page.setViewportSize({ width: 1280, height: 420 })
    await page.goto(path, { waitUntil: 'load' })
    await expect(page.locator('#article-end')).not.toBeInViewport()

    // Skimming to the end at once is not a read.
    await page.locator('#article-end').scrollIntoViewIfNeeded()
    await page.clock.fastForward(5_000)
    await page.waitForTimeout(300)
    expect(goals).toEqual([])

    // After the minimum reading time (at most 90 s) on the page, with the end in view: one event.
    await page.clock.fastForward(95_000)
    await expect.poll(() => goals.length).toBe(1)
    expect(goals[0]).toEqual({ n: 'read_through', p: path })

    // Scrolling away and back in the same page view sends nothing more.
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.locator('#article-end').scrollIntoViewIfNeeded()
    await page.clock.fastForward(95_000)
    await page.waitForTimeout(300)
    expect(goals).toHaveLength(1)
  })
})

test.describe('Admin → Analytics goals (H9)', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test('Goals, Conversion and Searches with no results render with truthful states, a labelled source picker and no serious axe violations', async ({ page }) => {
    await loginAsAdmin(page)
    const goalsResponse = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/admin/goals' && r.request().method() === 'GET')
    await page.goto('/admin/dashboard?tab=analytics')
    expect((await goalsResponse).status()).toBe(200)

    const goals = page.locator('[data-goals]')
    await expect(goals.getByRole('heading', { name: 'Goals', exact: true })).toBeVisible()
    await expect(goals.getByRole('heading', { name: 'Conversion', exact: true })).toBeVisible()
    await expect(goals.getByRole('heading', { name: 'Searches with no results', exact: true })).toBeVisible()

    // Every allow-listed goal has a row, zero or not.
    const table = goals.getByRole('table', { name: /Goal events in the last/ })
    for (const label of ['CV downloads', 'CV printed', 'vCard saved', 'Contact form sent', 'E-mail link clicks', 'Outbound link clicks', 'Read to the end']) {
      await expect(table.getByRole('row').filter({ hasText: label })).toHaveCount(1)
    }
    // Unique counts are labelled as visitor-days.
    await expect(table.getByRole('columnheader', { name: /Visitor-days/i })).toBeVisible()

    // A goal with a breakdown opens and closes it from the keyboard.
    const collapsed = table.getByRole('button', { expanded: false }).first()
    if (await collapsed.count()) {
      // Pin the button by what it controls: the expanded-state query stops matching once it opens.
      const controls = await collapsed.getAttribute('aria-controls')
      const disclosure = table.locator(`[aria-controls="${controls}"]`)
      await disclosure.focus()
      await page.keyboard.press('Enter')
      await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
      const detail = page.locator(`[id="${controls}"]`)
      await expect(detail).toBeVisible()
      await page.keyboard.press('Enter')
      await expect(detail).toBeHidden()
    }

    // The source picker is a labelled native select; choosing re-queries the conversion.
    const source = goals.getByRole('combobox', { name: 'Source' })
    await expect(source).toBeVisible()
    await expect(source).toHaveValue('')
    const options = await source.locator('option').allTextContents()
    expect(options[0]).toBe('All visitors')
    if (options.length > 1) {
      const requery = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/admin/goals' && new URL(r.url()).searchParams.has('source'))
      await source.selectOption({ index: 1 })
      expect((await requery).status()).toBe(200)
      await expect(goals.getByText(/Arrived from /)).toBeVisible()
    }

    // The period toggle drives the goals too.
    const weekly = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/admin/goals' && new URL(r.url()).searchParams.get('range') === '7d')
    await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: '7 days' }).click()
    expect((await weekly).status()).toBe(200)
    await expect(goals.getByRole('table', { name: 'Goal events in the last 7 days' })).toBeVisible()

    await settle(page)
    const axe = await new AxeBuilder({ page }).include('[data-goals]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
  })

  test('the goals endpoint refuses visitors and is never cached', async ({ browser }) => {
    const context = await browser.newContext()
    try {
      const res = await context.request.get('/api/admin/goals?range=30d')
      expect(res.status()).toBe(401)
    } finally {
      await context.close()
    }
  })
})
