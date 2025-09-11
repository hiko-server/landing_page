import type { NextApiRequest } from 'next'

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

export function ipFromReq(req: NextApiRequest): string {
  const xf = (req.headers['x-forwarded-for'] || '') as string
  if (xf) return xf.split(',')[0].trim()
  // @ts-ignore - Node specific
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

