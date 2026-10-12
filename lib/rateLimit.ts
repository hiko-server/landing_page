import type { NextApiRequest } from 'next'

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 10_000

/**
 * Optional allow-list of reverse-proxy addresses (comma separated). When set,
 * client-IP headers are only believed if the TCP peer is one of these, so a
 * request that reaches the app port directly can't spoof a fresh IP per call.
 * Unset (default) keeps the previous behaviour: trust Cloudflare / nginx headers.
 */
const TRUSTED_PROXIES = (process.env.TRUSTED_PROXY_IPS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

function peerOf(req: NextApiRequest): string {
  return ((req.socket?.remoteAddress as string) || 'unknown').replace(/^::ffff:/, '')
}

export function ipFromReq(req: NextApiRequest): string {
  const peer = peerOf(req)
  if (TRUSTED_PROXIES.length && !TRUSTED_PROXIES.includes(peer)) return peer
  // Cloudflare fronts this site and sets CF-Connecting-IP to the real client
  // address (CF overwrites it at its edge). Prefer it, then nginx's X-Real-IP,
  // before falling back to the socket peer. The left-most X-Forwarded-For hop
  // is attacker-supplied and deliberately ignored.
  const cf = req.headers['cf-connecting-ip']
  if (typeof cf === 'string' && cf.trim()) return cf.trim()
  const realIp = req.headers['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim()
  return peer
}

function sweep(now: number) {
  if (buckets.size < MAX_BUCKETS) return
  buckets.forEach((b, k) => {
    if (b.resetAt <= now) buckets.delete(k)
  })
  // Still full (sustained flood of unique keys) → drop the oldest half.
  if (buckets.size >= MAX_BUCKETS) {
    const keys = Array.from(buckets.keys())
    for (let i = 0; i < keys.length / 2; i++) buckets.delete(keys[i])
  }
}

/**
 * Fixed-window limiter, keyed per (route, client IP) so browsing one endpoint
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
  const key = `${route}|${ipFromReq(req)}`
  const now = Date.now()
  sweep(now)
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs
    buckets.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: limit - 1, resetAt }
  }
  if (bucket.count < limit) {
    bucket.count += 1
    return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt }
  }
  return { allowed: false, remaining: 0, resetAt: bucket.resetAt }
}
