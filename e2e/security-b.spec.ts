import { test as base, type Page } from '@playwright/test'
import { test, expect, ADMIN, loginAsAdmin, settle, seriousA11yViolations } from './fixtures'

/**
 * Strict CSP and the Next 16 proxy (stream security-b):
 *   - every page is served with a hash-only script-src, every inline script
 *     on it is one of those hashes, and the inline scripts really run (the
 *     Trusted Types default policy and the theme and tag-filter pre-paint,
 *     checked with the app bundles held back);
 *   - a script the site did not ship is refused, an inline handler too;
 *     Trusted Types are report-only (reported, nothing blocked), and the
 *     public pages report nothing: the default policy approves the
 *     framework's safe writes and the QR codes are drawn as elements;
 *   - COOP / CORP / Permissions-Policy / Reporting-Endpoints;
 *   - the proxy keeps the legacy CV redirect, CSRF and the admin gate, and
 *     (@admin) a signed-out browser can no longer load an admin page shell;
 *   - (@admin, local) CSP and Trusted Types reports reach the Errors panel.
 *
 * Production-safe without @admin: GETs only, except the report test, which
 * runs against a local build only.
 */

const isLocal = (url: string) => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)
const VISITOR_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'

const PAGES = ['/', '/about', '/blog', '/work', '/cv', '/cv/zh', '/contact', '/now', '/uses', '/colophon', '/admin/login', '/no-such-page-security-b']

function scriptSrcOf(csp: string | undefined): string[] {
  const m = /(?:^|;\s*)script-src ([^;]+)/.exec(csp || '')
  return m ? m[1].trim().split(/\s+/) : []
}

/** CSP hash sources of the page's inline executable scripts (data blocks skipped). */
async function inlineScriptHashes(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const out: string[] = []
    for (const s of Array.from(document.scripts)) {
      if (s.src) continue
      const type = (s.getAttribute('type') || '').trim().toLowerCase()
      if (type && !['text/javascript', 'application/javascript', 'module'].includes(type)) continue
      const text = s.textContent || ''
      if (!text) continue
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
      out.push(`'sha256-${btoa(String.fromCharCode(...digest))}'`)
    }
    return out
  })
}

