import crypto from 'crypto'
import { formatIp, parseIp } from '../security/ip'
import { ipv6Network48 } from '../security/ipNetwork'
import type { FixedWindowLimiter } from '../security/rateLimitCore'

/**
 * Abuse budgets for the analytics beacon (lib/analytics/ingest). Each one is
 * far above what real readers produce, so they only ever bite a script.
 *
 * What one real visitor sends: one page-view event per page (deduplicated
 * client-side, lib/analytics/client) plus at most five Web Vitals (LCP, INP,
 * CLS, FCP, TTFB) for the hard-loaded landing page — ~6 events for a visit
 * that reads one page, ~15 for a ten-page visit.
 *
 * Two identities, both coarse and in memory only:
 *   client   the IPv4 address or IPv6 /64 (lib/rateLimit clientKey)
 *   network  the IPv6 /48 (lib/security/ipNetwork) or IPv4 /24 — one
 *            customer allocation / hosting block, which a single actor can
 *            rotate through address by address (65,536 /64s in a /48)
 */

/**
 * Events (not beacons) per client per minute. 120 is two events a second for
 * a full minute: someone clicking to a new page every second (60 page views)
 * plus their landing page's vitals stays under it; only a shared NAT address
 * with many simultaneous readers could come close, and it would lose a few
 * vitals, not visits. A beacon carries up to 10 events, so the old limit of
 * 120 beacons allowed 1,200 events a minute.
 */
export const CLIENT_EVENTS_PER_MIN = 120
/** Events per network per minute: five clients at their full budget at once. */
export const NETWORK_EVENTS_PER_MIN = 600
/**
 * Raw rows one client may add per UTC day: ~500 one-page visits. With
 * DAILY_RAW_CAP = 200 000 an attacker now needs ~67 addresses (in ~20
 * different networks) to fill the day's budget instead of one.
 */
export const CLIENT_DAILY_SHARE = 3_000
/** Raw rows one network may add per UTC day (5 % of DAILY_RAW_CAP). */
export const NETWORK_DAILY_SHARE = 10_000
/**
 * Most identities tracked for the daily shares. Each entry is a 16-char hash
 * and a counter (~100 bytes), so the map stays around 2 MB at most.
 */
export const MAX_SHARE_KEYS = 20_000

/** The coarse network of a normalised address (IPv6 /48, IPv4 /24), or null when unparseable. */
export function networkOf(ip: string): string | null {
  const v6 = ipv6Network48(ip)
  if (v6) return v6
  const addr = parseIp(ip)
  if (!addr || addr.v !== 4) return null
  return `${formatIp({ v: 4, bytes: [...addr.bytes.slice(0, 3), 0] })}/24`
}

/**
 * Take up to `n` units from a fixed-window counter, one hit per unit (the
 * shared limiter counts hits, so this is how an N-event beacon costs N).
 * Returns how many were granted; stops at the first refusal.
 */
export function takeUnits(limiter: FixedWindowLimiter, key: string, limit: number, n: number, windowMs: number, now: number): number {
  let granted = 0
  while (granted < n && limiter.hit(key, limit, windowMs, now).allowed) granted++
  return granted
}

export type DailyShares = {
  /** Rows `key` may still add on `day` under `limit`. */
  remaining(key: string, day: string, limit: number): number
  /** Record `n` rows added by `key` on `day`. */
  add(key: string, day: string, n: number): void
  size(): number
}

/**
 * Per-identity row counters for one UTC day, reset when the day changes.
 *
 * Keys are hashed with the caller's daily salt before they are stored, so the
 * map never holds an address. Memory is bounded: at `maxKeys`, the half with
 * the lowest counts is evicted — those identities had used little of their
 * share, so forgetting them gives nothing useful back, while a heavy sender
 * cannot get its own counter evicted without out-sending ~maxKeys/2 others.
 */
export function createDailyShares(salt: (day: string) => Buffer, maxKeys = MAX_SHARE_KEYS): DailyShares {
  let current = ''
  let used = new Map<string, number>()

  const roll = (day: string) => {
    if (day !== current) {
      current = day
      used = new Map()
    }
  }
  const hashed = (key: string, day: string) =>
    crypto.createHash('sha256').update(salt(day)).update(`\nshare\n${key}`).digest('base64url').slice(0, 16)
  const evict = () => {
    const byCount = Array.from(used.entries()).sort((a, b) => a[1] - b[1])
    for (let i = 0; i < byCount.length / 2; i++) used.delete(byCount[i][0])
  }

  return {
    remaining(key, day, limit) {
      roll(day)
      return Math.max(0, limit - (used.get(hashed(key, day)) || 0))
    },
    add(key, day, n) {
      if (n <= 0) return
      roll(day)
      const h = hashed(key, day)
      const prev = used.get(h)
      if (prev === undefined && used.size >= maxKeys) evict()
      used.set(h, (prev || 0) + n)
    },
    size: () => used.size,
  }
}
