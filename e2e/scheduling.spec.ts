import { test, expect, ADMIN, adminCleanup, loginAsAdmin, seriousA11yViolations } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * scheduling (wave 3, H5): scheduled publishing and review links.
 *
 *   - the editor schedules a draft in Hong Kong time (quick picks, both time
 *     zones on a device elsewhere), the banner / badge / list / overview
 *     show it, and it can be unscheduled;
 *   - the server publishes on time with no browser involved — a draft post
 *     and the scheduled changes of a live case study — and the activity log
 *     names the scheduler;
 *   - a review link shows a draft read-only to a visitor (watermark,
 *     private / no-store / noindex / no-referrer), and stops working when
 *     turned off.
 *
 * Every test creates its own synthetic content and deletes it afterwards.
 * Admin-only: needs ADMIN_EMAIL / ADMIN_PASS.
 */

const adminFetch = (page: Page, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  page.evaluate(
    async ([m, u, b, h]) => {
      const res = await fetch(u as string, {
        method: m as string,
        headers: { 'Content-Type': 'application/json', ...(h as Record<string, string>) },
        body: b === undefined ? undefined : JSON.stringify(b),
      })
      return { status: res.status, text: await res.text(), etag: res.headers.get('ETag') }
    },
    [method, url, body, headers] as const,
  )

const today = () => new Date().toISOString().slice(0, 10)

async function createPost(page: Page, slug: string, frontmatter: Record<string, unknown>, body: string) {
  const out = await adminFetch(page, 'PUT', '/api/admin/posts', {
    slug,
    create: true,
    frontmatter: { date: today(), description: 'Created by the scheduling end-to-end suite; deleted afterwards.', ...frontmatter },
    body,
  })
  expect(out.status, out.text).toBe(200)
  return out
}

/** Case studies spread the suite's writes over two routes (each allows 30 writes per 10 minutes). */
async function createCaseStudy(page: Page, slug: string, frontmatter: Record<string, unknown>, body: string) {
  const out = await adminFetch(page, 'PUT', '/api/admin/work', {
    slug,
    create: true,
    frontmatter: { description: 'Created by the scheduling end-to-end suite; deleted afterwards.', ...frontmatter },
    body,
  })
  expect(out.status, out.text).toBe(200)
  return out
}

test.describe('scheduling', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test('a draft is scheduled from the editor in Hong Kong time, shown everywhere, and unscheduled @admin', async ({ page }) => {
    await loginAsAdmin(page)
    const slug = `e2e-schedule-${Date.now()}`
    await createPost(page, slug, { title: 'E2E scheduled draft', draft: true }, 'A draft that the end-to-end suite schedules.\n')
    try {
      await page.goto(`/admin/blog/edit?slug=${slug}`)
      await page.getByRole('button', { name: 'Publish…' }).click()
      const sheet = page.getByRole('dialog')
      await expect(sheet.getByRole('button', { name: 'Schedule…' })).toBeEnabled()
      await sheet.getByRole('button', { name: 'Schedule…' }).click()

      const dialog = page.getByTestId('schedule-dialog')
      await expect(dialog).toBeVisible()
      await expect(page.getByRole('dialog', { name: 'Schedule this post' })).toBeVisible()
      await dialog.getByRole('button', { name: /^Tomorrow morning/ }).click()
      await expect(dialog.getByRole('button', { name: /^Tomorrow morning/ })).toHaveAttribute('aria-pressed', 'true')
      await expect(dialog.getByRole('group', { name: 'Publish' }).getByLabel(/^Time \(HKT\)/)).toHaveValue('09:00')
      await expect(dialog.getByTestId('schedule-publish-when')).toContainText(/Goes live \w{3} \d+ \w{3} \d{4}, 09:00 HKT/)
      // The browser is in Hong Kong here: one zone, no zone picker.
      await expect(dialog.getByLabel('Time zone')).toHaveCount(0)
      expect(await seriousA11yViolations(page)).toEqual([])

      const scheduled = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/admin/posts' && r.request().method() === 'POST')
      await dialog.getByRole('button', { name: 'Schedule', exact: true }).click()
      const res = await scheduled
      expect(res.status()).toBe(200)
      const sent = JSON.parse(res.request().postData() || '{}')
      expect(sent.action).toBe('schedule')
      expect(sent.publishAt).toMatch(/T01:00:00\.000Z$/)
      await expect(dialog).toBeHidden()
      const banner = page.getByTestId('schedule-banner')
      await expect(banner).toContainText(/Publishes \w{3} \d+ \w{3} \d{4}, 09:00 HKT/)
      await expect(page.getByTestId('schedule-badge')).toHaveText('scheduled')

      // Still scheduled after a reload; the list and the overview show it.
      await page.reload()
      await expect(page.getByTestId('schedule-banner')).toBeVisible()
      await page.goto('/admin/blog')
      await expect(page.getByRole('row').filter({ hasText: slug }).getByTestId('schedule-list-badge')).toContainText('Publishes')
      await page.goto('/admin/publishing')
      await expect(page.getByTestId('schedule-list')).toContainText('E2E scheduled draft')
      await expect(page.getByTestId('scheduler-status')).toContainText('Scheduler running')

      // Unschedule takes a second, deliberate click.
      await page.goto(`/admin/blog/edit?slug=${slug}`)
      const again = page.getByTestId('schedule-banner')
      await again.getByRole('button', { name: 'Unschedule' }).click()
      await again.getByRole('button', { name: 'Confirm — unschedule' }).click()
      await expect(page.getByTestId('schedule-banner')).toHaveCount(0)
      await expect(page.getByTestId('schedule-badge')).toHaveCount(0)
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('on a device in another time zone the dialog shows both zones and can switch @admin', async ({ page, browser }) => {
    await loginAsAdmin(page)
    const slug = `e2e-zones-${Date.now()}`
    await createCaseStudy(page, slug, { title: 'E2E zones', draft: true }, 'Zones.\n')
    const london = await browser.newContext({ timezoneId: 'Europe/London', locale: 'en-GB', baseURL: new URL(page.url()).origin })
    try {
      await london.addCookies(await page.context().cookies())
      const p = await london.newPage()
      await p.goto(`/admin/work/edit?slug=${slug}`)
      await p.getByRole('button', { name: 'More actions' }).click()
      await p.getByRole('menuitem', { name: 'Schedule…' }).click()
      const dialog = p.getByTestId('schedule-dialog')
      await expect(dialog.getByTestId('schedule-publish-when')).toContainText(/09:00 HKT · .*London/)
      await dialog.getByLabel('Time zone').selectOption('Europe/London')
      const publish = dialog.getByRole('group', { name: 'Publish' })
      await expect(publish.getByLabel(/^Time \(London/)).not.toHaveValue('09:00')
      await expect(dialog.getByTestId('schedule-publish-when')).toContainText('09:00 HKT')
    } finally {
      await london.close()
      await adminCleanup(page, 'DELETE', `/api/admin/work?slug=${slug}`)
    }
  })

  test('the server publishes a scheduled draft and scheduled changes on time, and the log names the scheduler @admin', async ({ page, browser }) => {
    test.setTimeout(150_000)
    await loginAsAdmin(page)
    const stamp = Date.now()
    const draftSlug = `e2e-due-${stamp}`
    const liveSlug = `e2e-due-live-${stamp}`
    await createPost(page, draftSlug, { title: 'E2E due draft', draft: true }, 'Published by the scheduler.\n')
    await createCaseStudy(page, liveSlug, { title: 'E2E live case study' }, 'The live words.\n')
    try {
      const live = await adminFetch(page, 'GET', `/api/admin/work?slug=${liveSlug}`)
      const liveFm = JSON.parse(live.text).frontmatter
      const pend = await adminFetch(page, 'PUT', '/api/admin/work', { slug: liveSlug, frontmatter: liveFm, body: 'The scheduled words.\n', target: 'pending' }, { 'If-Match': live.etag || '' })
      expect(pend.status, pend.text).toBe(200)

      const at = new Date(Date.now() + 20_000).toISOString()
      const d = await adminFetch(page, 'POST', '/api/admin/posts', { action: 'schedule', slug: draftSlug, publishAt: at })
      expect(d.status, d.text).toBe(200)
      const c = await adminFetch(page, 'POST', '/api/admin/work', { action: 'schedule', slug: liveSlug, publishAt: at }, { 'If-Match': JSON.parse(pend.text).etag })
      expect(c.status, c.text).toBe(200)

      const visitor = await browser.newContext()
      try {
        expect((await visitor.request.get(`/blog/${draftSlug}`)).status()).toBe(404)
        // No browser is involved from here: the server does it at the time.
        await expect
          .poll(async () => (await visitor.request.get(`/blog/${draftSlug}`)).status(), { timeout: 90_000, intervals: [2_000] })
          .toBe(200)
        await expect.poll(async () => (await visitor.request.get(`/work/${liveSlug}`)).text(), { timeout: 30_000, intervals: [1_000] }).toContain('The scheduled words.')
      } finally {
        await visitor.close()
      }
      const after = JSON.parse((await adminFetch(page, 'GET', `/api/admin/work?slug=${liveSlug}`)).text)
      expect(after.pending).toBeNull()
      expect(after.schedule.publishAt).toBeNull()

      const activity = JSON.parse((await adminFetch(page, 'GET', '/api/admin/activity?q=Scheduler')).text)
      const entry = activity.items.find((i: { summary: string }) => i.summary === 'Published post “E2E due draft” on schedule')
      expect(entry, JSON.stringify(activity.items.slice(0, 5))).toBeTruthy()
      expect(entry.device).toBe('Scheduler')
      expect(activity.items.some((i: { summary: string }) => i.summary.startsWith('Published the scheduled changes to case study “E2E live case study”'))).toBe(true)
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${draftSlug}`)
      await adminCleanup(page, 'DELETE', `/api/admin/work?slug=${liveSlug}`)
    }
  })

  test('a review link shows the draft read-only to a visitor, privately, until it is turned off @admin', async ({ page, browser }) => {
    await loginAsAdmin(page)
    const slug = `e2e-review-${Date.now()}`
    await createPost(page, slug, { title: 'E2E draft under review', draft: true }, 'A paragraph only reviewers can read.\n')
    try {
      await page.goto(`/admin/blog/edit?slug=${slug}`)
      await page.getByRole('button', { name: 'More actions' }).click()
      await page.getByRole('menuitem', { name: 'Share for review…' }).click()
      const dialog = page.getByTestId('review-links-dialog')
      await dialog.getByLabel('Expires after').selectOption('24')
      await dialog.getByLabel(/^Note/).fill('Example reviewer')
      await dialog.getByRole('button', { name: 'Create & copy link' }).click()
      const row = dialog.getByTestId('review-link').first()
      await expect(row).toContainText('Example reviewer')
      await expect(row).toContainText(/Expires in 2[34] h/)
      const url = (await row.getByTestId('review-link-url').textContent()) || ''
      expect(url).toMatch(/\/review\/[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{32}$/)
      expect(await seriousA11yViolations(page)).toEqual([])

      const visitor = await browser.newContext()
      try {
        const res = await visitor.request.get(url)
        expect(res.status()).toBe(200)
        const h = res.headers()
        expect(h['cache-control']).toContain('no-store')
        expect(h['x-robots-tag']).toContain('noindex')
        expect(h['referrer-policy']).toBe('no-referrer')
        const vp = await visitor.newPage()
        await vp.goto(url)
        await expect(vp.getByRole('heading', { level: 1, name: 'E2E draft under review' })).toBeVisible()
        await expect(vp.locator('article, main').first()).toContainText('A paragraph only reviewers can read.')
        await expect(vp.getByTestId('review-watermark')).toBeAttached()
        await expect(vp.getByRole('region', { name: 'Preview of unpublished writing' })).toContainText('Not published — shared privately for review.')
        await expect(vp.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
        expect(await seriousA11yViolations(vp)).toEqual([])
        // The public address still does not exist.
        expect((await visitor.request.get(`/blog/${slug}`)).status()).toBe(404)
      } finally {
        await visitor.close()
      }

      await row.getByRole('button', { name: /^Turn off/ }).click()
      await row.getByRole('button', { name: 'Confirm: turn this review link off' }).click()
      await expect(dialog.getByTestId('review-link').first()).toHaveAttribute('data-status', 'revoked')

      const after = await browser.newContext({ extraHTTPHeaders: { 'Accept-Language': 'en' } })
      try {
        const off = await after.request.get(url)
        expect(off.status()).toBe(410)
        const text = await off.text()
        expect(text).toContain('This review link was turned off')
        expect(text).not.toContain('E2E draft under review')
        expect((await after.request.get('/review/not-a-real-token')).status()).toBe(404)
      } finally {
        await after.close()
      }
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })
})