test.describe('strict CSP', () => {
  test("pages allow scripts by hash only, and every inline script on them is one of the hashes", async ({ page }) => {
    for (const path of PAGES) {
      const res = await page.goto(path)
      expect(res, path).not.toBeNull()
      const scriptSrc = scriptSrcOf(res!.headers()['content-security-policy'])
      expect(scriptSrc, path).toContain("'self'")
      expect(scriptSrc, path).not.toContain("'unsafe-inline'")
      expect(scriptSrc.filter((v) => v !== "'self'" && !/^'sha256-[A-Za-z0-9+/]{43}='$/.test(v)), path).toEqual([])
      const hashes = await inlineScriptHashes(page)
      expect(hashes.length, `${path}: the Trusted Types default policy and the theme pre-paint scripts`).toBeGreaterThanOrEqual(3)
      for (const h of hashes) expect(scriptSrc, `${path}: inline script ${h}`).toContain(h)
    }
    // The fixture fails the test on any enforced CSP violation on these pages.
  })

  // The app bundles are held back (empty responses), so only the inline
  // scripts can have done this: proof that the CSP lets them run.
  test('the inline pre-paint scripts run under the CSP (no app JavaScript loaded)', async ({ page }) => {
    await page.route('**/_next/static/**/*.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
    await page.addInitScript(() => {
      try {
        localStorage.setItem('theme-preference', 'light')
      } catch {
        /* storage blocked: the assertion below fails visibly */
      }
    })
    await page.goto('/now')
    // The Trusted Types default policy (lib/trustedTypesDefault.ts) exists before any app code.
    expect(await page.evaluate(() => (window as unknown as { trustedTypes?: { defaultPolicy?: { name: string } | null } }).trustedTypes?.defaultPolicy?.name)).toBe('default')
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'light')
    await expect(html).toHaveAttribute('data-theme-preference', 'light')
    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content')
    expect(themeColor?.toLowerCase()).toBe('#fdfdfd')

    // The tag filter's pre-paint hides the posts a shared ?tag= link does not match.
    await page.goto('/blog')
    const tagged = page.locator('[data-tag-item][data-tag-slugs]:not([data-tag-slugs=""])')
    test.skip((await tagged.count()) === 0, 'no tagged post in this store')
    const slug = ((await tagged.first().getAttribute('data-tag-slugs')) || '').split(' ')[0]
    await page.goto(`/blog?tag=${encodeURIComponent(slug)}`)
    await expect(page.locator('#tag-filter-prepaint')).toHaveCount(1)
    const visibility = await page.evaluate((s) => {
      const items = Array.from(document.querySelectorAll<HTMLElement>('[data-tag-item]'))
      return items.map((el) => ({ match: (el.dataset.tagSlugs || '').split(' ').includes(s), shown: getComputedStyle(el).display !== 'none' }))
    }, slug)
    expect(visibility.length).toBeGreaterThan(0)
    for (const v of visibility) expect(v.shown).toBe(v.match)
  })

  test('COOP, CORP, Permissions-Policy, reporting and Trusted Types (report-only) headers', async ({ request, page }) => {
    const res = await request.get('/')
    const h = res.headers()
    expect(h['cross-origin-opener-policy']).toBe('same-origin')
    expect(h['cross-origin-resource-policy']).toBe('same-origin')
    expect(h['x-permitted-cross-domain-policies']).toBe('none')
    expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['x-frame-options']).toBe('DENY')
    expect(h['strict-transport-security']).toContain('max-age=63072000')
    expect(h['reporting-endpoints']).toBe('csp="/api/e"')
    expect(h['content-security-policy']).toMatch(/; report-to csp; report-uri \/api\/e$/)
    expect(h['content-security-policy']).toMatch(/(^|; )style-src 'self' 'unsafe-inline';/)
    expect(h['content-security-policy']).not.toMatch(/(style|font|connect|media)-src[^;]*https:/)
    expect(h['content-security-policy-report-only']).toBe(
      "require-trusted-types-for 'script'; trusted-types default nextjs nextjs#bundler; report-to csp; report-uri /api/e",
    )
    const pp = h['permissions-policy'] || ''
    for (const off of ['camera', 'microphone', 'geolocation', 'payment', 'usb', 'browsing-topics']) expect(pp).toMatch(new RegExp(`(^|, )${off}=\\(\\)(,|$)`))
    expect(pp).toMatch(/(^|, )publickey-credentials-get=\(self\)(,|$)/)
    expect(pp).toMatch(/(^|, )autoplay=\(self "https:\/\/www\.youtube-nocookie\.com"/)

    // Embeddable images and icons may be shown by other sites; everything else stays same-origin.
    for (const path of ['/api/og?card=about', '/icons/apple-touch-icon.png', '/icon.svg', '/favicon.ico']) {
      expect((await request.get(path)).headers()['cross-origin-resource-policy'], path).toBe('cross-origin')
    }
    await page.goto('/')
    const chunk = await page.locator('script[src*="/_next/static/chunks/"]').first().getAttribute('src')
    const asset = await request.get(chunk as string)
    expect(asset.headers()['cross-origin-resource-policy']).toBe('same-origin')
    expect(asset.headers()['content-security-policy']).toBeUndefined()
    expect(asset.headers()['x-content-type-options']).toBe('nosniff')
  })
})

// Plain Playwright test: these violations are deliberate.
base('a script the site did not ship is refused; Trusted Types report a sink without blocking it', async ({ page }) => {
  await page.goto('/now')
  await page.evaluate(() => {
    const w = window as unknown as { __violations: { directive: string; disposition: string; blocked: string }[] }
    w.__violations = []
    document.addEventListener('securitypolicyviolation', (e) =>
      w.__violations.push({ directive: e.effectiveDirective, disposition: e.disposition, blocked: e.blockedURI }),
    )
  })
  const outcome = await page.evaluate(async () => {
    const w = window as unknown as { __injected?: number; __clicked?: number; __violations: { directive: string; disposition: string }[] }
    const s = document.createElement('script')
    s.textContent = 'window.__injected = 1'
    document.body.appendChild(s)
    const b = document.createElement('button')
    b.setAttribute('onclick', 'window.__clicked = 1')
    document.body.appendChild(b)
    b.click()
    const box = document.createElement('div')
    box.innerHTML = '<b>report-only</b>'
    await new Promise((r) => setTimeout(r, 100))
    return { injected: w.__injected ?? null, clicked: w.__clicked ?? null, html: box.innerHTML, violations: w.__violations }
  })
  base.expect(outcome.injected).toBeNull()
  base.expect(outcome.clicked).toBeNull()
  base.expect(outcome.html).toBe('<b>report-only</b>')
  const enforced = outcome.violations.filter((v) => v.disposition === 'enforce').map((v) => v.directive)
  base.expect(enforced).toContain('script-src-elem')
  base.expect(enforced).toContain('script-src-attr')
  base.expect(outcome.violations.some((v) => v.disposition === 'report' && v.directive === 'require-trusted-types-for')).toBe(true)
  base.expect(outcome.violations.filter((v) => v.directive === 'require-trusted-types-for').every((v) => v.disposition === 'report')).toBe(true)
})

