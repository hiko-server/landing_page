import { test, expect } from './fixtures'

/**
 * Wave 2B review fixes (stream review-fixes-2b):
 *   - CORR-1: every toast follows the one toast policy (lib/notify via
 *     components/Common/UnifiedToast) — an error is an alert and stays until
 *     dismissed — including a toast raised before the toast host has loaded
 *
 * Production-safe without @admin: only GETs and in-page actions.
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
