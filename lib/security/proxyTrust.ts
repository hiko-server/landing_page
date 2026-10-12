import fs from 'fs'
import { parseCidr, parseCidrList, type Cidr } from './ip'

/**
 * Which TCP peers may vouch for the client address (cf-connecting-ip, …)
 * when TRUSTED_PROXY_IPS is not set.
 *
 * Production: cloudflared runs on the host and reaches the container through
 * Docker's `127.0.0.1:3002 → 3000` port mapping, so inside the container the
 * socket peer is the gateway of the container's bridge network (Docker's
 * userland proxy connects from there). Requests from that gateway — and from
 * loopback, for `next start` on a workstation or a sidecar in the same
 * network namespace — are believed. Any other peer (a sibling container on a
 * shared network, a LAN host reaching a published port) is rate-limited by
 * its own socket address, so it cannot claim a fresh client IP per request.
 *
 * The gateway is the default route in /proc/net/route (Linux only), read
 * once and cached. Elsewhere, or when the file can't be read, only loopback
 * is trusted. Note that the host itself (any local process) also connects
 * from the gateway address: the host is inside the trust boundary.
 */

export const LOOPBACK_PROXIES: readonly Cidr[] = parseCidrList('127.0.0.0/8, ::1')

const RTF_UP = 0x1
const RTF_GATEWAY = 0x2

/**
 * Default IPv4 gateway from the text of /proc/net/route, e.g.
 *
 *   Iface  Destination  Gateway   Flags  RefCnt  Use  Metric  Mask      …
 *   eth0   00000000     010012AC  0003   0       0    0       00000000  …
 *
 * Addresses are little-endian hex (010012AC → 172.18.0.1). Returns the
 * dotted address of the first up, gateway-flagged default route, or null.
 */
export function parseDefaultGateway(routeTable: string): string | null {
  for (const line of routeTable.split('\n').slice(1)) {
    const cols = line.trim().split(/\s+/)
    if (cols.length < 8) continue
    const [, destination, gateway, flagsHex, , , , mask] = cols
    if (destination !== '00000000' || mask !== '00000000') continue
    if (!/^[0-9A-Fa-f]{8}$/.test(gateway) || !/^[0-9A-Fa-f]{1,8}$/.test(flagsHex)) continue
    const flags = parseInt(flagsHex, 16)
    if ((flags & RTF_UP) === 0 || (flags & RTF_GATEWAY) === 0) continue
    const n = parseInt(gateway, 16)
    if (n === 0) continue
    return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff].join('.')
  }
  return null
}

/** Loopback plus, when known, the default gateway. */
export function defaultTrustedProxies(gateway: string | null): Cidr[] {
  const gw = gateway ? parseCidr(gateway) : null
  return gw ? [...LOOPBACK_PROXIES, gw] : [...LOOPBACK_PROXIES]
}

let cached: Cidr[] | null = null

/** The implicit proxy list for this process (computed once). */
export function implicitTrustedProxies(): Cidr[] {
  if (cached) return cached
  let gateway: string | null = null
  if (process.platform === 'linux') {
    try {
      gateway = parseDefaultGateway(fs.readFileSync('/proc/net/route', 'utf8'))
    } catch {
      gateway = null
    }
  }
  cached = defaultTrustedProxies(gateway)
  return cached
}
