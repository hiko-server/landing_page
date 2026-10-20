import { buildCsp, buildReportOnlyCsp, REPORTING_ENDPOINTS } from '../csp.js'
import { crossOriginResourcePolicy, STATIC_SECURITY_HEADERS } from '../securityHeaders.js'
import { INLINE_SCRIPT_HASHES } from './inlineScripts'
import { isSharePath } from '../cvShare/links'

/**
 * The security headers proxy.ts puts on every response it handles: the
 * page-independent set (lib/securityHeaders.js, also sent by next.config.js),
 * the hash-based CSP (lib/csp.js + lib/security/inlineScripts.ts), the
 * Trusted Types report-only policy, the Reporting API endpoint both report
 * to, and the per-path Cross-Origin-Resource-Policy. Admin responses also
 * stay out of indexes and caches.
 *
 * The policy strings are built once per process: they depend only on
 * build-time constants and NODE_ENV.
 */

const CSP = buildCsp({ scriptHashes: [...INLINE_SCRIPT_HASHES] })
const CSP_REPORT_ONLY = buildReportOnlyCsp()

/** The enforced CSP the proxy sends (for tests and diagnostics). */
export function contentSecurityPolicy(): string {
  return CSP
}

type HeaderTarget = { headers: Headers }

/** Apply the headers to `res` (returned for chaining). A header the route sets itself later still wins. */
export function applySecurityHeaders<T extends HeaderTarget>(res: T, opts: { pathname: string; adminContext: boolean }): T {
  for (const { key, value } of STATIC_SECURITY_HEADERS) res.headers.set(key, value)
  res.headers.set('Content-Security-Policy', CSP)
  res.headers.set('Content-Security-Policy-Report-Only', CSP_REPORT_ONLY)
  res.headers.set('Reporting-Endpoints', REPORTING_ENDPOINTS)
  res.headers.set('Cross-Origin-Resource-Policy', crossOriginResourcePolicy(opts.pathname))

  // Keep admin pages out of search indexes (defence-in-depth — even with
  // the gate, we don't want googlebot caching the login page).
  if (opts.adminContext) {
    res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
    // Caches between us and the user shouldn't store admin responses.
    res.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate')
  }
  // Review links (H5, pages/review/[token]): a private draft behind a token in
  // the path — never indexed, never cached by Cloudflare, and the token never
  // leaves in a Referer header. The page sets the same; this covers every answer.
  if (isReviewPath(opts.pathname)) {
    res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
    res.headers.set('Cache-Control', 'private, no-store, max-age=0')
    res.headers.set('Referrer-Policy', 'no-referrer')
  }
  // Private share links of CV variants (/cv/r/<token>…, lib/cvShare): the
  // token is in the address, so no response — a 404, an error, a redirect —
  // may be indexed, kept by a cache or quoted in a Referer header.
  if (isSharePath(opts.pathname)) {
    res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
    res.headers.set('Cache-Control', 'private, no-store, max-age=0')
    res.headers.set('Referrer-Policy', 'no-referrer')
  }
  return res
}

/** /review/<token> and its Next data route. */
export function isReviewPath(pathname: string): boolean {
  return pathname.startsWith('/review/') || /^\/_next\/data\/[^/]+\/review\//.test(pathname)
}
