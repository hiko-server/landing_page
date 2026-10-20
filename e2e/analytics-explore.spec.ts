import type { Page, Response } from '@playwright/test'
import { test, expect, settle, seriousA11yViolations, undersizedTargets, ADMIN, loginAsAdmin } from './fixtures'

/**
 * H10 — Analytics explore (Admin → Analytics): the period picker (presets,
 * custom range, previous / next), Compare, filters (from the Filter picker
 * and by clicking a row) that every request of the view carries and the URL
 * keeps, the page detail of one page, the CSV export, the weekly digest
 * card and the dashboard dropping the view's parameters on other tabs.
 *
 * Works on an empty store (the CI container) and on one with traffic: each
 * assertion is about the view's controls and truthful states, never about
 * particular numbers. Nothing is written except the digest switch, which is
 * put back as it was.
 */

const ANALYTICS = '/admin/dashboard?tab=analytics'

const isReport = (r: Response) => new URL(r.url()).pathname === '/api/admin/analytics' && !new URL(r.url()).searchParams.has('values') && r.request().method() === 'GET'
const isGoals = (r: Response) => new URL(r.url()).pathname === '/api/admin/goals' && r.request().method() === 'GET'

async function openAnalytics(page: Page, url = ANALYTICS) {
  const report = page.waitForResponse(isReport)
  const goals = page.waitForResponse(isGoals)
  await page.goto(url)
  expect((await report).status()).toBe(200)
  expect((await goals).status()).toBe(200)
  await expect(page.locator('[data-goals]').getByRole('heading', { name: 'Goals', exact: true })).toBeVisible()
}

/** GET a URL with the page's own session (a download): status, type, disposition and the first bytes. */
async function download(page: Page, url: string) {
  return page.evaluate(async (u) => {
    const res = await fetch(u)
    const buf = new Uint8Array(await res.arrayBuffer())
    return {
      status: res.status,
      type: res.headers.get('content-type'),
      disposition: res.headers.get('content-disposition'),
      cache: res.headers.get('cache-control'),
      head: Array.from(buf.slice(0, 64)),
      text: new TextDecoder().decode(buf.slice(0, 400)),
    }
  }, url)
}

