import { devices, type Page } from '@playwright/test'
import { test, expect, ADMIN, loginAsAdmin } from './fixtures'

/**
 * Wave 2B review fixes (stream review-fixes-2b):
 *   - CORR-1: every toast follows the one toast policy (lib/notify via
 *     components/Common/UnifiedToast) — an error is an alert and stays until
 *     dismissed — including a toast raised before the toast host has loaded
 *   - CORR-2: on a touch screen (no hover), a keyboard still opens the hints
 *     whose :focus-visible rule shares a selector list with :hover
 *   - @admin CORR-4: after a slug rename, the old Markdown twin address
 *     answers 308 to the new one, like the HTML page
 *
 * Production-safe without @admin: only GETs and in-page actions. The @admin
 * test creates its own synthetic post and deletes it afterwards.
 */

const chromiumOnly = (project: string) => project !== 'chromium'

test.describe('one toast policy (CORR-1)', () => {
  test('an error raised before the toast host has loaded appears once, as an alert, and stays until closed', async ({ page }, testInfo) => {
    test.skip(chromiumOnly(testInfo.project.name), 'once is enough')
    // The clipboard refuses, so "Copy page link" raises an error toast; every
    // toast frame that ever enters the page is recorded.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } })
      document.execCommand = () => false
      const seen: Array<{ status: string | null; role: string | null }> = []
      ;(window as unknown as { __toasts: typeof seen }).__toasts = seen
      new MutationObserver((records) => {
        for (const r of records)
          for (const n of Array.from(r.addedNodes)) {
            if (!(n instanceof HTMLElement)) continue
            for (const el of [n, ...Array.from(n.querySelectorAll('.chakra-toast'))]) {
              if (!el.classList.contains('chakra-toast')) continue
              seen.push({ status: el.getAttribute('data-toast-status'), role: el.querySelector('.chakra-toast__inner')?.getAttribute('role') ?? null })
            }
          }
      }).observe(document, { childList: true, subtree: true })
    })
    // Hold back the chunk with the toast host (and its frame) until the toast is raised.
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    let held = false
    await page.route(/\/_next\/static\/chunks\/.+\.js(\?.*)?$/, async (route) => {
      const response = await route.fetch()
      const body = await response.text()
      if (body.includes('data-toast-persistent')) {
        held = true
        await gate
      }
      await route.fulfill({ response, body })
    })

    await page.goto('/cv')
    await page.keyboard.press('ControlOrMeta+KeyK')
    await page.getByRole('combobox', { name: /search/i }).fill('copy link')
    await page.getByRole('option').first().click()
    // Raised, but no host yet: nothing on screen, and nothing lost.
    await page.waitForTimeout(500)
    await expect(page.locator('.chakra-toast')).toHaveCount(0)
    release()

    const alert = page.locator('#chakra-toast-manager-bottom .chakra-toast [role="alert"]')
    await expect(alert).toBeVisible()
    await expect(alert).toContainText('Copy failed')
    expect(held, 'the host chunk was held back until the toast was raised').toBe(true)
    // Chakra's stock frame dismissed every toast after 5 s; an error stays.
    await page.mouse.move(5, 5)
    await page.waitForTimeout(6_500)
    await expect(alert).toBeVisible()
    await expect(page.locator('.chakra-toast')).toHaveCount(1)
    const seen = await page.evaluate(() => (window as unknown as { __toasts: Array<{ status: string | null; role: string | null }> }).__toasts)
    expect(seen, 'the toast entered the page once, already in the unified frame').toEqual([{ status: 'error', role: 'alert' }])

    await alert.getByRole('button', { name: /close/i }).click()
    await expect(page.locator('.chakra-toast')).toHaveCount(0)
  })
})

test.describe('focus reveals on touch screens (CORR-2)', () => {
  test('a keyboard on a phone opens the hint of a focused link (its rule shares a list with :hover)', async ({ browser, baseURL }, testInfo) => {
    test.skip(chromiumOnly(testInfo.project.name), 'emulates its own phone')
    const context = await browser.newContext({ ...devices['Pixel 7'], baseURL })
    try {
      const page = await context.newPage()
      await page.goto('/')
      expect(await page.evaluate(() => matchMedia('(hover: hover)').matches), 'a device without hover').toBe(false)
      // Tab to the first control whose hint follows it (Hint.tsx: `& > :focus-visible ~ .hint`).
      let found = false
      for (let i = 0; i < 60 && !found; i++) {
        await page.keyboard.press('Tab')
        found = await page.evaluate(() => {
          const el = document.activeElement
          return !!el && !!el.parentElement?.querySelector(':scope > .hint') && el.matches(':focus-visible')
        })
      }
      expect(found, 'a hinted control is reachable by Tab').toBe(true)
      await expect
        .poll(() =>
          page.evaluate(() => {
            const hint = document.activeElement?.parentElement?.querySelector(':scope > .hint')
            return hint ? getComputedStyle(hint).display : 'missing'
          }),
        )
        .toBe('block')
    } finally {
      await context.close()
    }
  })
})

const adminFetch = (page: Page, method: string, url: string, body?: unknown) =>
  page.evaluate(
    async ([m, u, b]) => {
      const res = await fetch(u as string, { method: m as string, headers: { 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) })
      return { status: res.status, text: await res.text() }
    },
    [method, url, body] as const,
  )

test.describe('renamed Markdown twins (CORR-4)', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test('after a slug rename the old .md address answers 308 to the new twin, like the page @admin', async ({ page }) => {
    await loginAsAdmin(page)
    const stamp = Date.now()
    const from = `e2e-twin-${stamp}`
    const to = `e2e-twin-moved-${stamp}`
    const created = await adminFetch(page, 'PUT', '/api/admin/posts', {
      slug: from,
      create: true,
      frontmatter: { title: 'E2E twin rename', date: new Date().toISOString().slice(0, 10), description: 'Created by the review-fixes-2b end-to-end suite; deleted afterwards.' },
      body: 'The post whose Markdown twin moves.\n',
    })
    expect(created.status, created.text).toBe(200)
    try {
      expect((await page.request.get(`/blog/${from}.md`)).status()).toBe(200)
      const renamed = await adminFetch(page, 'POST', '/api/admin/posts', { action: 'rename', slug: from, to, redirect: true })
      expect(renamed.status, renamed.text).toBe(200)

      const html = await page.request.get(`/blog/${from}`, { maxRedirects: 0 })
      expect(html.status()).toBe(308)
      expect(html.headers()['location']).toBe(`/blog/${to}`)
      const twin = await page.request.get(`/blog/${from}.md`, { maxRedirects: 0 })
      expect(twin.status()).toBe(308)
      expect(twin.headers()['location']).toBe(`/blog/${to}.md`)
      const followed = await page.request.get(`/blog/${from}.md`)
      expect(followed.status()).toBe(200)
      expect(await followed.text()).toMatch(/^# E2E twin rename/)
    } finally {
      await page.request.fetch('/api/admin/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, data: JSON.stringify({ action: 'remove-redirect', slug: to, from }) }).catch(() => undefined)
      await page.request.fetch(`/api/admin/posts?slug=${to}`, { method: 'DELETE' }).catch(() => undefined)
      await page.request.fetch(`/api/admin/posts?slug=${from}`, { method: 'DELETE' }).catch(() => undefined)
    }
  })
})