// Report-only violations do not fail the shared fixture; here they must not happen at all.
test('public pages report no Trusted Types violation, on load, on client-side navigation and with the QR panels open', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __tt: string[] }
    w.__tt = []
    document.addEventListener('securitypolicyviolation', (e) => {
      if (e.disposition === 'report') w.__tt.push(`${location.pathname}: ${e.effectiveDirective} ${(e.sample || '').split('|')[0]}`)
    })
  })
  const reported = () => page.evaluate(() => (window as unknown as { __tt: string[] }).__tt.splice(0))
  type NextWindow = { next?: { router: { push: (u: string) => Promise<boolean> } } }
  // Hydrated (next/head and the page effects have written to the DOM), plus a frame for late effects.
  const hydrated = async () => {
    await page.waitForFunction(() => document.readyState === 'complete' && !!(window as unknown as NextWindow).next?.router)
    await page.waitForTimeout(300)
  }
  for (const path of PAGES) {
    await page.goto(path)
    await hydrated()
    expect(await reported(), path).toEqual([])
  }
  // Client-side navigations render the CV and contact pages (e-mail text, vCard QR) in the browser.
  await page.goto('/')
  await hydrated()
  for (const path of ['/cv', '/contact', '/blog', '/work', '/cv/zh', '/about', '/now']) {
    // router.push resolves once the new page has rendered.
    expect(await page.evaluate((u) => (window as unknown as NextWindow).next!.router.push(u), path), path).toBe(true)
    await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`))
    await page.waitForTimeout(300)
    expect(await reported(), `client-side navigation to ${path}`).toEqual([])
  }
  // The WeChat share panel draws its QR code after a click.
  const { items } = (await (await page.request.get('/api/blog/list')).json()) as { items: { slug: string }[] }
  const slug = items[0]?.slug
  test.skip(!slug, 'no published post in this store')
  await page.goto(`/blog/${slug}`)
  const wechat = page.getByRole('group', { name: 'Share' }).getByRole('button', { name: 'WeChat' })
  if (await wechat.count()) {
    await wechat.click()
    const qr = page.getByRole('img', { name: /^QR code of / })
    await expect(qr.locator('svg path')).toHaveCount(1)
    await expect(qr.locator('svg')).toHaveAttribute('viewBox', /^0 0 \d+ \d+$/)
  }
  expect(await reported(), 'article with the QR panel open').toEqual([])
})

test.describe('proxy', () => {
  test('legacy CV link, admin gate and CSRF behave as before', async ({ request }) => {
    const cv = await request.get('/cv?lang=zh&print=1', { maxRedirects: 0 })
    expect(cv.status()).toBe(308)
    expect(cv.headers()['location']).toMatch(/\/cv\/zh\?print=1$/)
    expect(cv.headers()['content-security-policy']).toBeTruthy()

    const gate = await request.get('/admin/system?view=errors', { maxRedirects: 0 })
    expect(gate.status()).toBe(307)
    const loc = new URL(gate.headers()['location'], 'http://x.invalid')
    expect(loc.pathname).toBe('/admin/login')
    expect(loc.searchParams.get('next')).toBe('/admin/system?view=errors')
    expect(gate.headers()['cache-control']).toContain('no-store')

    const api = await request.get('/api/admin/inbox', { headers: { cookie: 'cv_admin_token=not-a-token' } })
    expect(api.status()).toBe(401)
    expect(await api.json()).toEqual({ error: 'Unauthorized', code: 'NO_SESSION' })

    const cross = await request.post('/api/admin/inbox', { headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, data: '{}' })
    expect(cross.status()).toBe(403)
    expect((await cross.json()).code).toBe('CSRF')

    const session = await request.get('/api/admin/session')
    expect(session.status()).toBe(200)
  })
})

// ── Admin ──────────────────────────────────────────────────────────────────

async function adminJson(page: Page, method: string, url: string, body?: unknown): Promise<{ status: number; json: any }> {
  return page.evaluate(
    async ([m, u, b]) => {
      const res = await fetch(u as string, { method: m as string, headers: { 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) })
      return { status: res.status, json: await res.json().catch(() => null) }
    },
    [method, url, body] as const,
  )
}

test.describe('admin', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test('a browser that signed out cannot load an admin page with its old cookie', async ({ browser, page, baseURL }) => {
    await loginAsAdmin(page)
    const other = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
    try {
      const otherPage = await other.newPage()
      await loginAsAdmin(otherPage, { fresh: true })
      await otherPage.goto('/admin/system')
      await expect(otherPage).toHaveURL(/\/admin\/system/)
      const oldCookies = await other.cookies()
      expect(oldCookies.some((c) => c.name === 'cv_admin_token')).toBe(true)

      expect((await adminJson(otherPage, 'POST', '/api/admin/logout')).status).toBe(200)
      // Put the revoked token back, as a copied cookie would be.
      await other.addCookies(oldCookies)
      const res = await otherPage.goto('/admin/system?view=errors')
      await expect(otherPage).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fsystem%3Fview%3Derrors$/)
      expect(res?.status()).toBe(200)
      expect((await adminJson(otherPage, 'GET', '/api/admin/inbox')).status).toBe(401)

      // This browser's own session is untouched.
      await page.goto('/admin/system')
      await expect(page.getByRole('heading', { name: 'System', level: 1 })).toBeVisible()
    } finally {
      await other.close()
    }
  })

  test('CSP and Trusted Types reports reach the Errors panel, labelled', async ({ page, request, baseURL }) => {
    test.skip(!isLocal(baseURL || ''), 'files reports: local builds only')
    // Letters only: stored stacks are scrubbed of numbers, hex runs and tokens (lib/errors/scrub.ts).
    const marker = `securityb${Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')}`
    const doc = `${baseURL}/blog/e2e`
    const tt = await request.post('/api/e', {
      headers: { 'content-type': 'application/csp-report', 'user-agent': VISITOR_UA },
      data: JSON.stringify({
        'csp-report': {
          'document-uri': doc,
          'effective-directive': 'require-trusted-types-for',
          disposition: 'report',
          'blocked-uri': 'trusted-types-sink',
          // Not hex-like before ".js": chunk hashes are removed from script URLs (stableScriptUrl).
          'source-file': `${baseURL}/e2e/${marker}-tt.js`,
          'script-sample': 'Element innerHTML|<b>sample text never stored</b>',
        },
      }),
    })
    expect(tt.status()).toBe(204)
    const enforced = await request.post('/api/e', {
      headers: { 'content-type': 'application/reports+json', 'user-agent': VISITOR_UA },
      data: JSON.stringify([
        { type: 'csp-violation', url: doc, body: { documentURL: doc, disposition: 'enforce', effectiveDirective: 'script-src-elem', blockedURL: 'inline', sourceFile: `${baseURL}/e2e/${marker}-enforced.js` } },
      ]),
    })
    expect(enforced.status()).toBe(204)

    await loginAsAdmin(page)
    const list = await adminJson(page, 'GET', '/api/admin/errors?status=all')
    expect(list.status).toBe(200)
    const mine = (list.json.errors as { fingerprint: string; kind: string; message: string; stack: string | null; path: string | null }[]).filter((e) =>
      (e.stack || '').includes(marker),
    )
    try {
      const ttRow = mine.find((e) => e.kind === 'trusted-types')
      expect(ttRow?.message).toBe('Trusted Types (report-only): Element innerHTML got a plain string')
      expect(ttRow?.path).toBe('/blog/e2e')
      expect(mine.find((e) => e.kind === 'csp')?.message).toBe('Refused script-src-elem: inline')
      expect(JSON.stringify(mine)).not.toContain('sample text never stored')

      await page.goto('/admin/system?view=errors')
      await expect(page.getByText('Trusted Types (report-only)').first()).toBeVisible()
      await settle(page)
      expect(await seriousA11yViolations(page)).toEqual([])
    } finally {
      if (mine.length) await adminJson(page, 'DELETE', '/api/admin/errors', { fingerprints: mine.map((e) => e.fingerprint) })
    }
  })
})
