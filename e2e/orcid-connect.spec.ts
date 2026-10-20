import type { Page } from '@playwright/test'
import { test, expect, ADMIN, loginAsAdmin, seriousA11yViolations, settle } from './fixtures'

/**
 * "Connect your ORCID iD" (stream "orcid-connect"). The suite never talks to
 * orcid.org: the end-to-end server runs without ORCID credentials, so these
 * tests check what the owner sees until the credentials are added — the
 * button disabled with its reason and the set-up guide, and the connect
 * route sending the browser back with a clear toast — and the callback's
 * error paths, arriving the way a browser comes back from ORCID: a
 * CROSS-SITE navigation (from the other loopback name), which does not carry
 * the SameSite=Strict session cookie. The Studio must still open signed in
 * (the callback answers a same-origin page that moves on) and say what went
 * wrong. The flow itself (state, session binding, token exchange against a
 * fake ORCID, the stored marker) is unit-tested in tests/orcid-connect*.
 */

test.describe('Connect your ORCID iD', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')
  test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 })

  const setup = async (page: Page) =>
    page.evaluate(async () => {
      const res = await fetch('/api/admin/orcid/connection', { cache: 'no-store' })
      return { status: res.status, body: (await res.json()) as { configured: boolean; env: string; redirectUri: string | null } }
    })

  const openPersonalInfo = async (page: Page) => {
    await page.goto('/admin/dashboard?tab=cv')
    const sections = page.getByRole('navigation', { name: 'CV sections' })
    await expect(sections).toBeVisible()
    await sections.getByText('Personal Info', { exact: true }).first().click()
  }

  test('without ORCID credentials the button is disabled and says why, with the set-up guide; connecting goes straight back with a toast', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await loginAsAdmin(page)
    const s = await setup(page)
    expect(s.status).toBe(200)
    test.skip(s.body.configured, 'this server has ORCID credentials')
    expect(JSON.stringify(s.body)).not.toMatch(/secret/i)
    expect(s.body.redirectUri).toMatch(/\/api\/admin\/orcid\/callback$/)

    await openPersonalInfo(page)
    const button = page.getByRole('button', { name: 'Connect your ORCID iD' })
    await expect(button).toBeVisible()
    await expect(button).toBeDisabled()
    const status = page.getByTestId('orcid-connect-status')
    await expect(status).toHaveAttribute('data-state', 'unconfigured')
    await expect(status).toContainText('Connecting needs ORCID API credentials on the server (ORCID_CLIENT_ID, ORCID_CLIENT_SECRET).')
    // The button's description is that line.
    const describedBy = await button.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    await expect(page.locator(`[id="${describedBy}"]`)).toContainText('ORCID_CLIENT_ID')
    const guide = status.getByRole('link', { name: /Set-up guide/ })
    await expect(guide).toHaveAttribute('href', /#connect-your-orcid-id$/)
    await expect(guide).toHaveAttribute('target', '_blank')
    await settle(page)
    expect(await seriousA11yViolations(page)).toEqual([])

    // Someone opens the connect route anyway: back to the Studio, nothing changed, a toast says why.
    await page.goto('/api/admin/orcid/connect')
    await expect(page).toHaveURL(/\/admin\/dashboard\?tab=cv$/)
    await expect(page.getByText('ORCID is not set up on the server')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'ORCID iD', exact: true })).toBeFocused()
  })

  test('callback error paths: a link back from ORCID that does not match this browser’s flow opens the Studio signed in, with the error', async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await loginAsAdmin(page)
    const site = new URL(baseURL || page.url())
    // The other loopback name is another site: navigating from there is cross-site, like coming back from orcid.org.
    const elsewhere = new URL(site.toString())
    elsewhere.hostname = site.hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1'
    const comeBack = async (query: string) => {
      await page.goto(new URL('/api/health', elsewhere).toString())
      const target = new URL(`/api/admin/orcid/callback?${query}`, site).toString()
      await Promise.all([page.waitForURL(/\/admin\/dashboard\?tab=cv$/), page.evaluate((u) => window.location.assign(u), target)])
    }

    // A state this browser never issued (no flow cookie).
    await comeBack(`code=synthetic-code&state=${'x'.repeat(43)}`)
    await expect(page.getByRole('navigation', { name: 'CV sections' }), 'the Studio, signed in — not the sign-in form').toBeVisible()
    await expect(page.getByText('This ORCID sign-in could not be matched')).toBeVisible()
    await expect(page.getByText(/already used or does not belong to this browser/)).toBeVisible()
    // The address no longer carries the outcome (a reload does not repeat it), and the iD field is in view.
    expect(new URL(page.url()).search).toBe('?tab=cv')
    await expect(page.getByRole('textbox', { name: 'ORCID iD', exact: true })).toBeFocused()

    // ORCID's "cancelled" answer without a flow of this browser is not believed either.
    await comeBack('error=access_denied&error_description=User%20denied%20access&state=nope')
    await expect(page.getByText('This ORCID sign-in could not be matched')).toBeVisible()

    // Nothing at all.
    await comeBack('')
    await expect(page.getByText('This ORCID sign-in could not be matched')).toBeVisible()
  })

  test('only GET of the callback passes without a session; a signed-out visitor who follows it lands on the sign-in form', async ({ page, request, baseURL }) => {
    const origin = new URL(baseURL || 'http://127.0.0.1:3000').origin
    const post = await request.post('/api/admin/orcid/callback', { data: {}, headers: { origin } })
    expect(post.status(), 'any other method stays behind the admin gate').toBe(401)
    const res = await request.get('/api/admin/orcid/callback?state=x&code=y')
    expect(res.status()).toBe(200)
    expect(res.headers()['cache-control']).toContain('no-store')
    const html = await res.text()
    expect(html).toContain('http-equiv="refresh"')
    expect(html).toContain('/admin/dashboard?tab=cv&amp;orcid=error&amp;reason=state')
    expect(html).not.toMatch(/<script/i)
    await page.goto('/api/admin/orcid/callback?state=x&code=y')
    await expect(page).toHaveURL(/\/admin\/login\?next=/)
  })
})
