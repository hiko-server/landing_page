import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { test, expect, settle, ADMIN, loginAsAdmin } from './fixtures'

/**
 * Stream "admin-ops": Inbox 2.0 and unified toasts (H11), the activity log
 * (H13), the keyboard-first admin (H14) and CORR-3 (a non-ASCII job link
 * survives into the Inbox).
 *
 * Every test is @admin: it signs in, sends one contact message through the
 * real form (the CI container has no SMTP, so replies use the "no SMTP"
 * path) and deletes it again.
 */

async function seriousViolationsIn(page: Page, selector: string) {
  const result = await new AxeBuilder({ page }).include(selector).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }))
}

/** Send one structured hiring message through the public form; returns its subject. */
async function sendHiringMessage(page: Page, token: string, roleUrl: string): Promise<string> {
  const subject = `Inbox check ${token}`
  await page.goto('/contact')
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: /send message/i }) })
  await form.getByRole('textbox', { name: /^name\b/i }).fill('Example Recruiter')
  await form.getByRole('textbox', { name: /^email\b/i }).fill('recruiter@example.com')
  await form.getByRole('combobox', { name: /^reason/i }).selectOption('Hiring')
  await form.getByRole('textbox', { name: /^subject\b/i }).fill(subject)
  const role = form.locator('fieldset[data-inquiry="role"]')
  await role.getByRole('textbox', { name: 'Company' }).fill('Example Ltd')
  await role.getByRole('textbox', { name: 'Job posting link' }).fill(roleUrl)
  await form.getByRole('textbox', { name: /^message\b/i }).fill('Automated end-to-end check of the admin Inbox. Please ignore.')
  const question = form.getByText(/What is \d+ \+ \d+\?/)
  await expect(question).toBeVisible()
  const [, a, b] = ((await question.textContent()) || '').match(/(\d+)\s*\+\s*(\d+)/) || []
  await form.getByRole('textbox', { name: /human check/i }).fill(String(Number(a) + Number(b)))
  // The server rejects answers given less than 2 s after the challenge was issued.
  await page.waitForTimeout(2500)
  const sent = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/contact' && r.request().method() === 'POST')
  await form.getByRole('button', { name: /send message/i }).click()
  expect((await sent).status()).toBe(200)
  return subject
}

