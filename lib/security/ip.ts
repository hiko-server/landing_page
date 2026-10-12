/**
 * Client-IP parsing for rate limits and login throttling.
 *
 * Pure and runtime-neutral (no `net`, no Buffer) so the edge routes
 * (middleware, /api/og) and the Node API routes share one implementation.
 *
 *   - parseIp / formatIp     IPv4 + IPv6 (incl. "::", zone ids, embedded v4),
 *                            IPv4-mapped IPv6 ("::ffff:1.2.3.4") folds to v4.
 *   - parseCidr / ipInCidr   "10.0.0.0/8", "fd00::/8", or a bare address.
 *   - ipBucket               the rate-limit key: IPv4 as-is, IPv6 by /64 —
 *                            one end-user network is handed a whole /64, so
 *                            bucketing per address would let a single client
 *                            rotate through 2^64 fresh identities.
 *   - pickClientIp           which address to believe, given the TCP peer,
 *                            the trusted proxy list and the configured header.
 */

export type IpAddr = { v: 4 | 6; bytes: number[] }
export type Cidr = { addr: IpAddr; prefix: number }

function parseV4(s: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s)
  if (!m) return null
  const out: number[] = []
  for (let i = 1; i <= 4; i++) {
    const part = m[i]
    // "010" is octal in some parsers and decimal in others — refuse the ambiguity.
    if (part.length > 1 && part.startsWith('0')) return null
    const n = Number(part)
    if (n > 255) return null
    out.push(n)
  }
  return out
}

function parseV6(input: string): number[] | null {
  const s = input.replace(/%.*$/, '') // zone id ("fe80::1%eth0")
  if (!s || !/^[0-9a-fA-F:.]+$/.test(s)) return null
  const halves = s.split('::')
  if (halves.length > 2) return null

  const toGroups = (part: string): number[] | null => {
    if (part === '') return []
    const groups: number[] = []
    const pieces = part.split(':')
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i]
      if (i === pieces.length - 1 && p.includes('.')) {
        const v4 = parseV4(p)
        if (!v4) return null
        groups.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3])
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(p)) return null
        groups.push(parseInt(p, 16))
      }
    }
    return groups
  }

  const head = toGroups(halves[0])
  const tail = halves.length === 2 ? toGroups(halves[1]) : []
  if (!head || !tail) return null
  // An embedded IPv4 is only valid in the last position of the whole address.
  if (halves.length === 2 && halves[0].includes('.')) return null

  let groups: number[]
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length
    if (missing < 1) return null
    groups = [...head, ...new Array<number>(missing).fill(0), ...tail]
  } else {
    groups = head
  }
  if (groups.length !== 8) return null

  const bytes: number[] = []
  for (const g of groups) bytes.push((g >> 8) & 0xff, g & 0xff)
  return bytes
}

/** Parse an IPv4/IPv6 literal. Brackets ("[::1]") are accepted; ports are not. */
export function parseIp(raw: unknown): IpAddr | null {
  if (typeof raw !== 'string') return null
  let s = raw.trim()
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1)
  if (!s || s.length > 64) return null
  const v4 = parseV4(s)
  if (v4) return { v: 4, bytes: v4 }
  const v6 = parseV6(s)
  if (!v6) return null
  // ::ffff:a.b.c.d (IPv4-mapped) is the same client as a.b.c.d.
  const mapped = v6.slice(0, 10).every((b) => b === 0) && v6[10] === 0xff && v6[11] === 0xff
  if (mapped) return { v: 4, bytes: v6.slice(12) }
  return { v: 6, bytes: v6 }
}

function v6Groups(bytes: number[]): number[] {
  const groups: number[] = []
  for (let i = 0; i < 16; i += 2) groups.push((bytes[i] << 8) | bytes[i + 1])
  return groups
}

/** Canonical text form (RFC 5952 for IPv6: lowercase, longest zero run compressed). */
export function formatIp(addr: IpAddr): string {
  if (addr.v === 4) return addr.bytes.join('.')
  const groups = v6Groups(addr.bytes)
  let bestStart = -1
  let bestLen = 0
  for (let i = 0; i < 8; ) {
    if (groups[i] !== 0) {
      i++
      continue
    }
    let j = i
    while (j < 8 && groups[j] === 0) j++
    if (j - i > bestLen && j - i >= 2) {
      bestStart = i
      bestLen = j - i
    }
    i = j
  }
  const hex = groups.map((g) => g.toString(16))
  if (bestStart === -1) return hex.join(':')
  const left = hex.slice(0, bestStart).join(':')
  const right = hex.slice(bestStart + bestLen).join(':')
  return `${left}::${right}`
}

/** Normalised address text, or null when `raw` is not an IP literal. */
export function normalizeIp(raw: unknown): string | null {
  const addr = parseIp(raw)
  return addr ? formatIp(addr) : null
}

