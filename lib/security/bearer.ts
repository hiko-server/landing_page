import crypto from 'crypto'

/**
 * `Authorization: Bearer <token>` checks for machine clients (the health
 * monitor's HEALTH_TOKEN). The comparison is constant-time: both sides are
 * hashed to the same length first, so neither the token's content nor its
 * length leaks through timing.
 */

/** The token of an `Authorization: Bearer …` header value, or null. */
export function bearerTokenOf(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header
  if (typeof value !== 'string') return null
  const m = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(value)
  return m ? m[1] : null
}

/** True when `header` carries exactly `expected`; always false while `expected` is unset or blank. */
export function bearerMatches(header: string | string[] | undefined, expected: string | undefined): boolean {
  const want = (expected || '').trim()
  const got = bearerTokenOf(header)
  if (!want || got === null) return false
  const digest = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest()
  return crypto.timingSafeEqual(digest(got), digest(want))
}