test.describe('admin-ops: Inbox 2.0', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test('@admin search, kind, star, archive with Undo, reply without SMTP, persistent error toast, delete with Undo', async ({ page }) => {
    test.setTimeout(120_000)
    const token = `ops${Date.now()}`
    // CORR-3: Chinese characters in the link grow when percent-encoded.
    const roleUrl = `https://jobs.example.com/职位/${'前端工程师-香港-全职'.repeat(3)}?ref=${token}`
    const subject = await sendHiringMessage(page, token, roleUrl)

    await loginAsAdmin(page)
    await page.goto('/admin/dashboard?tab=inbox')
    const search = page.getByRole('searchbox', { name: 'Search messages' })
    await search.fill(token)
    const list = page.getByTestId('inbox-list')
    const row = list.locator('[data-message-id]').filter({ hasText: subject })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('Role / hiring')
    await expect(row).toHaveAttribute('data-unread', '')

    // The kind filter and an operator search agree.
    await page.getByRole('combobox', { name: 'Kind of inquiry' }).selectOption('collab')
    await expect(row).toHaveCount(0)
    await page.getByRole('combobox', { name: 'Kind of inquiry' }).selectOption('all')
    await search.fill(`${token} kind:role is:unread`)
    await expect(row).toHaveCount(1)

    // Open: the link kept its Chinese path (CORR-3), the message counts as read
    // (so it leaves the is:unread search).
    await row.locator('[data-list-item]').click()
    const detail = page.getByTestId('inbox-detail')
    await expect(detail.getByRole('heading', { name: subject })).toBeVisible()
    const link = detail.getByRole('region', { name: 'Inquiry details' }).getByRole('link')
    await expect(link).toHaveAttribute('href', new URL(roleUrl).toString())
    await expect(link).toContainText('jobs.example.com/职位/')
    await expect(row).toHaveCount(0)
    await search.fill(token)
    await expect(row).toHaveCount(1)
    await expect(row).not.toHaveAttribute('data-unread', '')

    await settle(page)
    expect(await seriousViolationsIn(page, '[data-testid="inbox-detail"]')).toEqual([])
    expect(await seriousViolationsIn(page, '[data-testid="inbox-list"]')).toEqual([])

    // Star from the toolbar; the row's star follows.
    await detail.getByRole('toolbar', { name: 'Message actions' }).getByRole('button', { name: 'Star', exact: true }).click()
    await expect(row.getByRole('button', { name: /^Unstar the message/ })).toHaveAttribute('aria-pressed', 'true')

    // A failed update (the network drops this one request) keeps its error toast
    // until it is dismissed, and the star comes back.
    await page.evaluate(() => {
      const w = window as unknown as { fetch: typeof fetch; __realFetch?: typeof fetch }
      w.__realFetch = w.fetch
      w.fetch = (input, init) =>
        String(input).includes('/api/admin/inbox') && init?.method === 'POST' ? Promise.reject(new TypeError('Failed to fetch')) : w.__realFetch!(input, init)
    })
    await detail.getByRole('toolbar', { name: 'Message actions' }).getByRole('button', { name: 'Unstar', exact: true }).click()
    const errorToast = page.locator('.chakra-toast[data-toast-status="error"]').filter({ hasText: 'Inbox update failed' })
    await expect(errorToast).toBeVisible()
    await expect(errorToast.getByRole('alert')).toContainText('connection')
    await expect(row.getByRole('button', { name: /^Unstar the message/ })).toHaveAttribute('aria-pressed', 'true')
    await page.waitForTimeout(6500)
    await expect(errorToast).toBeVisible()
    await errorToast.getByRole('button', { name: /close/i }).click()
    await expect(errorToast).toHaveCount(0)
    await page.evaluate(() => {
      const w = window as unknown as { fetch: typeof fetch; __realFetch?: typeof fetch }
      if (w.__realFetch) w.fetch = w.__realFetch
    })

    // Archive by keyboard (e): it leaves the Inbox folder; Undo brings it back.
    await row.locator('[data-list-item]').focus()
    await page.keyboard.press('e')
    await expect(row).toHaveCount(0)
    const undo = page.getByTestId('undo-toast').filter({ hasText: 'Archived' })
    await expect(undo).toBeVisible()
    await undo.getByRole('button', { name: /^Undo/ }).click()
    await expect(row).toHaveCount(1)

    // Reply (r): no SMTP here, so the composer explains the setup and offers the mail app.
    await row.locator('[data-list-item]').focus()
    await page.keyboard.press('r')
    const composer = page.getByTestId('reply-composer')
    await expect(composer).toBeVisible()
    const noSmtp = composer.getByTestId('reply-no-smtp')
    await expect(noSmtp).toContainText('isn’t set up on this server')
    await noSmtp.getByText('Send replies from here').click()
    await expect(noSmtp.getByText('SMTP_HOST')).toBeVisible()
    await expect(noSmtp.getByRole('link', { name: 'Open in mail app' })).toHaveAttribute('href', /^mailto:recruiter%40example\.com\?subject=Re%3A%20Inbox%20check/)
    await expect(composer.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(/^Hi Example,\n\n[\s\S]*Example Recruiter <recruiter@example\.com> wrote:\n> Automated end-to-end check/)
    // The templates dialog lists the placeholders; nothing is saved here.
    await composer.getByRole('button', { name: 'Edit templates' }).click()
    const templates = page.getByRole('dialog', { name: 'Reply templates' })
    await expect(templates.getByRole('button', { name: /Insert \{firstName\}/ })).toBeVisible()
    await templates.getByRole('button', { name: 'Cancel', exact: true }).click()
    await noSmtp.getByRole('button', { name: 'Mark as replied', exact: true }).click()
    await expect(row).toContainText('replied')
    await noSmtp.getByRole('button', { name: 'Close', exact: true }).click()

    // Delete (#) with Undo, then for good.
    await row.locator('[data-list-item]').focus()
    await page.keyboard.press('#')
    await expect(row).toHaveCount(0)
    const deleted = page.getByTestId('undo-toast').filter({ hasText: 'Message deleted' })
    await deleted.getByRole('button', { name: /^Undo/ }).click()
    await expect(row).toHaveCount(1)
    await expect(deleted).toHaveCount(0)
    // Undo reopens it.
    await expect(detail.getByRole('heading', { name: subject })).toBeVisible()
    await detail.getByRole('toolbar', { name: 'Message actions' }).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(row).toHaveCount(0)
    const sent = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/admin/inbox' && r.request().method() === 'POST' && /"delete"/.test(r.request().postData() || ''))
    await page.getByTestId('undo-toast').filter({ hasText: 'Message deleted' }).getByRole('button', { name: 'Dismiss' }).click()
    expect((await sent).status()).toBe(200)
    await page.reload()
    // Gone after a reload: the search finds nothing — or, when it was the only message, the Inbox is empty.
    const searchAgain = page.getByRole('searchbox', { name: 'Search messages' })
    await expect(searchAgain.or(page.getByText('No messages yet'))).toBeVisible()
    if (await searchAgain.isVisible()) {
      await searchAgain.fill(token)
      await expect(page.getByTestId('inbox-list').locator('[data-message-id]')).toHaveCount(0)
    }

    // H13: the activity log names what happened, without the visitor's address.
    await page.goto('/admin/system?view=activity')
    const activity = page.getByTestId('activity-list')
    await expect(activity).toContainText('Starred 1 message')
    await expect(activity).toContainText('Archived 1 message')
    await expect(activity).toContainText('Marked 1 message as replied')
    await expect(activity).toContainText('Deleted 1 message')
    await expect(activity).not.toContainText('recruiter@example.com')
  })
})

