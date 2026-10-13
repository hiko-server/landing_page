import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test as base, type Page } from '@playwright/test'
import { test, expect, ADMIN, loginAsAdmin, seriousA11yViolations, settle } from './fixtures'

/**
 * Security & reliability foundation (stream security-a), desktop project:
 *   - social cards: fixed cards by id, signed article cards, free text refused
 *   - first-party error monitoring: CSP report-uri, the browser reporter
 *   - @admin: passkeys (a CDP virtual authenticator), sign-in with a passkey,
 *     sessions and history, the step-up dialog, the System page and restore
 *     drill.
 *
 * Production-safe without @admin: only GETs, except the error-report tests,
 * which run against a local build only (they would file reports in the
 * production error monitor).
 */

const isLocal = (url: string) => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)
/** WebAuthn needs a host name (an IP has no RP ID): the same server through `localhost`. */
const localhostOf = (url: string) => {
  const u = new URL(url)
  u.hostname = 'localhost'
  return u.origin
}
const VISITOR_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'

test.describe('social cards', () => {
  test('fixed pages use a card id; free text without a signature gets the default card', async ({
    page,
    request,
  }) => {
    await page.goto('/about')
    const og = await page.locator('meta[property="og:image"]').getAttribute('content')
    expect(new URL(og || '').pathname + new URL(og || '').search).toBe('/api/og?card=about')

    const preset = await request.get('/api/og?card=about')
    expect(preset.status()).toBe(200)
    expect(preset.headers()['content-type']).toBe('image/png')
    expect(preset.headers()['x-card']).toBe('preset')
    expect(preset.headers()['cache-control']).toContain('immutable')

    const forged = await request.get('/api/og?kind=blog&title=Not+written+by+the+owner')
    expect(forged.status()).toBe(200)
    expect(forged.headers()['x-card']).toBe('refused')
    expect(forged.headers()['cache-control']).not.toContain('immutable')
    expect((await forged.body()).equals(await (await request.get('/api/og')).body())).toBe(true)
  })

  test('an article card is signed in the page loader and renders; tampering is refused', async ({
    page,
    request,
  }) => {
    await page.goto('/blog')
    const href = await page.locator('main a[href^="/blog/"]').first().getAttribute('href')
    test.skip(!href, 'no published post to check')
    await page.goto(href as string)
    const og = new URL(
      (await page.locator('meta[property="og:image"]').getAttribute('content')) || ''
    )
    expect(og.searchParams.get('sig')).toMatch(/^[A-Za-z0-9_-]{22}$/)
    const path = og.pathname + og.search
    const signed = await request.get(path)
    expect(signed.headers()['x-card']).toBe('signed')
    const tampered = new URL(og)
    tampered.searchParams.set('title', `${tampered.searchParams.get('title')} (edited)`)
    expect((await request.get(tampered.pathname + tampered.search)).headers()['x-card']).toBe(
      'refused'
    )
  })
})

test.describe('error monitoring', () => {
  test('the CSP reports violations to the site itself', async ({ request }) => {
    const res = await request.get('/')
    const csp = res.headers()['content-security-policy'] || ''
    expect(csp).toMatch(/(^|; )report-uri \/api\/e(;|$)/)
    expect(csp).not.toMatch(/sentry|report-to https?:/i)
  })

  test('POST /api/e answers 204 for anything, and refuses other methods', async ({
    request,
    baseURL,
  }) => {
    test.skip(!isLocal(baseURL || ''), 'files a report: local builds only')
    const ok = await request.post('/api/e', {
      headers: { 'content-type': 'text/plain;charset=UTF-8', 'user-agent': VISITOR_UA },
      data: JSON.stringify({ k: 'error', n: 'Error', m: 'e2e probe: report endpoint', p: '/e2e' }),
    })
    expect(ok.status()).toBe(204)
    expect(
      (
        await request.post('/api/e', {
          headers: { 'content-type': 'text/plain' },
          data: 'not json',
        })
      ).status()
    ).toBe(204)
    expect((await request.get('/api/e')).status()).toBe(405)
  })
})

