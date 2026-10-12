import type { NextApiRequest } from 'next'
import { getClientIpHeaderName, getTrustedProxySpec } from './env'
import { ipBucket, parseCidrList, pickClientIp, type Cidr } from './security/ip'
import { ipv6Network48 } from './security/ipNetwork'
import { implicitTrustedProxies } from './security/proxyTrust'
import { sharedLimiter } from './security/rateLimitCore'

/**
 * Per-client rate limiting for the Node API routes.
 *
 * Client address (see lib/security/ip.ts):
 *   - TRUST_CLIENT_IP_HEADER names the header that carries the real client IP
 *     (default `cf-connecting-ip`: the site sits behind Cloudflare Tunnel and
 *     Cloudflare overwrites that header at its edge). `none` = socket peer only.
 *   - The header is only believed when the TCP peer is a trusted proxy:
 *     TRUSTED_PROXY_IPS (IPs and/or CIDRs, comma separated) when set;
 *     otherwise loopback plus the container's default gateway
 *     (lib/security/proxyTrust.ts) — exactly where cloudflared's traffic
 *     arrives from through Docker's 127.0.0.1:3002 port mapping. Any other
 *     peer (e.g. a sibling container on a shared Docker network talking to
 *     the container's own address) is keyed by its socket address and cannot
 *     claim a fresh client IP per request.
 *   - IPv6 clients are bucketed by /64; routes that need it can add a /48
 *     limit on top (rateLimitNetwork).
 */

let cachedSpec: string | null = null
let cachedTrusted: Cidr[] = []

function trustedProxies(): Cidr[] {
  const spec = getTrustedProxySpec()
  if (spec !== cachedSpec) {
    cachedSpec = spec
    cachedTrusted = parseCidrList(spec)
  }
  // Blank (or nothing valid in it) never means "trust every peer".
  return cachedTrusted.length ? cachedTrusted : implicitTrustedProxies()
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

/**
 * Like rateLimit, keyed by the client's IPv6 /48 instead of its /64. IPv4
 * clients (already limited per address) are always allowed here.
 */
export function rateLimitNetwork(
  req: NextApiRequest,
  limit: number,
  windowMs: number,
  scope: string,
): { allowed: boolean; remaining: number; resetAt: number } {
  const net = ipv6Network48(ipFromReq(req))
  if (!net) return { allowed: true, remaining: limit, resetAt: 0 }
  return limiter().hit(`${scope}|${net}`, limit, windowMs)
}
