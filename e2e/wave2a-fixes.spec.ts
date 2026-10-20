import { test, expect, loginAsAdmin, seriousA11yViolations, settle } from './fixtures'

/**
 * Wave 2A review fixes (stream wave2a-fixes), desktop project:
 *   - OPS-1: Cloudflare keeps an HTML page at most 5 minutes whatever its ISR
 *     window, and the page names its build where scripts/deploy.sh looks
 *   - @admin SECU-2: a failed sign-in is counted in the Security page's
 *     "Failed attempts" summary and never listed in the history
 *   - @admin SECU-3: the session list's copy and controls
 *
 * Production-safe without @admin: only GETs.
 */

const isLocal = (url: string) => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)

test.describe('edge cache of HTML (OPS-1)', () => {
  test('a page with an hour-long ISR window stays at most 5 minutes at the edge; the CV keeps its own minute', async ({
    request,
  }) => {
    // The first request after a start may get the build-time copy (1 s window);
    // its regeneration carries the real one.
    await expect
      .poll(async () => (await request.get('/')).headers()['cloudflare-cdn-cache-control'] ?? '', {
        timeout: 20_000,
      })
      .toBe('max-age=300, stale-if-error=86400')
    const home = await request.get('/')
    expect(home.headers()['cache-control']).toMatch(/s-maxage=3600\b/)
    expect(home.headers()['cache-control']).toContain('no-transform')

    const colophon = await request.get('/colophon')
    expect(colophon.headers()['cloudflare-cdn-cache-control']).toBe(
      'max-age=300, stale-if-error=86400'
    )
    await expect
      .poll(async () => (await request.get('/cv')).headers()['cache-control'] ?? '', {
        timeout: 20_000,
      })
      .toMatch(/s-maxage=60\b/)
    expect((await request.get('/cv')).headers()['cloudflare-cdn-cache-control']).toBeUndefined()
    // Never on API responses.
    expect(
      (await request.get('/api/stack')).headers()['cloudflare-cdn-cache-control']
    ).toBeUndefined()
  })

  test('the home page HTML references its build manifest under the build id the deploy check compares', async ({
    page,
  }) => {
    await page.goto('/')
    const html = await page.content()
    const fromScript = html.match(/\/_next\/static\/([A-Za-z0-9_-]+)\/_buildManifest\.js/)?.[1]
    const fromData = await page.evaluate(
      () => (window as unknown as { __NEXT_DATA__?: { buildId?: string } }).__NEXT_DATA__?.buildId
    )
    expect(fromScript).toBeTruthy()
    expect(fromScript).toBe(fromData)
  })
})

test.describe('admin security fixes', { tag: '@admin' }, () => {
  test('a failed sign-in is counted under "Failed attempts", never listed in the history (SECU-2)', async ({
    page,
    playwright,
    baseURL,
  }) => {
    test.skip(!isLocal(baseURL || ''), 'files a failed sign-in: local builds only')
    // A passkey sign-in needs a host name: the same server through `localhost`,
    // from a non-browser client (no cookie, no Origin), like any script.
    const local = new URL(baseURL as string)
    local.hostname = 'localhost'
    const anon = await playwright.request.newContext({ baseURL: local.origin })
    try {
      const res = await anon.post('/api/auth/passkey/verify', {
        data: { response: { id: 'x', rawId: 'x', type: 'public-key', response: {} } },
      })
      expect(res.status()).toBe(401)
    } finally {
      await anon.dispose()
    }

    await loginAsAdmin(page)
    await page.goto('/admin/security')
    const failures = page.getByRole('region', { name: 'Failed attempts' })
    await expect(failures).toBeVisible()
    await expect(failures.getByText(/\bpasskey sign-ins?\b/)).toBeVisible()
    const day = failures
      .locator('dt', { hasText: '24 hours' })
      .locator('xpath=following-sibling::dd[1]')
    expect(Number((await day.textContent())?.replace(/,/g, ''))).toBeGreaterThanOrEqual(1)

    const history = page.getByRole('list', { name: /Sign-in history/ })
    await expect(history).toBeVisible()
    await expect(history.getByText('Failed sign-in')).toHaveCount(0)
    await expect(page.getByText(/Failed attempts are only counted/)).toBeVisible()
    await settle(page)
    expect(await seriousA11yViolations(page)).toEqual([])
  })

  test('the signed-in browsers section explains how sign-outs work (SECU-3)', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/security')
    const overview = await page.evaluate(async () => {
      const res = await fetch('/api/admin/security', { cache: 'no-store' })
      return (await res.json()) as {
        legacySessions: boolean
        sessions: Array<{ current: boolean }>
      }
    })
    expect(typeof overview.legacySessions).toBe('boolean')
    await expect(page.getByText(/Every browser signed in to the admin\./)).toBeVisible()
    const others = page.getByRole('button', { name: 'Sign out other browsers' })
    if (overview.legacySessions) {
      await expect(page.getByText(/Browsers signed in before the passkey update/)).toBeVisible()
      await expect(others).toBeEnabled()
    } else {
      await expect(page.getByText(/Browsers signed in before the passkey update/)).toHaveCount(0)
      const anyOther = overview.sessions.some((s) => !s.current)
      await (anyOther ? expect(others).toBeEnabled() : expect(others).toBeDisabled())
    }
  })
})
