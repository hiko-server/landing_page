import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import type { LookupFunction } from 'node:net'
import { ipInCidr, parseCidrList, parseIp, type IpAddr } from './ip'

/**
 * Server-side fetch for URLs that come from content or admins (remote image
 * sizing, "import image from URL"). It refuses to reach anything that is not
 * a public internet address, so it cannot be used to probe the VPS, the
 * Docker networks or other services on the host (SSRF).
 *
 *   - http(s) only (http only when allowHttp), no credentials in the URL,
 *     only the default ports (or 443/80 explicitly)
 *   - the host is resolved once, every address is checked against the
 *     reserved ranges below, and the connection is pinned to the vetted
 *     address (custom `lookup`), so DNS rebinding between check and connect
 *     is impossible
 *   - redirects are followed manually (bounded) and every hop is re-checked
 *   - hard timeout and a byte cap on the body
 */

export type SafeFetchCode = 'BAD_URL' | 'BLOCKED_HOST' | 'DNS' | 'TIMEOUT' | 'TOO_LARGE' | 'REDIRECTS' | 'NETWORK'

export class SafeFetchError extends Error {
  readonly code: SafeFetchCode
  constructor(code: SafeFetchCode, message: string) {
    super(message)
    this.name = 'SafeFetchError'
    this.code = code
  }
}

export type SafeFetchOptions = {
  method?: 'GET' | 'HEAD'
  headers?: Record<string, string>
  /** Whole request budget (connect + headers + body), default 5000 ms. */
  timeoutMs?: number
  /** Body byte cap, default 10 MB; exceeded → TOO_LARGE. */
  maxBytes?: number
  /** Default 3. */
  maxRedirects?: number
  allowHttp?: boolean
  /** Test seam: resolve a hostname to addresses (defaults to dns.lookup all). */
  resolve?: (host: string) => Promise<string[]>
}

export type SafeFetchResult = {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: Buffer
  /** Final URL after redirects. */
  url: string
}

// Everything that is not routable public unicast space.
const BLOCKED = parseCidrList(
  [
    // IPv4
    '0.0.0.0/8', // "this" network
    '10.0.0.0/8', // private
    '100.64.0.0/10', // carrier-grade NAT
    '127.0.0.0/8', // loopback
    '169.254.0.0/16', // link-local (cloud metadata lives here)
    '172.16.0.0/12', // private (Docker bridges)
    '192.0.0.0/24', // IETF protocol assignments
    '192.0.2.0/24', // TEST-NET-1
    '192.88.99.0/24', // 6to4 relay
    '192.168.0.0/16', // private
    '198.18.0.0/15', // benchmarking
    '198.51.100.0/24', // TEST-NET-2
    '203.0.113.0/24', // TEST-NET-3
    '224.0.0.0/4', // multicast
    '240.0.0.0/4', // reserved
    '255.255.255.255/32', // broadcast
    // IPv6
    '::/128', // unspecified
    '::1/128', // loopback
    // v4-mapped (::ffff:a.b.c.d) needs no entry: parseIp folds it to IPv4,
    // which is then checked against the IPv4 ranges above. (Listing
    // ::ffff:0:0/96 here would fold to 0.0.0.0/0 and block everything.)
    '64:ff9b::/96', // NAT64 (can reach internal v4)
    '64:ff9b:1::/48', // local-use NAT64
    '100::/64', // discard-only
    '2001::/23', // IETF protocol assignments (incl. Teredo 2001::/32)
    '2001:db8::/32', // documentation
    '2002::/16', // 6to4 (embeds arbitrary v4)
    'fc00::/7', // unique local
    'fe80::/10', // link-local
    'ff00::/8', // multicast
  ].join(','),
)

export function isPublicAddress(raw: string): boolean {
  const addr: IpAddr | null = parseIp(raw)
  if (!addr) return false
  return !BLOCKED.some((cidr) => ipInCidr(addr, cidr))
}

async function defaultResolve(host: string): Promise<string[]> {
  const rows = await dns.promises.lookup(host, { all: true, verbatim: true })
  return rows.map((r) => r.address)
}

function checkUrl(raw: string, allowHttp: boolean): URL {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new SafeFetchError('BAD_URL', 'Not a valid URL')
  }
  if (u.protocol !== 'https:' && !(allowHttp && u.protocol === 'http:')) {
    throw new SafeFetchError('BAD_URL', `Protocol ${u.protocol} is not allowed`)
  }
  if (u.username || u.password) throw new SafeFetchError('BAD_URL', 'Credentials in URLs are not allowed')
  if (u.port && u.port !== '443' && u.port !== '80') throw new SafeFetchError('BAD_URL', `Port ${u.port} is not allowed`)
  if (!u.hostname) throw new SafeFetchError('BAD_URL', 'Missing host')
  return u
}

