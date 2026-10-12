/**
 * Cross-site request forgery policy for the state-changing JSON endpoints.
 *
 * Pure (no Node APIs) — evaluated by the edge middleware before any API route
 * runs, and reused by handlers that want the same answer.
 *
 * A request to a protected path with an unsafe method is accepted when:
 *   1. `Sec-Fetch-Site` is `same-origin` (our own pages) or `none` (typed into
 *      the address bar / bookmarks) — modern browsers always send it; else
 *   2. an `Origin` header is present and its host equals the request host
 *      (`Host` / `X-Forwarded-Host`) or a configured site host
 *      (SITE_URL / NEXT_PUBLIC_SITE_HOST); else
 *   3. neither header is present at all — that is a non-browser client (curl,
 *      scripts), which carries no ambient cookie a third-party page could
 *      abuse. It still needs a valid admin cookie for anything privileged.
 * Anything else — `Sec-Fetch-Site: cross-site|same-site` without a matching
 * Origin, `Origin: null`, a foreign Origin — is refused.
 *
 * Separately, form-encoded / multipart / text-plain bodies are refused (415):
 * those are the only content types a cross-site <form> or a no-preflight
 * fetch can send, and every legitimate client of these endpoints sends JSON.
 */

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const PROTECTED_PREFIXES = ['/api/admin/', '/api/auth/']
const PROTECTED_EXACT = new Set(['/api/cvdata', '/api/home', '/api/versions', '/api/mongo'])

/** Content types a cross-site page can send without a CORS preflight. */
const FORM_LIKE_TYPES = new Set(['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'])

export function isUnsafeMethod(method: string | undefined | null): boolean {
  return UNSAFE_METHODS.has(String(method || '').toUpperCase())
}

export function isCsrfProtectedPath(pathname: string): boolean {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return PROTECTED_EXACT.has(p) || PROTECTED_PREFIXES.some((prefix) => (p + '/').startsWith(prefix))
}

/** True for the media types a cross-site form can post ("text/plain;charset=UTF-8" included). */
export function isFormLikeContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false
  const media = contentType.split(';')[0].trim().toLowerCase()
  return FORM_LIKE_TYPES.has(media)
}

/**
 * Lower-case host[:port] with a trailing root dot and default ports removed,
 * so "Lucian-Dev.com:443", "lucian-dev.com." and the host of
 * "https://lucian-dev.com" all compare equal.
 */
export function normalizeHost(raw: string | null | undefined): string {
  if (!raw) return ''
  let h = raw.split(',')[0].trim().toLowerCase()
  h = h.replace(/:(80|443)$/, '')
  h = h.replace(/\.(?=:\d+$)|\.$/, '')
  return h
}

/** host[:port] of an Origin header, or '' for `null`, non-http(s) or malformed values. */
export function originHost(origin: string | null | undefined): string {
  if (!origin || origin === 'null') return ''
  try {
    const u = new URL(origin)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return ''
    return normalizeHost(u.host)
  } catch {
    return ''
  }
}

/**
 * Hosts the site is configured to be served from. Each value may be a full
 * URL ("https://lucian-dev.com") or a bare host ("lucian-dev.com").
 */
export function siteHostsFrom(...values: Array<string | null | undefined>): string[] {
  const out = new Set<string>()
  for (const v of values) {
    const s = (v || '').trim()
    if (!s) continue
    let host = ''
    if (s.includes('://')) {
      try {
        host = new URL(s).host
      } catch {
        host = ''
      }
    } else {
      host = s.split('/')[0]
    }
    const n = normalizeHost(host)
    if (n) out.add(n)
  }
  return Array.from(out)
}

export type CsrfRequest = {
  method: string
  secFetchSite: string | null
  origin: string | null
  host: string | null
  forwardedHost: string | null
  siteHosts: string[]
}

export type CsrfVerdict = { ok: true } | { ok: false; reason: 'cross-site' | 'bad-origin' }

export function checkCsrf(req: CsrfRequest): CsrfVerdict {
  if (!isUnsafeMethod(req.method)) return { ok: true }

  const site = (req.secFetchSite || '').trim().toLowerCase()
  if (site === 'same-origin' || site === 'none') return { ok: true }

  if (req.origin !== null && req.origin !== undefined) {
    const from = originHost(req.origin)
    if (!from) return { ok: false, reason: 'bad-origin' }
    const allowed = new Set<string>(req.siteHosts.map(normalizeHost).filter(Boolean))
    const host = normalizeHost(req.host)
    const fwd = normalizeHost(req.forwardedHost)
    if (host) allowed.add(host)
    if (fwd) allowed.add(fwd)
    return allowed.has(from) ? { ok: true } : { ok: false, reason: 'bad-origin' }
  }

  // A browser-sent Sec-Fetch-Site other than same-origin/none, with no Origin
  // to vouch for it, is a cross-site request.
  if (site) return { ok: false, reason: 'cross-site' }
  return { ok: true }
}
