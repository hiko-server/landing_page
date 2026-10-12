import { formatIp, parseIp } from './ip'

/**
 * Coarser rate-limit identity for IPv6 clients: the /48 network.
 *
 * ipBucket() groups IPv6 by /64 (one end-user LAN), but a single customer —
 * or a free tunnel-broker account — is routinely handed a whole /48, which
 * holds 65,536 /64s. Limits keyed by the /48 stop one such allocation from
 * multiplying its budget 65,536-fold. IPv4 addresses (and anything
 * unparseable) return null: they have no meaningful coarser bucket here.
 */
export function ipv6Network48(raw: unknown): string | null {
  const addr = parseIp(raw)
  if (!addr || addr.v !== 6) return null
  const bytes = [...addr.bytes.slice(0, 6), ...new Array<number>(10).fill(0)]
  return `${formatIp({ v: 6, bytes })}/48`
}