async function vetHost(hostname: string, resolve: (h: string) => Promise<string[]>): Promise<{ address: string; family: 4 | 6 }> {
  const literal = hostname.replace(/^\[|\]$/g, '')
  let addresses: string[]
  if (parseIp(literal)) {
    addresses = [literal]
  } else {
    if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(hostname)) {
      throw new SafeFetchError('BLOCKED_HOST', 'Host is not public')
    }
    try {
      addresses = await resolve(hostname)
    } catch {
      throw new SafeFetchError('DNS', `Could not resolve ${hostname}`)
    }
  }
  if (!addresses.length) throw new SafeFetchError('DNS', `No address for ${hostname}`)
  // Every answer must be public — otherwise an attacker-controlled zone could
  // mix a public and a private record.
  if (!addresses.every(isPublicAddress)) throw new SafeFetchError('BLOCKED_HOST', 'Host resolves to a non-public address')
  const address = addresses[0]
  return { address, family: parseIp(address)!.v }
}

function requestOnce(
  u: URL,
  pinned: { address: string; family: 4 | 6 },
  opts: Required<Pick<SafeFetchOptions, 'method' | 'maxBytes'>> & { headers: Record<string, string>; deadline: number },
): Promise<SafeFetchResult> {
  return new Promise((resolve, reject) => {
    const lookup: LookupFunction = (_host, options, cb) => {
      if (options && (options as dns.LookupOptions).all) {
        const cbAll = cb as unknown as (err: null, addrs: dns.LookupAddress[]) => void
        cbAll(null, [{ address: pinned.address, family: pinned.family }])
      } else {
        cb(null, pinned.address, pinned.family)
      }
    }
    const lib = u.protocol === 'https:' ? https : http
    const remaining = Math.max(1, opts.deadline - Date.now())
    const req = lib.request(
      u,
      {
        method: opts.method,
        headers: { 'user-agent': 'lucian-dev.com/safe-fetch', accept: '*/*', ...opts.headers },
        lookup,
        // SNI and Host stay the original hostname; only the socket address is pinned.
        servername: u.protocol === 'https:' && !parseIp(u.hostname.replace(/^\[|\]$/g, '')) ? u.hostname : undefined,
        timeout: remaining,
      },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        const declared = Number(res.headers['content-length'] || 0)
        if (opts.method === 'GET' && declared > opts.maxBytes) {
          res.destroy()
          reject(new SafeFetchError('TOO_LARGE', `Response is ${declared} bytes (limit ${opts.maxBytes})`))
          return
        }
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > opts.maxBytes) {
            res.destroy()
            reject(new SafeFetchError('TOO_LARGE', `Response exceeded ${opts.maxBytes} bytes`))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () =>
          resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks), url: u.toString() }),
        )
        res.on('error', (err) => reject(new SafeFetchError('NETWORK', err.message)))
      },
    )
    const timer = setTimeout(() => req.destroy(new SafeFetchError('TIMEOUT', 'Request timed out')), remaining)
    req.on('timeout', () => req.destroy(new SafeFetchError('TIMEOUT', 'Request timed out')))
    req.on('error', (err) => reject(err instanceof SafeFetchError ? err : new SafeFetchError('NETWORK', err.message)))
    req.on('close', () => clearTimeout(timer))
    req.end()
  })
}

export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const method = options.method || 'GET'
  const maxBytes = options.maxBytes ?? 10 * 1024 * 1024
  const maxRedirects = options.maxRedirects ?? 3
  const resolve = options.resolve || defaultResolve
  const deadline = Date.now() + (options.timeoutMs ?? 5000)
  let url = checkUrl(rawUrl, !!options.allowHttp)

  for (let hop = 0; ; hop++) {
    const pinned = await vetHost(url.hostname, resolve)
    if (Date.now() >= deadline) throw new SafeFetchError('TIMEOUT', 'Request timed out')
    const res = await requestOnce(url, pinned, { method, maxBytes, headers: options.headers || {}, deadline })
    const location = res.headers.location
    if (res.status >= 300 && res.status < 400 && typeof location === 'string') {
      if (hop >= maxRedirects) throw new SafeFetchError('REDIRECTS', 'Too many redirects')
      url = checkUrl(new URL(location, url).toString(), !!options.allowHttp)
      continue
    }
    return res
  }
}
