import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test as base, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * Shared E2E fixtures.
 *
 * Every test automatically fails on:
 *   - console.error (React hydration errors #418/#425 land here),
 *   - uncaught page errors,
 *   - Content-Security-Policy violations of the enforced policy (a
 *     `securitypolicyviolation` listener installed with addInitScript
 *     collects them into window.__csp and forwards each one to the test,
 *     across navigations; report-only Trusted Types reports are not failures).
 * Failed loads of third-party resources and of the GitHub proxy routes are
 * ignored: the GitHub API is rate-limited or unreachable in CI, and the site
 * degrades to an honest empty state there.
 */

const IGNORED_FIRST_PARTY = [/^\/api\/github\//]

/** True for console errors that are not the site's fault (see above). */
export function isIgnorableConsoleError(text: string, url: string | undefined, origin: string): boolean {
  if (!/^Failed to load resource|net::ERR_/.test(text) || !url) return false
  try {
    const u = new URL(url)
    if (u.origin !== origin) return true
    return IGNORED_FIRST_PARTY.some((re) => re.test(u.pathname))
  } catch {
    return false
  }
}

/**
 * WebKit applies the CSP's `upgrade-insecure-requests` to a plain-http
 * loopback origin (Chromium and Firefox treat 127.0.0.1 / localhost as
 * potentially trustworthy and do not), so against an http test server every
 * script, stylesheet and font would be upgraded to https and fail. For the
 * WebKit project on http only, documents are served with that one directive
 * removed; the rest of the policy is enforced (and violations reported) as
 * usual, and production is https anyway. Redirects are passed through as
 * they are, so the browser follows them itself.
 */
async function serveWithoutHttpsUpgrade(page: Page, origin: string): Promise<void> {
  await page.route(
    (url) => url.origin === origin,
    async (route) => {
      if (!route.request().isNavigationRequest()) return route.fallback()
      const response = await route.fetch({ maxRedirects: 0 })
      const headers = { ...response.headers() }
      const csp = headers['content-security-policy']
      if (csp) {
        headers['content-security-policy'] = csp
          .split(';')
          .map((d) => d.trim())
          .filter((d) => d && d !== 'upgrade-insecure-requests')
          .join('; ')
      }
      await route.fulfill({ response, headers })
    },
  )
}

/**
 * Every test is its own client. The server limits requests per client
 * address (lib/rateLimit.ts: e.g. 30 post saves per 10 minutes, 20 contact
 * nonces per 5 minutes, 10 sign-ins per 5 minutes), and a whole run against
 * one server otherwise comes from a single address (127.0.0.1, or the
 * Docker gateway in the container gate), so the suite's later specs would
 * get 429s from budgets the earlier ones spent. Each test therefore sends a
 * documentation address (RFC 5737 TEST-NET-1/2/3) in cf-connecting-ip. The
 * server believes that header only from a trusted proxy peer — loopback or
 * the container's gateway, exactly where Cloudflare's tunnel arrives in
 * production (lib/security/proxyTrust.ts) — so nothing changes for a
 * request from anywhere else, and against production Cloudflare replaces
 * the header with the real address anyway. Workers running at the same time
 * hold different parallel slots, and slot s only ever uses addresses
 * s, s + W, s + 2W … (W workers) from an offset that changes per run, so no
 * two concurrent tests — and no test of a rerun against the same server
 * inside a limit window — share a budget. The header goes on the context,
 * so the page, its fetches, `page.request` and any `browser.newContext()`
 * of the test carry it; a spec that sets its own cf-connecting-ip (per
 * visitor, page.setExtraHTTPHeaders) still wins.
 */
const TEST_NETS = ['192.0.2', '198.51.100', '203.0.113'] as const
const HOSTS_PER_NET = 254
const ADDRESSES = TEST_NETS.length * HOSTS_PER_NET
const RUN_OFFSET = process.ppid % ADDRESSES
let testsInWorker = 0

function testClientAddress(slot: number, workers: number, n: number): string {
  const i = (RUN_OFFSET + slot + Math.max(1, workers) * n) % ADDRESSES
  return `${TEST_NETS[Math.floor(i / HOSTS_PER_NET)]}.${(i % HOSTS_PER_NET) + 1}`
}

type Fixtures = { pageGuard: void }

export const test = base.extend<Fixtures>({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, use, testInfo) => {
    const address = testClientAddress(testInfo.parallelIndex, testInfo.config.workers, testsInWorker++)
    await use({ 'cf-connecting-ip': address, ...extraHTTPHeaders })
  },
  pageGuard: [
    async ({ page, baseURL, browserName }, run) => {
      const origin = new URL(baseURL || 'http://127.0.0.1:3000').origin
      if (browserName === 'webkit' && origin.startsWith('http:')) await serveWithoutHttpsUpgrade(page, origin)
      const problems: string[] = []
      // Pages a test deliberately opens as 404s: the browser logs the failed
      // document load (and Next's data request for the same path) as console
      // errors, which are expected there.
      const expected404 = new Set<string>()
      const consoleErrors: { text: string; url?: string }[] = []
      page.on('response', (res) => {
        if (res.status() === 404 && res.request().isNavigationRequest()) expected404.add(new URL(res.url()).pathname)
      })
      await page.exposeFunction('__e2eReportCsp', (line: string) => {
        problems.push(`CSP violation: ${line}`)
      })
      await page.addInitScript(() => {
        const w = window as unknown as { __csp: string[]; __e2eReportCsp?: (line: string) => void }
        w.__csp = []
        document.addEventListener('securitypolicyviolation', (e) => {
          // The Trusted Types policy is report-only (lib/csp.js): its reports are
          // the point of it and change nothing on the page.
          if (e.disposition === 'report') return
          const line = `${e.effectiveDirective} blocked ${e.blockedURI || '(inline)'} at ${e.sourceFile || location.href}:${e.lineNumber}`
          w.__csp.push(line)
          w.__e2eReportCsp?.(line)
        })
      })
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return
        if (isIgnorableConsoleError(msg.text(), msg.location().url, origin)) return
        consoleErrors.push({ text: msg.text(), url: msg.location().url })
      })
      page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`))

      await run()

      for (const { text, url } of consoleErrors) {
        if (url && /^Failed to load resource: .*\b404\b/.test(text)) {
          const p = new URL(url).pathname
          const dataFor = p.match(/^\/_next\/data\/[^/]+(\/.*)\.json$/)?.[1]
          if (expected404.has(p) || (dataFor && expected404.has(dataFor))) continue
        }
        problems.push(`console.error: ${text}${url ? ` (${url})` : ''}`)
      }

      expect(problems, 'console errors, page errors or CSP violations').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/**
 * Wait until web fonts are in and no finite CSS/WAAPI animation is still
 * running (infinite ones such as a status pulse are ignored), so contrast
 * and layout checks see the settled page.
 */
export async function settle(page: Page, timeout = 6000): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await page
    .waitForFunction(
      () =>
        document.getAnimations().every((a) => {
          const end = a.effect?.getComputedTiming().endTime
          return a.playState !== 'running' || end === Infinity || end === undefined
        }),
      undefined,
      { timeout },
    )
    .catch(() => undefined)
}

export type AxeViolation = { id: string; impact: string | null | undefined; help: string; targets: string[] }

/** axe-core over WCAG 2.0/2.1/2.2 A + AA; returns serious and critical violations only. */
export async function seriousA11yViolations(page: Page): Promise<AxeViolation[]> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }))
}

export type TargetOffender = { label: string; width: number; height: number }

/**
 * WCAG 2.2 SC 2.5.8 (Target Size, Minimum) over every visible link and
 * button: at least 24×24 CSS px, or — the spacing exception — a 24 px circle
 * centred on the target does not intersect any other target's box or the
 * circle of another undersized target. Inline links inside text and anything
 * inside article prose are exempt (the SC's inline exception), as are
 * visually-hidden elements (e.g. the skip link before it is focused).
 */
export async function undersizedTargets(page: Page): Promise<TargetOffender[]> {
  return page.evaluate(() => {
    const MIN = 24
    const R = MIN / 2
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('a[href], button, [role="button"], input[type="checkbox"], input[type="radio"]'))
    const targets = nodes.filter((el) => {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false
      if (el.closest('[aria-hidden="true"], [inert], .article-prose, .sr-only')) return false
      const r = el.getBoundingClientRect()
      if (r.width <= 1 || r.height <= 1) return false
      // Inline exception: an inline link that sits in a run of text.
      const parentText = (el.parentElement?.textContent || '').trim()
      const ownText = (el.textContent || '').trim()
      return !(getComputedStyle(el).display === 'inline' && parentText !== ownText)
    })
    const boxes = targets.map((el) => {
      const r = el.getBoundingClientRect()
      return { el, x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height }
    })
    // Nested targets (a button inside a link) count once: the outer one.
    const top = boxes.filter((b) => !boxes.some((o) => o !== b && o.el.contains(b.el)))
    const small = top.filter((b) => b.w < MIN || b.h < MIN)
    const centre = (b: (typeof boxes)[number]) => ({ cx: b.x + b.w / 2, cy: b.y + b.h / 2 })
    const circleHitsBox = (cx: number, cy: number, b: (typeof boxes)[number]) => {
      const nx = Math.max(b.x, Math.min(cx, b.x + b.w))
      const ny = Math.max(b.y, Math.min(cy, b.y + b.h))
      return (cx - nx) ** 2 + (cy - ny) ** 2 < R * R
    }
    const offenders = small.filter((b) => {
      const { cx, cy } = centre(b)
      return top.some((o) => {
        if (o === b) return false
        if (circleHitsBox(cx, cy, o)) return true
        if (o.w < MIN || o.h < MIN) {
          const c = centre(o)
          return (cx - c.cx) ** 2 + (cy - c.cy) ** 2 < (2 * R) ** 2
        }
        return false
      })
    })
    return offenders.map((b) => ({
      label: `${b.el.tagName.toLowerCase()} "${(b.el.getAttribute('aria-label') || b.el.textContent || '').trim().slice(0, 40)}"`,
      width: Math.round(b.w),
      height: Math.round(b.h),
    }))
  })
}

/** Admin credentials from the job env (the CI container is started with the same values). */
export const ADMIN = { email: process.env.ADMIN_EMAIL || '', password: process.env.ADMIN_PASS || '' }

/**
 * A clean-up request to the admin API outside the page, so nothing is logged
 * to the page's console when the thing is already gone. The page's cookies
 * are passed by hand: the request context leaves the session cookie out
 * over plain http (it is Secure in a production build), which made every
 * clean-up a silent 401 on http://127.0.0.1. Resolves to the status (0 when
 * the request failed); deleting needs a recent sign-in (lib/adminAuth/stepUp).
 */
export async function adminCleanup(page: Page, method: 'DELETE' | 'POST', url: string, body?: unknown): Promise<number> {
  const cookie = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
  const res = await page.request
    .fetch(url, { method, headers: { 'Content-Type': 'application/json', cookie }, data: body === undefined ? undefined : JSON.stringify(body) })
    .catch(() => null)
  return res ? res.status() : 0
}

/** Fill and submit the real login form (the page is on /admin/login) and wait for the admin portal. */
async function submitLoginForm(page: Page): Promise<void> {
  // Required fields carry a visual "*" in their label, hence the prefix match.
  await page.getByLabel(/^email/i).fill(ADMIN.email)
  await page.getByLabel(/^password/i).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL((url) => url.pathname.startsWith('/admin') && url.pathname !== '/admin/login')
}

/**
 * Where this test run keeps its shared admin session for an origin. Workers
 * are children of the one runner process, so its pid names the run.
 */
function sharedSessionFile(origin: string): string {
  const host = new URL(origin).host.replace(/[^a-z0-9.-]/gi, '_')
  return path.join(os.tmpdir(), `e2e-admin-session-${host}-${process.ppid}.json`)
}

function readSharedCookies(file: string): Parameters<ReturnType<Page['context']>['addCookies']>[0] | null {
  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf8')) as { cookies?: Parameters<ReturnType<Page['context']>['addCookies']>[0] }
    return Array.isArray(state.cookies) && state.cookies.length ? state.cookies : null
  } catch {
    return null
  }
}

/**
 * Land on the admin portal signed in.
 *
 * The login route allows 10 attempts per client address per 5 minutes, and
 * the merged suite has more admin tests than that, all from 127.0.0.1. So by
 * default every test of a run shares ONE session per origin: the first test
 * signs in through the real form (under a lock file, so parallel workers do
 * not race) and saves the cookies; the others reuse them, and sign in again
 * only when that session has ended (a test signed it out, or it expired).
 * `fresh: true` always signs in through the form — for tests that need a
 * session of their own (a second browser, a session they will end).
 */
export async function loginAsAdmin(page: Page, opts: { fresh?: boolean } = {}): Promise<void> {
  await page.goto('/admin/login')
  if (opts.fresh) return submitLoginForm(page)
  const origin = new URL(page.url()).origin
  const file = sharedSessionFile(origin)
  const lock = `${file}.lock`
  const signedIn = async () => {
    await page.goto('/admin')
    return !new URL(page.url()).pathname.startsWith('/admin/login')
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const cookies = readSharedCookies(file)
    if (cookies) {
      await page.context().addCookies(cookies)
      if (await signedIn()) return
      fs.rmSync(file, { force: true })
    }
    let holder = false
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx' })
      holder = true
    } catch {
      /* another worker is signing in: wait for its session below */
    }
    if (holder) {
      try {
        await page.goto('/admin/login')
        await submitLoginForm(page)
        await page.context().storageState({ path: file })
      } finally {
        fs.rmSync(lock, { force: true })
      }
      return
    }
    const deadline = Date.now() + 30_000
    while (!fs.existsSync(file) && fs.existsSync(lock) && Date.now() < deadline) await page.waitForTimeout(250)
  }
  await page.goto('/admin/login')
  await submitLoginForm(page)
}
