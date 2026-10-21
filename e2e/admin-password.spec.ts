import crypto from 'node:crypto'
import {
  request as playwrightRequest,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import {
  test,
  expect,
  ADMIN,
  isLocalServer,
  loginAsAdmin,
  seriousA11yViolations,
  settle,
  undersizedTargets,
} from './fixtures'
import { checkNewPassword } from '../lib/adminAuth/passwordPolicy'

/**
 * Admin → Security → Password (POST /api/admin/security/password), @admin.
 *
 * Changing the password signs other browsers out when asked — and the admin
 * project shares ONE signed-in session between its tests (fixtures.ts
 * loginAsAdmin). So every test here signs in on its own (fresh contexts, not
 * the shared session), the round trip keeps other browsers signed in, and
 * the one check of "sign out other browsers" re-signs the shared session
 * afterwards. The original password (ADMIN_PASS) is ALWAYS restored — in a
 * `finally` of each changing test and once more in afterAll — even when an
 * assertion fails. The tests run in order, in one worker.
 *
 * Only against a local build: it changes the admin password.
 */

const CHANGE_URL = '/api/admin/security/password'
const SIGNED_OUT = { cookies: [], origins: [] }
const isLocal = (url: string) => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)

/** Temporary passwords this run set (so afterAll can undo any of them). */
const temporaries: string[] = []
function temporaryPassword(): string {
  const p = `e2e tide ${crypto.randomBytes(9).toString('base64url')} lantern`
  temporaries.push(p)
  return p
}

type Env = { baseURL: string; headers: Record<string, string> }

/**
 * A browser context of its own, signed in through the real form. Its page
 * fails the test on console or page errors, except the 4xx answers this
 * spec provokes on purpose (wrong current password, refused new password).
 */
async function signedInPage(
  browser: Browser,
  env: Env,
  problems: string[],
  colorScheme: 'light' | 'dark' = 'dark'
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: env.baseURL,
    storageState: SIGNED_OUT,
    extraHTTPHeaders: env.headers,
    colorScheme,
    locale: 'en-US',
    timezoneId: 'Asia/Hong_Kong',
  })
  // The site's own theme follows the system colour scheme for these pages.
  await context.addInitScript(() => {
    try {
      localStorage.setItem('theme-preference', 'system')
    } catch {
      /* storage blocked: the default theme applies */
    }
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const url = m.location().url || ''
    let pathname = ''
    try {
      pathname = new URL(url).pathname
    } catch {
      /* not a URL */
    }
    if (pathname === CHANGE_URL && /status of (400|401|403|429)\b/.test(m.text())) return
    problems.push(`console.error: ${m.text()} (${url})`)
  })
  await loginAsAdmin(page, { fresh: true })
  return { context, page }
}

/** POST /api/auth/email-login from a cookie-less API client; resolves to the status and the session cookie. */
async function apiSignIn(
  api: APIRequestContext,
  password: string
): Promise<{ status: number; cookie: string }> {
  const res = await api.post('/api/auth/email-login', { data: { email: ADMIN.email, password } })
  const cookie =
    res
      .headersArray()
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value.split(';')[0])
      .find((c) => c.startsWith('cv_admin_token=')) || ''
  return { status: res.status(), cookie }
}

async function newApi(env: Env): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: env.baseURL, extraHTTPHeaders: env.headers })
}

/**
 * Put ADMIN_PASS back. `from` is the password the account may have now;
 * when it does not sign in, the original already does (asserted). The
 * session cookie is passed by hand: an API client leaves a Secure cookie out
 * over plain http.
 */
async function restorePassword(env: Env, from: string): Promise<void> {
  const api = await newApi(env)
  try {
    const original = await apiSignIn(api, ADMIN.password)
    if (original.status === 200) return
    const signedIn = await apiSignIn(api, from)
    if (signedIn.status !== 200) {
      throw new Error(
        `could not sign in with the original (${original.status}) or the temporary password (${signedIn.status})`
      )
    }
    const res = await api.post(CHANGE_URL, {
      headers: { cookie: signedIn.cookie },
      data: { currentPassword: from, newPassword: ADMIN.password, signOutOthers: false },
    })
    if (res.status() !== 200) throw new Error(`restoring answered ${res.status()}`)
    expect(
      (await apiSignIn(api, ADMIN.password)).status,
      'the original password signs in again'
    ).toBe(200)
  } finally {
    await api.dispose()
  }
}

