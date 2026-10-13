import { ServerResponse, type OutgoingHttpHeaders } from 'http'

/**
 * `Cache-Control: no-transform` on every HTML document — SERVER-ONLY,
 * installed once at startup by instrumentation.ts.
 *
 * Why: Cloudflare injects its Web Analytics beacon
 * (static.cloudflareinsights.com) into proxied HTML when the zone has
 * automatic setup on — which Cloudflare can switch on by itself. The site
 * promises no third-party analytics scripts (/colophon), so the CSP blocks
 * the beacon, and every page view then logged a CSP violation. Cloudflare
 * does not rewrite a response whose Cache-Control carries `no-transform`, so
 * the beacon is never added.
 *
 * Why here: each page's cache policy is computed by Next.js (no-store for
 * server-rendered pages, s-maxage / stale-while-revalidate for ISR — the
 * edge cache rules rely on it) and only set when nothing set it earlier. So
 * the directive is appended at the moment the headers are written, when the
 * final Content-Type and Cache-Control are known, instead of replacing the
 * policy up front.
 *
 * Only HTML: scripts, styles, images and API responses stay transformable,
 * so Cloudflare keeps serving them with Brotli. (HTML now travels with the
 * origin's gzip: a few KB per page.)
 */

const NO_TRANSFORM_RE = /(?:^|,)\s*no-transform\s*(?:,|$)/i

/** `value` with the `no-transform` directive (unchanged when it has one). */
export function withNoTransform(value: string): string {
  const v = value.trim()
  if (!v) return 'no-transform'
  return NO_TRANSFORM_RE.test(v) ? v : `${v}, no-transform`
}

const isHtml = (contentType: unknown): boolean =>
  typeof contentType === 'string' && /^\s*text\/html\b/i.test(contentType)

/** Header value from a writeHead() headers object, matched case-insensitively. */
function headerIn(headers: OutgoingHttpHeaders, name: string): { key: string; value: unknown } | null {
  for (const [key, value] of Object.entries(headers)) if (key.toLowerCase() === name) return { key, value }
  return null
}

type Proto = typeof ServerResponse.prototype & { __htmlNoTransform?: boolean }

/**
 * Patch ServerResponse.prototype.writeHead (Node's implicit header write on
 * the first write() / end() goes through it too). Idempotent.
 */
export function installHtmlNoTransform(proto: Proto = ServerResponse.prototype as Proto): void {
  if (proto.__htmlNoTransform) return
  const original = proto.writeHead
  proto.writeHead = function writeHead(this: ServerResponse, statusCode: number, ...rest: unknown[]) {
    try {
      // writeHead(status, [statusMessage], [headers]): headers passed here win over setHeader().
      const last = rest[rest.length - 1]
      const passed = last && typeof last === 'object' && !Array.isArray(last) ? (last as OutgoingHttpHeaders) : null
      const type = (passed && headerIn(passed, 'content-type')?.value) ?? this.getHeader('content-type')
      if (isHtml(type)) {
        const cc = passed ? headerIn(passed, 'cache-control') : null
        if (cc) passed![cc.key] = withNoTransform(String(cc.value ?? ''))
        else this.setHeader('Cache-Control', withNoTransform(String(this.getHeader('cache-control') ?? '')))
      }
    } catch {
      // Never let the header tweak break a response.
    }
    return (original as (...a: unknown[]) => ServerResponse).call(this, statusCode, ...rest)
  } as typeof proto.writeHead
  proto.__htmlNoTransform = true
}
