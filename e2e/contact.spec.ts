import { test, expect, ADMIN, loginAsAdmin } from './fixtures'

/**
 * The contact form end to end: the server-issued human check, a real
 * submission, and the message showing up in the admin Inbox. The CI
 * container has no SMTP, so the message must be stored and flagged
 * "not emailed". Tagged @admin (it signs in and writes to the Inbox), so the
 * post-deploy production run never sends the owner a test message.
 */
test.describe('contact', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test('a message passes the human check and lands in the Inbox, marked not emailed', async ({ page }) => {
    const subject = `E2E contact check ${Date.now()}`
    await page.goto('/contact')

    const form = page.locator('form').filter({ has: page.getByRole('button', { name: /send message/i }) })
    await form.getByRole('textbox', { name: /^name\b/i }).fill('E2E Runner')
    await form.getByRole('textbox', { name: /^email\b/i }).fill('e2e-runner@example.com')
    await form.getByRole('textbox', { name: /^subject\b/i }).fill(subject)
    await form.getByRole('textbox', { name: /^message\b/i }).fill('Automated end-to-end check of the contact form. Please ignore this message.')

    // The sum comes from the server (signed nonce); answer it like a person.
    const question = form.getByText(/What is \d+ \+ \d+\?/)
    await expect(question).toBeVisible()
    const [, a, b] = ((await question.textContent()) || '').match(/(\d+)\s*\+\s*(\d+)/) || []
    expect(a && b, 'challenge numbers').toBeTruthy()
    await form.getByRole('textbox', { name: /human check/i }).fill(String(Number(a) + Number(b)))

    // The server rejects answers given less than 2 s after the nonce was issued.
    await page.waitForTimeout(2500)
    const sent = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/contact' && r.request().method() === 'POST')
    await form.getByRole('button', { name: /send message/i }).click()
    expect((await sent).status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Message sent' })).toBeVisible()

    await loginAsAdmin(page)
    await page.goto('/admin/dashboard?tab=inbox')
    const row = page.getByText(subject).first()
    await expect(row).toBeVisible()
    await row.click()
    await expect(page.getByText('not emailed').first()).toBeVisible()
  })
})