/** fetch() from the page (its cookies), JSON back. */
async function pageJson(
  page: Page,
  method: string,
  url: string
): Promise<{ status: number; json: any }> {
  return page.evaluate(
    async ([m, u]) => {
      const res = await fetch(u, { method: m, cache: 'no-store' })
      return { status: res.status, json: await res.json().catch(() => null) }
    },
    [method, url] as const
  )
}

/** The Password card's fields (labels carry a visual "*", hence the prefix match). */
function fields(page: Page) {
  return {
    current: page.getByLabel(/^Current password/),
    next: page.getByLabel(/^New password/),
    confirm: page.getByLabel(/^Confirm new password/),
    signOutOthers: page.getByRole('checkbox', { name: 'Sign out other browsers' }),
    submit: page.getByRole('button', { name: /^(Change password|Changing…)$/ }),
    rules: page.getByRole('list', { name: 'Requirements' }),
  }
}

/** Would ADMIN_PASS pass the new-password rules (so a round trip can restore it)? */
async function originalPassesPolicy(page: Page): Promise<boolean> {
  const overview = (await pageJson(page, 'GET', '/api/admin/security')).json
  return checkNewPassword(ADMIN.password, {
    email: overview.password.email,
    siteHost: overview.password.siteHost,
  }).ok
}