test.describe('Analytics explore (H10)', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test('@admin the period picker: presets, previous / next and a custom range drive every request and the URL', async ({ page }) => {
    await loginAsAdmin(page)
    await openAnalytics(page)
    const period = page.getByRole('group', { name: 'Period' })
    await expect(period.getByRole('button', { name: /^Period: Last 30 days/ })).toBeVisible()

    // A preset from the keyboard: both reports follow, the URL keeps it.
    const report = page.waitForResponse((r) => isReport(r) && new URL(r.url()).searchParams.get('period') === '7d')
    const goals = page.waitForResponse((r) => isGoals(r) && new URL(r.url()).searchParams.get('period') === '7d')
    await period.getByRole('button', { name: /^Period:/ }).focus()
    await page.keyboard.press('Enter')
    await page.getByRole('menuitemradio', { name: 'Last 7 days' }).click()
    expect((await report).status()).toBe(200)
    expect((await goals).status()).toBe(200)
    await expect(page).toHaveURL(/[?&]period=7d(&|$)/)
    await expect(page.locator('[data-goals]').getByRole('table', { name: 'Goal events in the last 7 days' })).toBeVisible()

    // Previous period: a custom range of the same length, one step back.
    const back = page.waitForResponse((r) => isReport(r) && new URL(r.url()).searchParams.get('period') === 'custom')
    await period.getByRole('button', { name: /^Previous period/ }).click()
    const url = new URL((await back).url())
    const from = url.searchParams.get('from')!
    const to = url.searchParams.get('to')!
    expect(Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1).toBe(7)
    await expect(period.getByRole('button', { name: /^Next period/ })).toBeEnabled()

    // A custom range typed in the dialog.
    await period.getByRole('button', { name: /^Period:/ }).click()
    await page.getByRole('menuitem', { name: 'Custom range…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Custom range' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('From')).toBeFocused()
    const end = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    const start = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10)
    await dialog.getByLabel('From').fill(start)
    await dialog.getByLabel('To').fill(end)
    const custom = page.waitForResponse((r) => isReport(r) && new URL(r.url()).searchParams.get('from') === start && new URL(r.url()).searchParams.get('to') === end)
    await dialog.getByRole('button', { name: 'Show 10 days' }).click()
    expect((await custom).status()).toBe(200)
    await expect(dialog).toBeHidden()

    // Compare is a labelled switch that the URL keeps.
    const compared = page.waitForResponse((r) => isReport(r) && new URL(r.url()).searchParams.get('compare') === '1')
    const compare = page.getByRole('checkbox', { name: 'Compare' })
    await compare.focus()
    await page.keyboard.press('Space')
    await expect(compare).toBeChecked()
    expect((await compared).status()).toBe(200)
    await expect(page).toHaveURL(/[?&]compare=1/)
  })

  test('@admin filters: added from the picker or a table row, carried by every request, kept in the URL, removable', async ({ page }) => {
    await loginAsAdmin(page)
    await openAnalytics(page)

    const filterButton = page.getByRole('button', { name: 'Filter', exact: true })
    await filterButton.click()
    const form = page.getByRole('form', { name: 'Add a filter' })
    await expect(form).toBeVisible()
    await expect(form.getByLabel('Show')).toBeFocused()
    await form.getByLabel('Show').selectOption('device')
    await form.getByLabel('Device', { exact: true }).selectOption('desktop')
    const filtered = page.waitForResponse((r) => isReport(r) && new URL(r.url()).searchParams.getAll('f').includes('device:is:desktop'))
    const filteredGoals = page.waitForResponse((r) => isGoals(r) && new URL(r.url()).searchParams.getAll('f').includes('device:is:desktop'))
    await form.getByRole('button', { name: 'Apply' }).click()
    const body = (await (await filtered).json()) as { mode: string; window: { days: number } }
    expect(body.mode).toBe('raw')
    expect(body.window.days).toBeLessThanOrEqual(35)
    expect((await filteredGoals).status()).toBe(200)
    await expect(page).toHaveURL(/f=device%3Ais%3Adesktop/)
    const chips = page.getByRole('list', { name: 'Active filters' })
    await expect(chips.getByText('Desktop', { exact: true })).toBeVisible()

    // At once again (the picker reopens while the last one is still closing); an invalid value is refused in place.
    await filterButton.click()
    await expect(form).toBeVisible()
    await expect(filterButton).toHaveAttribute('aria-expanded', 'true')
    await form.getByLabel('Show').selectOption('country')
    await form.getByLabel('Country', { exact: true }).fill('Japan')
    await form.getByRole('button', { name: 'Apply' }).click()
    await expect(form.getByText('Enter a two-letter code such as JP.')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(form).toBeHidden()
    await expect(filterButton).toBeFocused()

    // A row of a breakdown filters by its value (when the store has any).
    const row = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Browsers', exact: true }) }).getByRole('button', { name: /show only this browser/ }).first()
    if (await row.count()) {
      const name = (await row.innerText()).trim()
      const byRow = page.waitForResponse((r) => isReport(r) && new URL(r.url()).searchParams.getAll('f').some((f) => f.startsWith('browser:is:')))
      await row.click()
      expect((await byRow).status()).toBe(200)
      await expect(chips.getByText(name, { exact: true })).toBeVisible()
    }

    // Removing a chip refetches without it; the view stays usable on a phone.
    const removed = page.waitForResponse((r) => isReport(r) && !new URL(r.url()).searchParams.getAll('f').includes('device:is:desktop'))
    await chips.getByRole('button', { name: 'Remove filter: Device is Desktop' }).click()
    expect((await removed).status()).toBe(200)
    await expect(page).not.toHaveURL(/device%3Ais%3Adesktop/)

    await page.setViewportSize({ width: 375, height: 812 })
    await settle(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
    expect(await undersizedTargets(page)).toEqual([])
  })

  test('@admin one page: the page detail, what readers did there and its Web Vitals', async ({ page }) => {
    await loginAsAdmin(page)
    await openAnalytics(page, `${ANALYTICS}&period=28d&f=${encodeURIComponent('page:is:/about')}`)
    const detail = page.locator('[data-page-detail]')
    await expect(detail).toBeVisible()
    await expect(detail.getByRole('heading', { name: 'About' })).toBeVisible()
    await expect(detail.getByText('/about', { exact: true })).toBeVisible()
    await expect(detail.getByTestId('page-outbound')).toBeVisible()
    await expect(detail.getByText('Web Vitals · p75, 28 days')).toBeVisible()
    await expect(detail.getByRole('link', { name: /View page/ })).toHaveAttribute('href', '/about')
    // The goals follow: matching visitor-days only.
    await expect(page.locator('[data-goals]').getByText(/^Matching: /)).toBeVisible()
    // A post's detail links to its editor (when the store has one).
    const posts = await page.request.get('/api/blog/list')
    const items = posts.ok() ? (((await posts.json()) as { items?: Array<{ slug: string }> }).items ?? []) : []
    if (items.length) {
      await openAnalytics(page, `${ANALYTICS}&f=${encodeURIComponent(`page:is:/blog/${items[0].slug}`)}`)
      await expect(detail.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', `/admin/blog/edit?slug=${encodeURIComponent(items[0].slug)}`)
      await expect(detail.getByTestId('page-read-through')).toBeVisible()
      // …and the editor's ⋯ menu links back here.
      await page.goto(`/admin/blog/edit?slug=${encodeURIComponent(items[0].slug)}`)
      await page.getByRole('button', { name: 'More actions' }).click()
      await expect(page.getByRole('menuitem', { name: /Analytics for this page/ })).toHaveAttribute(
        'href',
        `/admin/dashboard?tab=analytics&f=${encodeURIComponent(`page:is:/blog/${items[0].slug}`)}`,
      )
    }
  })

  test('@admin export: one table as CSV, every table as a zip — the view as shown, never cached', async ({ page }) => {
    await loginAsAdmin(page)
    await openAnalytics(page, `${ANALYTICS}&period=7d`)
    await page.getByRole('button', { name: 'Export' }).click()
    const all = page.getByRole('menuitem', { name: 'All tables (.zip)' })
    await expect(all).toHaveAttribute('href', /\/api\/admin\/analytics\/export\?period=7d.*table=all/)
    await expect(page.getByRole('menuitem', { name: 'Pages' })).toHaveAttribute('download', '')
    await page.keyboard.press('Escape')

    const csv = await download(page, '/api/admin/analytics/export?period=7d&table=pages')
    expect(csv.status).toBe(200)
    expect(csv.type).toBe('text/csv; charset=utf-8')
    expect(csv.cache).toBe('no-store')
    expect(csv.disposition).toMatch(/^attachment; filename="analytics_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}_pages\.csv"$/)
    expect(csv.head.slice(0, 3), 'a UTF-8 byte-order mark').toEqual([0xef, 0xbb, 0xbf])
    expect(csv.text.startsWith('page,title,visitor_days,views\r\n')).toBe(true)
    const zip = await download(page, `/api/admin/analytics/export?period=7d&f=${encodeURIComponent('device:is:desktop')}`)
    expect(zip.status).toBe(200)
    expect(zip.type).toBe('application/zip')
    expect(zip.disposition).toMatch(/_filtered\.zip"$/)
    expect(zip.head.slice(0, 4)).toEqual([0x50, 0x4b, 0x03, 0x04])
  })

  test('@admin the weekly digest card: explains SMTP, or offers the switch and a preview; the switch is restored', async ({ page }) => {
    await loginAsAdmin(page)
    const status = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/admin/analytics/digest')
    await openAnalytics(page)
    const card = page.locator('[data-digest]')
    await card.scrollIntoViewIfNeeded()
    const s = (await (await status).json()) as { smtp: boolean; recipient: string | null; enabled: boolean }
    await expect(card.getByRole('heading', { name: 'Weekly digest' })).toBeVisible()
    if (!s.smtp) {
      await expect(card.getByTestId('digest-setup')).toContainText('SMTP_HOST')
      await expect(card.getByRole('checkbox')).toHaveCount(0)
    } else if (s.recipient) {
      const toggle = card.getByRole('checkbox', { name: 'Send me the weekly digest' })
      await expect(toggle).toBeVisible()
      expect(s.recipient).toMatch(/•••@/)
      const put = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/admin/analytics/digest' && r.request().method() === 'PUT')
      await toggle.click({ force: true })
      expect((await put).status()).toBe(200)
      const back = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/admin/analytics/digest' && r.request().method() === 'PUT')
      await toggle.click({ force: true })
      expect((await back).status()).toBe(200)
      await expect(toggle).toBeChecked({ checked: s.enabled })
    }
  })

  test('@admin accessible: no serious axe violations with a filter and Compare on; the chart is keyboard-readable', async ({ page }) => {
    await loginAsAdmin(page)
    await openAnalytics(page, `${ANALYTICS}&compare=1&f=${encodeURIComponent('device:not:tablet')}`)
    await settle(page)
    const points = page.locator('figure [role="img"][tabindex="0"]')
    if (await points.count()) {
      await points.first().focus()
      await page.keyboard.press('Home')
      await expect(page.locator('figure [role="img"]:focus')).toHaveAttribute('aria-label', /: \d[\d,]* visitors?/)
    }
    // The KPI tabs choose the chart's metric.
    const views = page.getByRole('group', { name: 'Chart metric' }).getByRole('button', { name: /^Views/ })
    await views.click()
    await expect(views).toHaveAttribute('aria-pressed', 'true')
    expect(await seriousA11yViolations(page)).toEqual([])
  })

  test('@admin switching tabs drops the view’s parameters; the analytics endpoints refuse visitors', async ({ page, browser }) => {
    await loginAsAdmin(page)
    await openAnalytics(page, `${ANALYTICS}&period=7d&f=${encodeURIComponent('device:is:mobile')}`)
    await page.getByRole('tab', { name: /^Home/ }).click()
    await expect(page).toHaveURL(/tab=home/)
    expect(new URL(page.url()).searchParams.has('f')).toBe(false)
    expect(new URL(page.url()).searchParams.has('period')).toBe(false)

    const visitor = await browser.newContext()
    try {
      for (const path of ['/api/admin/analytics?period=7d', '/api/admin/analytics/export?table=pages', '/api/admin/analytics/digest']) {
        const res = await visitor.request.get(path)
        expect(res.status(), path).toBe(401)
      }
    } finally {
      await visitor.close()
    }
  })
})
