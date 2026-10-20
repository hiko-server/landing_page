import type { Page } from '@playwright/test'
import { test, expect, settle, seriousA11yViolations, ADMIN, loginAsAdmin } from './fixtures'

/**
 * Stream "admin-ops", H8: the content health center (Admin → System →
 * Content). Every test is @admin and creates its own synthetic, published
 * post ("Example health check post") through the admin API, then deletes it.
 * Nothing here needs the network: the link checker is never started (it would
 * request example.com), so only rules that read the content itself are used —
 * a tracking parameter (with its one-click fix) and a second h1.
 */

async function adminJson(
  page: Page,
  method: string,
  url: string,
  body?: unknown
): Promise<{ status: number; json: any }> {
  return page.evaluate(
    async ([m, u, b]) => {
      const res = await fetch(u as string, {
        method: m as string,
        headers: { 'Content-Type': 'application/json' },
        body: b === undefined ? undefined : JSON.stringify(b),
      })
      return { status: res.status, json: await res.json().catch(() => null) }
    },
    [method, url, body] as const
  )
}

async function createPost(page: Page, slug: string) {
  const created = await adminJson(page, 'PUT', '/api/admin/posts', {
    slug,
    create: true,
    frontmatter: {
      title: 'Example health check post',
      date: new Date().toISOString().slice(0, 10),
      description:
        'Created by the end-to-end suite to exercise the content health center; deleted afterwards.',
    },
    body: '# Example big heading\n\nRead [the example guide](https://example.com/guide?utm_source=e2e&utm_medium=test&id=7).\n',
  })
  expect(created.status, JSON.stringify(created.json)).toBe(200)
}

test.describe('admin-ops: content health', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test('@admin the Content view: summary, filters, j / k, a one-click fix, accessible', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await loginAsAdmin(page)
    const slug = `e2e-health-${Date.now()}`
    await createPost(page, slug)
    try {
      await page.goto('/admin/system?view=content')
      await expect(page.getByRole('tab', { name: 'Content' })).toHaveAttribute(
        'aria-selected',
        'true'
      )

      // Summary: three severity toggles and the link checker.
      for (const name of ['Errors', 'Warnings', 'Notices']) {
        await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toHaveAttribute(
          'aria-pressed',
          'false'
        )
      }
      await expect(page.getByRole('heading', { name: 'External links' })).toBeVisible()

      const list = page.getByTestId('content-health-list')
      const group = list.locator(`section[data-item="blog/${slug}"]`)
      await expect(group.getByRole('heading', { name: 'Example health check post' })).toBeVisible()

      // Filters: only this post, then only tracking parameters.
      await page.getByRole('combobox', { name: 'Show issues in' }).selectOption(`blog/${slug}`)
      await expect(list.locator('section[data-item]')).toHaveCount(1)
      const rows = group.getByRole('listitem')
      await expect(rows).toHaveCount(2)
      await expect(group.locator('[data-check="heading"]')).toContainText('is a second h1')
      await page.getByRole('combobox', { name: 'Show issues of' }).selectOption('tracking')
      await expect(rows).toHaveCount(1)
      await page.getByRole('combobox', { name: 'Show issues of' }).selectOption('')
      await expect(rows).toHaveCount(2)

      // Severity toggle: both of this post's issues are warnings, so "Notices" hides them.
      await page.getByRole('button', { name: /^Notices/ }).click()
      await expect(page.getByRole('button', { name: /^Notices/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
      await expect(page.getByText('Nothing matches these filters')).toBeVisible()
      await page.getByRole('button', { name: /^Notices/ }).click()
      await expect(rows).toHaveCount(2)

      // j / k move through the issues from the page body.
      await page.locator('body').click({ position: { x: 5, y: 5 } })
      await page.keyboard.press('j')
      await expect(page.locator('[data-list-item="0"]')).toBeFocused()
      await page.keyboard.press('j')
      await expect(page.locator('[data-list-item="1"]')).toBeFocused()
      await page.keyboard.press('k')
      await expect(page.locator('[data-list-item="0"]')).toBeFocused()

      await settle(page)
      expect(await seriousA11yViolations(page)).toEqual([])

      // The one-click fix strips the tracking parameters through the editor's save path.
      const fixed = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === '/api/admin/content-health' &&
          r.request().method() === 'POST'
      )
      await group
        .locator('[data-check="tracking"]')
        .getByRole('button', { name: /^Strip tracking/ })
        .click()
      expect((await fixed).status()).toBe(200)
      await expect(page.getByText('Fixed', { exact: true })).toBeVisible()
      await expect(group.locator('[data-check="tracking"]')).toHaveCount(0)
      await expect(group.locator('[data-check="heading"]')).toHaveCount(1)
      const stored = await adminJson(page, 'GET', `/api/admin/posts?slug=${slug}`)
      expect(stored.json.body).toContain('(https://example.com/guide?id=7)')
      expect(stored.json.body).not.toContain('utm_')
    } finally {
      await adminJson(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('@admin the Health view summarises content health and opens the Content view; no overflow on a phone', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/system')
    const card = page.getByTestId('content-health-card')
    await expect(card.getByRole('heading', { name: 'Content health' })).toBeVisible()
    await expect(card).toContainText(/Links:/)
    await card.getByRole('button', { name: 'Open content health' }).click()
    await expect(page).toHaveURL(/\/admin\/system\?view=content$/)
    await expect(
      page.getByTestId('content-health-list').or(page.getByTestId('content-health-empty'))
    ).toBeVisible()

    await page.setViewportSize({ width: 375, height: 812 })
    await settle(page)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
    expect(await seriousA11yViolations(page)).toEqual([])
  })
})