test.describe('admin password', { tag: '@admin' }, () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test.afterAll(async () => {
    if (!temporaries.length) return
    // Safety net: whatever happened above, leave the original password in place.
    // (Hooks get no test-scoped fixtures: the base URL from the env, and on a
    // local server a client address of its own from the benchmark range, so
    // it shares no rate-limit budget with a test.)
    const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000'
    const headers: Record<string, string> = isLocalServer(baseURL)
      ? { 'cf-connecting-ip': `198.18.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 255)}` }
      : {}
    const env = { baseURL, headers }
    let lastError: unknown = null
    for (const from of [...temporaries].reverse()) {
      try {
        await restorePassword(env, from)
        return
      } catch (err) {
        lastError = err
      }
    }
    throw lastError
  })

  test('the card: rules as you type, errors on their fields, keyboard and a11y in both themes', async ({
    browser,
    baseURL,
    extraHTTPHeaders,
  }) => {
    test.skip(!isLocal(baseURL || ''), 'local builds only')
    const problems: string[] = []
    const env = { baseURL: baseURL as string, headers: { ...(extraHTTPHeaders || {}) } }
    const { context, page } = await signedInPage(browser, env, problems, 'light')
    try {
      await page.goto('/admin/security')
      await expect(page.getByRole('heading', { name: /Password/, level: 2 })).toBeVisible()
      const f = fields(page)

      // One form password managers understand.
      const username = page.locator('form input[autocomplete="username"]')
      await expect(username).toHaveValue(ADMIN.email)
      await expect(f.current).toHaveAttribute('autocomplete', 'current-password')
      await expect(f.next).toHaveAttribute('autocomplete', 'new-password')
      await expect(f.confirm).toHaveAttribute('autocomplete', 'new-password')
      await expect(f.signOutOthers).toBeChecked()

      // Live checklist and strength.
      await f.next.fill('Password1234!')
      await expect(
        f.rules.getByRole('listitem').filter({ hasText: 'Not a common or predictable password' })
      ).toHaveAttribute('data-state', 'unmet')
      await expect(page.getByText(/^Strength:/)).toContainText('too weak')
      // The rules are part of the field's description.
      const describedBy = (await f.next.getAttribute('aria-describedby')) || ''
      const rulesId = await f.rules.getAttribute('id')
      expect(describedBy.split(' ')).toContain(rulesId)
      // …and read out once typing pauses.
      await expect(
        page.getByRole('status').filter({ hasText: /of 4 password requirements met/ })
      ).toHaveCount(1, { timeout: 5000 })

      // Submitting with problems: errors on the fields, focus on the first one, no request.
      let requests = 0
      page.on('request', (r) => {
        if (new URL(r.url()).pathname === CHANGE_URL) requests++
      })
      await f.submit.click()
      await expect(page.getByText('Enter your current password.')).toBeVisible()
      await expect(f.current).toBeFocused()
      await expect(f.current).toHaveAttribute('aria-invalid', 'true')
      await f.current.fill('definitely not the password')
      await f.submit.click()
      await expect(f.next).toBeFocused()
      await expect(page.getByText(/too common or predictable/)).toBeVisible()
      const temp = `e2e harbour ${crypto.randomBytes(6).toString('base64url')} lights`
      await f.next.fill(temp)
      await f.confirm.fill(`${temp}!`)
      await f.submit.click()
      await expect(f.confirm).toBeFocused()
      await expect(page.getByText('The new passwords don’t match.')).toBeVisible()
      expect(requests).toBe(0)

      // A wrong current password: "incorrect", focus back on it, nothing changed.
      await f.confirm.fill(temp)
      await f.submit.click()
      await expect(page.getByText('That isn’t your current password.')).toBeVisible()
      await expect(f.current).toBeFocused()
      expect(requests).toBe(1)

      // Keyboard only: the show / hide toggle follows the field, is named after it and says its state.
      for (const name of ['Show current password', 'Show new password', 'Show confirm new password'])
        await expect(page.getByRole('button', { name, exact: true })).toHaveCount(1)
      await f.current.focus()
      await page.keyboard.press('Tab')
      const toggle = page.getByRole('button', { name: 'Show current password', exact: true })
      await expect(toggle).toBeFocused()
      await expect(toggle).toHaveAttribute('aria-pressed', 'false')
      await page.keyboard.press('Space')
      await expect(toggle).toHaveAttribute('aria-pressed', 'true')
      await expect(f.current).toHaveAttribute('type', 'text')
      await page.keyboard.press('Space')
      await expect(f.current).toHaveAttribute('type', 'password')

      // Accessibility, light then dark, with the errors showing.
      await settle(page)
      expect(await seriousA11yViolations(page)).toEqual([])
      expect(await undersizedTargets(page)).toEqual([])
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
      await page.emulateMedia({ colorScheme: 'dark' })
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await settle(page)
      expect(await seriousA11yViolations(page)).toEqual([])

      // Still the original password.
      const api = await newApi(env)
      try {
        expect((await apiSignIn(api, ADMIN.password)).status).toBe(200)
      } finally {
        await api.dispose()
      }
      expect(problems).toEqual([])
    } finally {
      await context.close()
    }
  })

  test('a 429 shows when to try again, and closing the step-up dialog changes nothing', async ({
    browser,
    baseURL,
    extraHTTPHeaders,
  }) => {
    test.skip(!isLocal(baseURL || ''), 'local builds only')
    const problems: string[] = []
    const env = { baseURL: baseURL as string, headers: { ...(extraHTTPHeaders || {}) } }
    const { context, page } = await signedInPage(browser, env, problems)
    try {
      await page.goto('/admin/security')
      const f = fields(page)
      const temp = `e2e harbour ${crypto.randomBytes(6).toString('base64url')} lights`
      const fill = async () => {
        await f.current.fill('not checked by the mocked server')
        await f.next.fill(temp)
        await f.confirm.fill(temp)
      }

      // Throttled (answered here, the server is not asked).
      await page.route(`**${CHANGE_URL}`, (route) =>
        route.fulfill({
          status: 429,
          headers: { 'Retry-After': '300' },
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'THROTTLED',
            error: 'Too many attempts. Try again later.',
            retryAfterSeconds: 300,
          }),
        })
      )
      await fill()
      await f.submit.click()
      await expect(
        page.getByRole('alert').filter({ hasText: /Too many attempts\. Try again in 5 min/ })
      ).toBeVisible()
      await expect(f.submit).toBeEnabled()
      await expect(f.submit).toBeFocused()
      await page.unroute(`**${CHANGE_URL}`)

      // "Require a passkey" turned on elsewhere: the route asks for a step-up; closing the dialog keeps everything.
      await page.route(`**${CHANGE_URL}`, (route) =>
        route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'STEP_UP_REQUIRED',
            error: 'Confirm it’s you to continue.',
            methods: ['password'],
            recoveryRequired: false,
            windowMinutes: 10,
          }),
        })
      )
      await page.route('**/api/admin/security/recent', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            recent: false,
            recentUntil: null,
            methods: ['password'],
            recoveryRequired: false,
            windowMinutes: 10,
          }),
        })
      )
      // A new form: the 429 above is remembered for five minutes.
      await page.reload()
      await fill()
      await f.submit.click()
      const dialog = page.getByRole('dialog', { name: /Confirm it’s you/ })
      await expect(dialog).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(page.getByText(/Not changed — the confirmation was closed/)).toBeVisible()
      await expect(f.next).toHaveValue(temp)
      expect(problems).toEqual([])
    } finally {
      await context.close()
    }
  })

  test('round trip with other browsers kept: the new password signs in, the old one does not — then it is restored', async ({
    browser,
    baseURL,
    extraHTTPHeaders,
  }) => {
    test.skip(!isLocal(baseURL || ''), 'local builds only: changes the admin password')
    test.setTimeout(120_000)
    const problems: string[] = []
    const env = { baseURL: baseURL as string, headers: { ...(extraHTTPHeaders || {}) } }
    const { context, page } = await signedInPage(browser, env, problems)
    const other = await signedInPage(browser, env, problems)
    const temp = temporaryPassword()
    try {
      test.skip(
        !(await originalPassesPolicy(page)),
        'ADMIN_PASS does not meet the new-password rules, so it could not be restored'
      )
      await page.goto('/admin/security')
      const f = fields(page)
      await f.current.fill(ADMIN.password)
      await f.next.fill(temp)
      await f.confirm.fill(temp)
      await f.signOutOthers.uncheck({ force: true })
      await f.submit.click()

      const done = page.getByTestId('password-changed')
      await expect(done).toBeVisible()
      await expect(done).toBeFocused()
      await expect(done).toContainText(
        'Every signed-in browser stays signed in, this one included.'
      )
      await expect(
        page.getByRole('status').filter({ hasText: 'Password changed' }).first()
      ).toBeVisible()
      // The form is empty again, and back to signing other browsers out.
      await expect(f.current).toHaveValue('')
      await expect(f.signOutOthers).toBeChecked()

      // This browser and the other one are still signed in.
      expect((await pageJson(page, 'GET', '/api/admin/security')).status).toBe(200)
      expect((await pageJson(other.page, 'GET', '/api/admin/security')).status).toBe(200)
      const api = await newApi(env)
      try {
        expect(
          (await apiSignIn(api, ADMIN.password)).status,
          'the old password no longer signs in'
        ).toBe(401)
        expect((await apiSignIn(api, temp)).status, 'the new one does').toBe(200)
      } finally {
        await api.dispose()
      }
      // The history and the activity log say so.
      const history = page.getByRole('list', { name: /Sign-in history/ })
      await expect(
        history.getByRole('listitem').filter({ hasText: 'Changed the password' }).first()
      ).toBeVisible()
      const activity = (await pageJson(page, 'GET', '/api/admin/activity?area=security')).json
      expect(
        activity.items.some((i: { action: string }) => i.action === 'security.password-change')
      ).toBe(true)
      expect(problems).toEqual([])
    } finally {
      await other.context.close()
      await context.close()
      await restorePassword(env, temp)
    }
  })

  test('"sign out other browsers" ends every other session and keeps this one; the shared session is renewed after', async ({
    browser,
    baseURL,
    extraHTTPHeaders,
  }) => {
    test.skip(!isLocal(baseURL || ''), 'local builds only: changes the admin password')
    test.setTimeout(120_000)
    const problems: string[] = []
    const env = { baseURL: baseURL as string, headers: { ...(extraHTTPHeaders || {}) } }
    const { context, page } = await signedInPage(browser, env, problems)
    // The other browser's check below is answered 401 on purpose (logged as a failed load).
    const otherProblems: string[] = []
    const other = await signedInPage(browser, env, otherProblems)
    const temp = temporaryPassword()
    try {
      test.skip(
        !(await originalPassesPolicy(page)),
        'ADMIN_PASS does not meet the new-password rules, so it could not be restored'
      )
      await page.goto('/admin/security')
      const f = fields(page)
      await expect(f.signOutOthers).toBeChecked()
      await f.current.fill(ADMIN.password)
      await f.next.fill(temp)
      await f.confirm.fill(temp)
      await f.submit.click()
      const done = page.getByTestId('password-changed')
      await expect(done).toBeVisible()
      await expect(done).toContainText(/Signed out \d+ other browsers?; this one stays signed in\./)

      expect(
        (await pageJson(other.page, 'GET', '/api/admin/security')).status,
        'the other browser is signed out'
      ).toBe(401)
      const mine = await pageJson(page, 'GET', '/api/admin/security')
      expect(mine.status, 'this browser keeps a (new) session').toBe(200)
      expect(mine.json.sessions.filter((s: { current: boolean }) => !s.current)).toEqual([])
      expect(problems).toEqual([])
      expect(
        otherProblems.filter((p) => !/status of 401 .*\/api\/admin\/security\)$/.test(p))
      ).toEqual([])
    } finally {
      await other.context.close()
      await context.close()
      await restorePassword(env, temp)
      // Every other admin test signs in with the shared session, which this one ended: sign it in again.
      const shared = await browser.newContext({
        baseURL: env.baseURL,
        storageState: SIGNED_OUT,
        extraHTTPHeaders: env.headers,
      })
      try {
        await loginAsAdmin(await shared.newPage())
      } finally {
        await shared.close()
      }
    }
  })
})