// Uses the plain Playwright test: the shared fixture fails a test on any page
// error, and this one throws on purpose.
base(
  'an uncaught error in the page is sent to /api/e with the path and without identifiers',
  async ({ browser, baseURL }) => {
    base.skip(!isLocal(baseURL || ''), 'files a report: local builds only')
    const context = await browser.newContext({ baseURL, userAgent: VISITOR_UA })
    try {
      const page = await context.newPage()
      await page.goto('/now?ref=secret-query')
      const beacon = page.waitForRequest(
        (r) => new URL(r.url()).pathname === '/api/e' && r.method() === 'POST'
      )
      const marker = `e2e probe ${Date.now()}`
      await page.evaluate((m) => {
        setTimeout(() => {
          throw new TypeError(m)
        })
      }, marker)
      const req = await beacon
      const body = JSON.parse(req.postData() || '{}') as Record<string, unknown>
      base.expect(body.k).toBe('error')
      base.expect(body.n).toBe('TypeError')
      base.expect(body.m).toBe(marker)
      base.expect(body.p).toBe('/now')
      base.expect(Object.keys(body).sort()).toEqual(base.expect.arrayContaining(['k', 'm', 'p']))
      base.expect(JSON.stringify(body)).not.toContain('secret-query')
      const res = await req.response()
      base.expect(res?.status()).toBe(204)
    } finally {
      await context.close()
    }
  }
)

// ── Admin ──────────────────────────────────────────────────────────────────

type Cdp = Awaited<ReturnType<import('@playwright/test').BrowserContext['newCDPSession']>>

async function addVirtualAuthenticator(page: Page): Promise<{ cdp: Cdp; id: string }> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  return { cdp, id: authenticatorId }
}

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

// One password sign-in for the whole group (the login route allows 10 per
// client address per 5 minutes, and the other admin specs sign in too): the
// tests run in order in one worker and start from this signed-in state.
const STATE_FILE = path.join(os.tmpdir(), `sa-admin-state-${process.pid}-${Date.now()}.json`)
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000'
/** Contexts that must start signed out (`test.use` would otherwise hand them the shared state). */
const SIGNED_OUT = { cookies: [], origins: [] }

