import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { verifyAdminToken } from './lib/adminAuth/proxyGate'
import { getConfiguredSiteValues, getIndexNowKey, getPublicHost, hostnameOf } from './lib/env'
import { checkCsrf, isCsrfProtectedPath, isFormLikeContentType, isUnsafeMethod, siteHostsFrom } from './lib/security/csrf'
import { applySecurityHeaders } from './lib/security/responseHeaders'

/**
 * Root proxy (Next 16's name for middleware; it runs on the Node.js runtime,
 * in the server process, before any page or API route).
 *
 * Four responsibilities:
 *
 * 0.  **Redirects** (GET/HEAD only, 308 so the method and body survive):
 *     - plain-HTTP requests for the configured public host (SITE_URL /
 *       NEXT_PUBLIC_SITE_HOST, never a loopback name) go to the same URL on
 *       https. The scheme the visitor used comes from Cloudflare's
 *       `cf-visitor` header, else `x-forwarded-proto`. /api/health is never
 *       redirected (probes talk plain HTTP to the container).
 *     - the legacy `/cv?lang=zh|cn` goes to `/cv/zh`, keeping the other
 *       query parameters (e.g. `print=1`).
 *     - a trailing slash goes (`/about/` → `/about`, any method, query kept;
 *       trailingSlashRedirect). Next's own redirect for it is off
 *       (next.config.js skipTrailingSlashRedirect): it answered before this
 *       proxy and Next drops every collected header on a redirect, so the
 *       slash form of a share or review link (/cv/r/<token>/,
 *       /review/<token>/) went out without its private / no-store, noindex
 *       and no-referrer headers, and every slash redirect without the CSP.
 *     The IndexNow key file `/<INDEXNOW_KEY>.txt` is rewritten (not
 *     redirected) to /api/indexnow-key; only the configured key matches.
 *
 * 1.  **Security headers** for every response (lib/security/responseHeaders.ts):
 *     the hash-based CSP, the Trusted Types report-only policy, the
 *     Reporting API endpoint, COOP / CORP, Permissions-Policy, HSTS, frame
 *     and sniffing protection. Applied unconditionally, redirects and
 *     refusals included.
 *
 * 2.  **CSRF guard** for state-changing requests (POST/PUT/PATCH/DELETE) to
 *     /api/admin/*, /api/auth/*, /api/cvdata, /api/home, /api/versions and
 *     /api/mongo (policy: lib/security/csrf.ts). Cross-site requests get 403;
 *     form-encoded, multipart and text/plain bodies get 415 — every real
 *     client of these endpoints sends JSON (or no body).
 *
 * 3.  **Admin gate** for `/admin/*` and `/api/admin/*`: guests are
 *     redirected to `/admin/login?next=<original>` (pages) or answered JSON
 *     401 (APIs) before anything renders. The session check
 *     (lib/adminAuth/proxyGate.ts) verifies the JWT signature AND
 *     revocation — the session version in data/admin.json and the auth.db
 *     session row — so a signed-out browser cannot load an admin page shell
 *     either. Every API route still checks the session itself (lib/auth.ts).
 *
 *     Whitelisted public admin routes (login, forgot, reset) stay
 *     reachable. The session/check endpoint stays public so the login
 *     page can poll it without a redirect loop, and so does ORCID's
 *     redirect URI, which authorises itself (isPublicAdminApi).
 */

// Routes under /admin and /api/admin that MUST stay reachable while logged
// out. Anything else is gated.
const PUBLIC_ADMIN_PAGE_PATHS = new Set<string>([
  '/admin/login',
  '/admin/forgot',
  '/admin/reset',
])
const PUBLIC_ADMIN_API_PATHS = new Set<string>([
  '/api/admin/session', // header + /admin/login ask this; answers { authenticated } for everyone
  '/api/admin/logout',  // logging out doesn't require an active session
])
// Auth lives under /api/auth/*, never /api/admin/*, so it's not gated here.

/**
 * True for /api/admin/* requests that must work without a session. Besides
 * the fixed allow-list, `GET /api/admin/draft?disable=1` (the Draft Mode bar's
 * Exit link) is public: leaving Draft Mode must keep working after the session
 * ended (logout, expiry). That branch only clears the bypass cookie and
 * validates its redirect path; enabling Draft Mode still needs a session.
 *
 * `GET /api/admin/orcid/callback` is ORCID's redirect URI: the browser
 * arrives there from orcid.org, a cross-site navigation that does not carry
 * the SameSite=Strict session cookie. The route authorises itself — it acts
 * only for the signed, single-use flow cookie (SameSite=Lax, that path only)
 * which /api/admin/orcid/connect issued to a signed-in session, and only
 * while that session is still live (lib/orcid/flow, lib/orcid/connectRoute).
 * Without one it changes nothing and only links back to the Studio.
 */
export function isPublicAdminApi(pathname: string, method: string, searchParams: URLSearchParams): boolean {
  if (PUBLIC_ADMIN_API_PATHS.has(pathname)) return true
  if (pathname === '/api/admin/orcid/callback') return method === 'GET'
  return pathname === '/api/admin/draft' && method === 'GET' && searchParams.get('disable') === '1'
}

/** 403 / 415 for unsafe requests that fail the CSRF policy, else null. */
function csrfRejection(req: NextRequest, pathname: string): NextResponse | null {
  if (!isUnsafeMethod(req.method) || !isCsrfProtectedPath(pathname)) return null
  const verdict = checkCsrf({
    method: req.method,
    secFetchSite: req.headers.get('sec-fetch-site'),
    origin: req.headers.get('origin'),
    host: req.headers.get('host'),
    forwardedHost: req.headers.get('x-forwarded-host'),
    siteHosts: siteHostsFrom(...getConfiguredSiteValues()),
  })
  if (!verdict.ok) {
    return NextResponse.json({ error: 'Cross-site request refused', code: 'CSRF' }, { status: 403 })
  }
  if (isFormLikeContentType(req.headers.get('content-type'))) {
    return NextResponse.json(
      { error: 'Send the request body as application/json', code: 'UNSUPPORTED_MEDIA_TYPE' },
      { status: 415 },
    )
  }
  return null
}

