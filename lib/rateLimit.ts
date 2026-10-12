import type { NextApiRequest } from 'next'
import { getClientIpHeaderName, getTrustedProxySpec } from './env'
import { ipBucket, parseCidrList, pickClientIp, type Cidr } from './security/ip'
import { sharedLimiter } from './security/rateLimitCore'

/**
 * Per-client rate limiting for the Node API routes.
 *
 * Client address (see lib/security/ip.ts):
 *   - TRUST_CLIENT_IP_HEADER names the header that carries the real client IP
 *     (default `cf-connecting-ip`: the site sits behind Cloudflare Tunnel and
 *     Cloudflare overwrites that header at its edge). `none` = socket peer only.
 *   - TRUSTED_PROXY_IPS (IPs and/or CIDRs, comma separated) restricts header
 *     trust to requests whose TCP peer is one of those proxies. Unset = trust
 *     the header from any peer (the app port is bound to 127.0.0.1, so only
 *     the local cloudflared can reach it).
 *   - IPv6 clients are bucketed by /64.
 */

let cachedSpec: string | null = null
let cachedTrusted: Cidr[] = []

function trustedProxies(): Cidr[] {
  const spec = getTrustedProxySpec()
  if (spec !== cachedSpec) {
    cachedSpec = spec
    cachedTrusted = parseCidrList(spec)
  }
  return cachedTrusted
}

/** The client's address, normalised (IPv4 dotted / RFC 5952 IPv6), or 'unknown'. */
export function ipFromReq(req: NextApiRequest): string {
  const headerName = getClientIpHeaderName()
  return pickClientIp({
    peer: String(req.socket?.remoteAddress || 'unknown'),
    headerName,
    headerValue: headerName ? req.headers[headerName] : undefined,
    trusted: trustedProxies(),
  })
}

/** Rate-limit identity of the client: its IPv4 address, or its IPv6 /64. */
export function clientKey(req: NextApiRequest): string {
  return ipBucket(ipFromReq(req))
}

const limiter = () => sharedLimiter('api')

/**
 * Fixed-window limiter, keyed per (route, client) so browsing one endpoint
 * (e.g. the contact nonce fetched on every page view) can't exhaust the
 * budget of another (login, contact submit). `scope` overrides the route key.
 */
export function rateLimit(
  req: NextApiRequest,
  limit: number,
  windowMs: number,
  scope?: string,
): { allowed: boolean; remaining: number; resetAt: number } {
  const route = scope || (req.url || '').split('?')[0] || 'global'
  return limiter().hit(`${route}|${clientKey(req)}`, limit, windowMs)
}