test.describe('admin security', { tag: '@admin' }, () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')
  test.use({ storageState: STATE_FILE })

  test.beforeAll(async ({ browser }) => {
    if (!ADMIN.email || !ADMIN.password) return
    const context = await browser.newContext({ baseURL: BASE, storageState: SIGNED_OUT })
    const page = await context.newPage()
    await loginAsAdmin(page)
    await context.storageState({ path: STATE_FILE })
    await context.close()
  })
  test.afterAll(() => fs.rmSync(STATE_FILE, { force: true }))

  test('add a passkey, sign in with it, see the session and the history, then remove it', async ({
    browser,
    baseURL,
  }) => {
    test.skip(
      !isLocal(baseURL || ''),
      'needs the build on a loopback address (reached as localhost)'
    )
    test.setTimeout(120_000)
    const local = localhostOf(baseURL as string)
    // Its own browser on `localhost` (cookies are per host): one more sign-in.
    const context = await browser.newContext({ baseURL: local, storageState: SIGNED_OUT })
    // No passkey autofill here, so the sign-in below goes through the button
    // (the virtual authenticator would answer an autofill request on its own;
    // that path is checked in a second browser at the end).
    await context.addInitScript(() => {
      if (window.PublicKeyCredential) {
        Object.defineProperty(window.PublicKeyCredential, 'isConditionalMediationAvailable', {
          configurable: true,
          value: async () => false,
        })
      }
    })
    try {
      const page = await context.newPage()
      const { cdp, id } = await addVirtualAuthenticator(page)
      await loginAsAdmin(page)
      // A previous failed run may have left "Require a passkey" on.
      await adminJson(page, 'PUT', '/api/admin/security/policy', { passkeyRequired: false })

      await page.goto('/admin/security')
      await expect(page.getByRole('heading', { name: 'Security', level: 1 })).toBeVisible()
      await expect(page.getByRole('heading', { name: /Passkeys/ })).toBeVisible()
      await settle(page)
      expect(await seriousA11yViolations(page)).toEqual([])

      const overview = (await adminJson(page, 'GET', '/api/admin/security')).json
      const before = overview.passkeys.length as number
      await page.getByRole('button', { name: 'Add a passkey' }).click()
      const codesDialog = page.getByRole('dialog', { name: /Save your recovery codes/ })
      const saveCodes = async () => {
        await expect(codesDialog).toBeVisible()
        await expect(
          codesDialog.getByRole('list', { name: 'Recovery codes' }).getByRole('listitem')
        ).toHaveCount(10)
        const done = codesDialog.getByRole('button', { name: 'Done' })
        await expect(done).toBeDisabled()
        await codesDialog.getByText('I have saved these codes somewhere safe').click()
        await done.click()
        await expect(codesDialog).toBeHidden()
      }
      // The first passkey of a fresh install also creates the recovery codes.
      if (before === 0 && overview.recovery.remaining === 0) await saveCodes()
      await expect(page.getByRole('button', { name: /^Remove passkey / })).toHaveCount(before + 1)
      // Rename it through the dialog (newest last), to a name of its own.
      const label = `E2E passkey ${Date.now()}`
      await page
        .getByRole('button', { name: /^Rename passkey / })
        .last()
        .click()
      const rename = page.getByRole('dialog', { name: 'Rename passkey' })
      await rename.getByLabel('Name').fill(label)
      await rename.getByRole('button', { name: 'Save' }).click()
      await expect(page.getByRole('button', { name: `Remove passkey ${label}` })).toBeVisible()
      // A new set of codes, shown once.
      await page.getByRole('button', { name: /Create (new )?codes/ }).click()
      await saveCodes()
      await expect(page.getByText(/^10 of 10\b/)).toBeVisible()

      // Sign out, then back in with the passkey.
      expect((await adminJson(page, 'POST', '/api/admin/logout')).status).toBe(200)
      await page.goto('/admin/login')
      await page.getByRole('button', { name: 'Sign in with a passkey' }).click()
      await page.waitForURL((url) => url.pathname === '/admin')

      await page.goto('/admin/security')
      const sessions = page.getByRole('list', { name: /Signed-in browsers/ })
      const mine = sessions.getByRole('listitem').filter({ hasText: 'this browser' })
      await expect(mine).toContainText(/Passkey · signed in/)
      const history = page.getByRole('list', { name: /Sign-in history/ })
      await expect(history.getByRole('listitem').first()).toContainText('Signed in')
      await expect(history.getByRole('listitem').first()).toContainText('Passkey')

      // Autofill (conditional mediation): a second browser holding the same
      // passkey is signed in straight from the login page.
      const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId: id })
      const second = await browser.newContext({ baseURL: local, storageState: SIGNED_OUT })
      try {
        const page2 = await second.newPage()
        const v2 = await addVirtualAuthenticator(page2)
        for (const credential of credentials) {
          await v2.cdp.send('WebAuthn.addCredential', { authenticatorId: v2.id, credential })
        }
        await page2.goto('/admin/login')
        await page2.waitForURL((url) => url.pathname === '/admin')
      } finally {
        await second.close()
      }

      // Remove the passkey again (signed in with it just now: no step-up).
      await page.getByRole('button', { name: `Remove passkey ${label}` }).click()
      const confirm = page.getByRole('alertdialog')
      await confirm.getByRole('button', { name: 'Remove' }).click()
      await expect(page.getByText('Passkey removed')).toBeVisible()
      await expect(page.getByRole('button', { name: /^Remove passkey / })).toHaveCount(before)
      await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: id })
    } finally {
      await context.close()
    }
  })

  test('signing another browser out ends its session', async ({ browser, page }) => {
    await page.goto('/admin')
    const other = await browser.newContext({ baseURL: BASE, storageState: SIGNED_OUT })
    try {
      const otherPage = await other.newPage()
      await loginAsAdmin(otherPage)
      const mine = (await adminJson(page, 'GET', '/api/admin/security')).json.current
        .sessionId as string
      const theirs = (await adminJson(otherPage, 'GET', '/api/admin/security')).json.current
        .sessionId as string
      expect(theirs).not.toBe(mine)
      expect(
        (await adminJson(page, 'DELETE', '/api/admin/security/sessions', { id: theirs })).status
      ).toBe(200)
      expect((await adminJson(otherPage, 'GET', '/api/admin/security')).status).toBe(401)
      expect((await adminJson(page, 'GET', '/api/admin/security')).status).toBe(200)
    } finally {
      await other.close()
    }
  })

  test('the System page shows health, runs a restore drill and lists errors; /admin links it', async ({
    page,
  }) => {
    await page.goto('/admin')
    // The cards (an attention item may link the same pages too).
    await expect(
      page.getByRole('heading', { name: 'Security', level: 3 }).getByRole('link')
    ).toHaveAttribute('href', '/admin/security')
    await expect(
      page.getByRole('heading', { name: 'System', level: 3 }).getByRole('link')
    ).toHaveAttribute('href', '/admin/system')

    await page.goto('/admin/system')
    await expect(page.getByRole('heading', { name: 'System', level: 1 })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Databases' })).toContainText('schema v')
    await settle(page)
    expect(await seriousA11yViolations(page)).toEqual([])
    await page.getByRole('button', { name: 'Run drill now' }).click()
    await expect(page.getByText(/^Restore drill (passed|skipped)$/)).toBeVisible({
      timeout: 60_000,
    })

    await page.getByRole('tab', { name: 'Errors' }).click()
    await expect(page).toHaveURL(/view=errors/)
    await expect(page.getByRole('tab', { name: /^Open/ })).toHaveAttribute('aria-selected', 'true')
    // Toasts fade out first (axe would measure them mid-animation).
    await expect(page.getByText(/^Restore drill (passed|skipped)$/)).toBeHidden({ timeout: 15_000 })
    await settle(page)
    expect(await seriousA11yViolations(page)).toEqual([])
    const errors = await adminJson(page, 'GET', '/api/admin/errors?status=all')
    expect(errors.status).toBe(200)
    expect(typeof errors.json.totals.open).toBe('number')
  })

  // The step-up dialog. A wrong password is answered 401 on purpose, which
  // the browser logs as a failed request, so this test drives its own page
  // (from the shared signed-in state) with a guard that allows exactly that.
  test('a dangerous action asks to confirm with the password once the sign-in is no longer recent', async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: BASE, storageState: STATE_FILE })
    try {
      const page = await context.newPage()
      const problems: string[] = []
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
      page.on('console', (m) => {
        if (m.type() !== 'error') return
        const url = m.location().url || ''
        if (
          /401/.test(m.text()) &&
          new URL(url, 'http://x').pathname === '/api/admin/security/verify'
        )
          return
        problems.push(`console.error: ${m.text()} (${url})`)
      })
      await page.goto('/admin/security')
      const windowMinutes = (await adminJson(page, 'GET', '/api/admin/security')).json.stepUp
        .windowMinutes as number
      test.skip(
        windowMinutes !== 1,
        'run the server with ADMIN_RECENT_AUTH_MINUTES=1 to exercise the step-up dialog'
      )
      test.setTimeout(150_000)
      // Wait out the one-minute window (the shared sign-in may be recent).
      if ((await adminJson(page, 'GET', '/api/admin/security/recent')).json.recent)
        await page.waitForTimeout(62_000)
      await page.reload()
      await page.getByRole('button', { name: 'Confirm it’s me now' }).click()
      const dialog = page.getByRole('dialog', { name: /Confirm it’s you/ })
      await expect(dialog).toBeVisible()
      await settle(page)
      expect(await seriousA11yViolations(page)).toEqual([])
      // Esc cancels without an error.
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await page.getByRole('button', { name: 'Confirm it’s me now' }).click()
      await dialog.getByLabel(/^Password/).fill('definitely not the password')
      await dialog.getByRole('button', { name: 'Confirm with password' }).click()
      await expect(dialog.getByRole('alert')).toContainText(/not right/)
      await dialog.getByLabel(/^Password/).fill(ADMIN.password)
      await dialog.getByRole('button', { name: 'Confirm with password' }).click()
      await expect(dialog).toBeHidden()
      await expect(page.getByText(/Dangerous actions won’t ask again for 1 minutes?/)).toBeVisible()
      // Recent now: the next dangerous action does not ask again.
      expect((await adminJson(page, 'GET', '/api/admin/security/recent')).json.recent).toBe(true)
      expect(problems).toEqual([])
    } finally {
      await context.close()
    }
  })
})
