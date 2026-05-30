import type { NextApiRequest } from 'next'

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

export function ipFromReq(req: NextApiRequest): string {
  // Cloudflare fronts this site and sets CF-Connecting-IP to the real client
  // address, which the client cannot forge (CF overwrites it at its edge).
  // Prefer it, then nginx's X-Real-IP, before falling back to the socket peer.
  //
  // We deliberately do NOT trust the left-most X-Forwarded-For entry any more:
  // that hop is attacker-supplied, so a client could send a fresh fake IP on
  // every request and slip past every IP rate limit (login, contact, reset).
  const cf = req.headers['cf-connecting-ip']
  if (typeof cf === 'string' && cf.trim()) return cf.trim()
  const realIp = req.headers['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim()
  return (req.socket?.remoteAddress as string) || 'unknown'
}

export function rateLimit(req: NextApiRequest, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetAt: number } {
  const ip = ipFromReq(req)
  const now = Date.now()
  const bucket = buckets.get(ip)
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs
    buckets.set(ip, { count: 1, resetAt })
    return { allowed: true, remaining: limit - 1, resetAt }
  }
  if (bucket.count < limit) {
    bucket.count += 1
    return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt }
  }
  return { allowed: false, remaining: 0, resetAt: bucket.resetAt }
}