/**
 * Strip a port from a proxy-header token: "1.2.3.4:5678" → "1.2.3.4",
 * "[2001:db8::1]:443" → "2001:db8::1". Bare IPv6 is left alone.
 */
function stripPort(token: string): string {
  const t = token.trim()
  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(t)
  if (bracket) return bracket[1]
  const v4port = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(t)
  if (v4port) return v4port[1]
  return t
}

/** Parse "10.0.0.0/8", "2001:db8::/32" or a bare address (= a single host). */
export function parseCidr(raw: unknown): Cidr | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s) return null
  const slash = s.indexOf('/')
  const addrPart = slash === -1 ? s : s.slice(0, slash)
  // A v4-mapped v6 literal folds to v4 in parseIp; its prefix must fold too.
  const literalIsV6 = addrPart.includes(':')
  const addr = parseIp(addrPart)
  if (!addr) return null
  const max = addr.v === 4 ? 32 : 128
  if (slash === -1) return { addr, prefix: max }
  const prefixText = s.slice(slash + 1)
  if (!/^\d{1,3}$/.test(prefixText)) return null
  let prefix = Number(prefixText)
  if (literalIsV6 && addr.v === 4) {
    if (prefix < 96) return null
    prefix -= 96
  }
  if (prefix > max) return null
  return { addr, prefix }
}

/** Parse a comma/whitespace separated list, silently dropping invalid entries. */
export function parseCidrList(raw: unknown): Cidr[] {
  if (typeof raw !== 'string') return []
  return raw
    .split(/[\s,]+/)
    .map(parseCidr)
    .filter((c): c is Cidr => c !== null)
}

export function ipInCidr(ip: IpAddr, cidr: Cidr): boolean {
  if (ip.v !== cidr.addr.v) return false
  let bits = cidr.prefix
  for (let i = 0; i < ip.bytes.length && bits > 0; i++) {
    const take = Math.min(8, bits)
    const mask = (0xff << (8 - take)) & 0xff
    if ((ip.bytes[i] & mask) !== (cidr.addr.bytes[i] & mask)) return false
    bits -= take
  }
  return true
}

export function ipInAny(ip: IpAddr | null, list: Cidr[]): boolean {
  return !!ip && list.some((c) => ipInCidr(ip, c))
}

/**
 * Rate-limit bucket for an address: IPv4 verbatim, IPv6 by its /64 network.
 * Anything unparseable shares the single "unknown" bucket (fail closed: it
 * can't be used to mint unlimited fresh buckets).
 */
export function ipBucket(raw: unknown): string {
  const addr = parseIp(raw)
  if (!addr) return 'unknown'
  if (addr.v === 4) return formatIp(addr)
  const net = formatIp({ v: 6, bytes: [...addr.bytes.slice(0, 8), 0, 0, 0, 0, 0, 0, 0, 0] })
  return `${net}/64`
}

export type ClientIpInput = {
  /** TCP peer address; '' on the edge runtime, where no socket is visible. */
  peer: string
  /** Lower-case name of the header to trust; '' disables header trust. */
  headerName: string
  /** Raw value(s) of that header as received. */
  headerValue: string | string[] | undefined | null
  /** Proxies whose headers are believed. Empty = believe the header from any peer. */
  trusted: Cidr[]
}

/**
 * Decide the client address.
 *
 * - With a trusted-proxy list, the header is only believed when the TCP peer
 *   is one of those proxies, so a request reaching the app port directly
 *   can't claim a fresh IP per call.
 * - `x-forwarded-for` is read right-to-left: the right-most entry was written
 *   by the nearest proxy; entries left of it are client-supplied. Hops that
 *   are themselves trusted proxies are skipped.
 * - Single-value headers (cf-connecting-ip, x-real-ip, …) must hold exactly
 *   one valid IP; otherwise the peer is used.
 */
export function pickClientIp(input: ClientIpInput): string {
  const peerAddr = parseIp(stripPort(input.peer || ''))
  const peer = peerAddr ? formatIp(peerAddr) : 'unknown'
  if (!input.headerName) return peer
  // On the edge runtime there is no peer (''); there the header is the only signal.
  if (input.trusted.length && input.peer && !ipInAny(peerAddr, input.trusted)) return peer

  const raw = Array.isArray(input.headerValue) ? input.headerValue.join(',') : input.headerValue || ''
  if (!raw.trim()) return peer

  if (input.headerName === 'x-forwarded-for') {
    const hops = raw.split(',').map((h) => parseIp(stripPort(h)))
    for (let i = hops.length - 1; i >= 0; i--) {
      const hop = hops[i]
      if (!hop) return peer // malformed chain — don't guess
      if (input.trusted.length && ipInAny(hop, input.trusted)) continue
      return formatIp(hop)
    }
    return peer
  }

  if (raw.includes(',')) return peer
  const addr = parseIp(stripPort(raw))
  return addr ? formatIp(addr) : peer
}