/** The scheme the visitor used, as reported by the proxy in front of us (lower-case), or ''. */
export function forwardedScheme(headers: Headers): string {
  const visitor = headers.get('cf-visitor')
  if (visitor) {
    try {
      const scheme = (JSON.parse(visitor) as { scheme?: unknown }).scheme
      if (typeof scheme === 'string' && scheme) return scheme.toLowerCase()
    } catch {
      /* malformed: fall through to x-forwarded-proto */
    }
  }
  return (headers.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase()
}

/** Legacy language parameter values of /cv that mean the Chinese CV. */
const LEGACY_ZH_LANG = new Set(['zh', 'cn'])

/**
 * 308 redirect for this request, or null. Pure function of the request (and
 * the configured public host), so it is unit-tested with NextRequest fixtures.
 */
export function edgeRedirect(req: NextRequest, publicHost: string | null = getPublicHost()): NextResponse | null {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null
  const { pathname, search } = req.nextUrl

  if (publicHost && pathname !== '/api/health' && forwardedScheme(req.headers) === 'http') {
    const host = hostnameOf(req.headers.get('host') || '')
    if (host === publicHost) {
      return NextResponse.redirect(`https://${publicHost}${pathname}${search}`, 308)
    }
  }

  if (pathname === '/cv') {
    const lang = (req.nextUrl.searchParams.get('lang') || '').trim().toLowerCase()
    if (LEGACY_ZH_LANG.has(lang)) {
      const url = req.nextUrl.clone()
      url.pathname = '/cv/zh'
      url.searchParams.delete('lang')
      return NextResponse.redirect(url, 308)
    }
  }
  return null
}

/**
 * 308 from `/path/` to `/path` (the query kept), or null: the redirect Next
 * makes itself unless `skipTrailingSlashRedirect` is set (it is — see the
 * module comment), done here so it carries the security headers. Every
 * path but `/`, every method (308 keeps the method and body). Next's data
 * requests (client-side navigation, `x-nextjs-data`) and its own `/_next/`
 * files are left to Next. Repeated slashes collapse, so the Location can
 * never read as a protocol-relative `//host` address.
 */
export function trailingSlashRedirect(req: NextRequest): NextResponse | null {
  const { pathname } = req.nextUrl
  if (pathname === '/' || !pathname.endsWith('/')) return null
  if (req.headers.has('x-nextjs-data') || pathname.startsWith('/_next/')) return null
  // A plain URL: a NextURL remembers the trailing slash it was parsed with and would put it back.
  const url = new URL(req.nextUrl.href)
  url.pathname = pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/'
  return NextResponse.redirect(url, 308)
}

/**
 * True for the IndexNow key file: exactly `/<key>.txt` for the configured,
 * well-formed INDEXNOW_KEY (read at runtime). The file must sit at the site
 * root because a key file only authorises URLs in its own directory and
 * below; any other `.txt` path, and every path while IndexNow is off, is
 * left alone.
 */
export function isIndexNowKeyPath(pathname: string, key: string | null = getIndexNowKey()): boolean {
  return key !== null && pathname === `/${key}.txt`
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  const redirect = edgeRedirect(req) ?? trailingSlashRedirect(req)
  if (redirect) return applySecurityHeaders(redirect, { pathname, adminContext: false })

  if (isIndexNowKeyPath(pathname)) {
    const target = req.nextUrl.clone()
    target.pathname = '/api/indexnow-key'
    target.search = ''
    return applySecurityHeaders(NextResponse.rewrite(target), { pathname, adminContext: false })
  }

  const isAdminPage = pathname === '/admin' || pathname.startsWith('/admin/')
  const isAdminApi = pathname.startsWith('/api/admin/')

  const rejected = csrfRejection(req, pathname)
  if (rejected) return applySecurityHeaders(rejected, { pathname, adminContext: true })

  if (isAdminPage || isAdminApi) {
    const allowed = isAdminPage
      ? PUBLIC_ADMIN_PAGE_PATHS.has(pathname)
      : isPublicAdminApi(pathname, req.method, req.nextUrl.searchParams)

    if (!allowed && (await verifyAdminToken(req.cookies.get('cv_admin_token')?.value)) !== 'ok') {
      if (isAdminApi) {
        // APIs: return JSON 401 instead of redirecting (clients expect that).
        const res = NextResponse.json({ error: 'Unauthorized', code: 'NO_SESSION' }, { status: 401 })
        return applySecurityHeaders(res, { pathname, adminContext: true })
      }
      // Pages: redirect to login, preserve where they meant to go.
      const url = req.nextUrl.clone()
      url.pathname = '/admin/login'
      url.search = ''
      url.searchParams.set('next', pathname + (req.nextUrl.search || ''))
      return applySecurityHeaders(NextResponse.redirect(url), { pathname, adminContext: true })
    }
  }

  return applySecurityHeaders(NextResponse.next(), { pathname, adminContext: isAdminPage || isAdminApi })
}

export const config = {
  // /_next/image is not excluded: the optimizer is disabled (images.unoptimized)
  // and answers 404, which gets the security headers like everything else.
  // The two exclusions are not documents and run no script; next.config.js
  // gives them the page-independent headers (lib/securityHeaders.js).
  matcher: ['/((?!_next/static|favicon.ico).*)'],
}