test.describe('admin-ops: keyboard-first admin', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test('@admin G chords, the searchable shortcut sheet, j / k in lists and admin commands in ⌘K', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/dashboard?tab=inbox')
    await expect(page.getByRole('searchbox', { name: 'Search messages' }).or(page.getByText('No messages yet'))).toBeVisible()
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())

    // "?" opens the sheet; its search filters.
    await page.keyboard.press('?')
    const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
    await expect(sheet).toBeVisible()
    await page.keyboard.type('archive')
    await expect(sheet).toContainText('Archive (or move back to the inbox)')
    await expect(sheet).not.toContainText('Switch dashboard tab')
    await settle(page)
    expect(await seriousViolationsIn(page, '.chakra-modal__content')).toEqual([])
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()

    // G then S → System; G then L → the activity log; G then P → posts.
    await page.keyboard.press('g')
    await page.keyboard.press('s')
    await expect(page).toHaveURL(/\/admin\/system$/)
    await page.keyboard.press('g')
    await page.keyboard.press('l')
    await expect(page).toHaveURL(/\/admin\/system\?view=activity$/)
    await page.keyboard.press('g')
    await page.keyboard.press('p')
    await expect(page).toHaveURL(/\/admin\/blog$/)

    // j / k move through the posts list (when there are posts).
    const rows = page.locator('tbody [data-list-item]')
    if ((await rows.count()) > 1) {
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
      await page.keyboard.press('j')
      await expect(rows.nth(0)).toBeFocused()
      await page.keyboard.press('j')
      await expect(rows.nth(1)).toBeFocused()
      await page.keyboard.press('k')
      await expect(rows.nth(0)).toBeFocused()
    }

    // ⌘K lists the admin destinations with their G keys.
    await page.keyboard.press('ControlOrMeta+k')
    const palette = page.getByRole('dialog').filter({ has: page.getByRole('combobox') })
    await expect(palette).toBeVisible()
    await page.keyboard.type('content health')
    const option = palette.getByRole('option', { name: /Content health/ }).first()
    await expect(option).toBeVisible()
    await option.click()
    await expect(page).toHaveURL(/\/admin\/system\?view=content$/)

    // With single-key shortcuts off, G chords do nothing.
    await page.evaluate(() => localStorage.setItem('kbd:shortcuts:v1', 'off'))
    await page.reload()
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('g')
    await page.keyboard.press('s')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/admin\/system\?view=content$/)
    await page.evaluate(() => localStorage.removeItem('kbd:shortcuts:v1'))
  })
})
