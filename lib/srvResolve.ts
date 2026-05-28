/**
 * Resolve a mongodb+srv://… connection string into the equivalent explicit
 * mongodb://host1,host2,host3/?…  form via DNS-over-HTTPS, so it works on
 * networks where outbound UDP/TCP port 53 is blocked or the local resolver
 * refuses SRV queries (common Windows / corporate / VPN / school setups).
 *
 * Uses Cloudflare's 1.1.1.1 DoH JSON endpoint (HTTPS over port 443, which is
 * almost always allowed). Falls back to dns.google if Cloudflare is blocked.
 *
 * Replicates the same lookup steps the MongoDB Node driver would do
 * internally for mongodb+srv://:
 *   1. SRV record  _mongodb._tcp.<host>    → list of (priority, weight, port, target)
 *   2. TXT record  <host>                  → URL-encoded query params
 *      (authSource, replicaSet, …)
 *   3. SRV implies TLS, so add tls=true if not already in the URL
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

type SrvHost = { host: string; port: number }
type DohAnswer = { name: string; type: number; data: string }
type DohResponse = { Status?: number; Answer?: DohAnswer[] }

const DOH_ENDPOINTS = [
  // Cloudflare uses IP directly so no recursive DNS needed.
  (name: string, type: string) =>
    `https://1.1.1.1/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
  // Google secondary — works if Cloudflare is throttled or blocked.
  (name: string, type: string) =>
    `https://8.8.8.8/resolve?name=${encodeURIComponent(name)}&type=${type}`,
]

async function tryFetchDoh(url: string): Promise<DohResponse> {
  const res = await fetch(url, {
    headers: { Accept: 'application/dns-json' },
    signal: AbortSignal.timeout(6_000),
  })
  if (!res.ok) throw new Error(`DoH HTTP ${res.status}`)
  return (await res.json()) as DohResponse
}

async function tryCurlDoh(url: string): Promise<DohResponse> {
  // Some corporate / China networks reject Node's TLS fingerprint while
  // allowing curl. Spawning curl uses the OS's own TLS stack.
  // Available on Windows 10 1803+, macOS, every Linux distro.
  const { stdout } = await execFileP(
    'curl',
    [
      '-s',
      '--max-time',
      '8',
      '-H',
      'Accept: application/dns-json',
      '-A',
      'Mozilla/5.0 (compatible; hiko.dev mongo-srv-resolver)',
      url,
    ],
    { maxBuffer: 1024 * 1024 },
  )
  if (!stdout.trim()) throw new Error('curl returned empty body')
  return JSON.parse(stdout) as DohResponse
}

async function dohQuery(
  name: string,
  type: 'SRV' | 'TXT',
): Promise<DohAnswer[]> {
  const errors: string[] = []
  for (const buildUrl of DOH_ENDPOINTS) {
    const url = buildUrl(name, type)
    // 1) Try Node's native fetch first (one round-trip, fast in normal nets)
    try {
      const data = await tryFetchDoh(url)
      if (data.Status === 0 && data.Answer) return data.Answer
      if (data.Status !== 0) errors.push(`fetch: status ${data.Status}`)
    } catch (e: any) {
      errors.push(`fetch: ${e?.code || e?.message || e}`)
    }
    // 2) Fall back to spawning `curl` — bypasses Node TLS fingerprint
    //    filtering done by some corporate / region-restricted middleboxes.
    try {
      const data = await tryCurlDoh(url)
      if (data.Status === 0 && data.Answer) return data.Answer
      if (data.Status !== 0) errors.push(`curl: status ${data.Status}`)
    } catch (e: any) {
      errors.push(`curl: ${e?.code || e?.message || e}`)
    }
  }
  throw new Error(
    `All DoH attempts failed for ${type} ${name}: ${errors.join(' | ')}`,
  )
}

async function resolveSrvDoh(srvName: string): Promise<SrvHost[]> {
  const records = await dohQuery(srvName, 'SRV')
  const srv = records
    .filter((a) => a.type === 33)
    .map((a) => {
      // RDATA format: "<priority> <weight> <port> <target>."
      const parts = String(a.data).trim().split(/\s+/)
      const port = Number(parts[2])
      const host = (parts[3] || '').replace(/\.$/, '')
      return { host, port }
    })
    .filter((r) => r.host && Number.isFinite(r.port))
  if (!srv.length) throw new Error(`No SRV records returned for ${srvName}`)
  return srv
}

async function resolveTxtDoh(name: string): Promise<string[]> {
  try {
    const records = await dohQuery(name, 'TXT')
    return records
      .filter((a) => a.type === 16)
      .map((a) => {
        // DoH TXT data: a quoted string (with backslash escapes for embedded
        // quotes). Strip surrounding quotes and unescape.
        const raw = String(a.data || '').trim()
        return raw.replace(/^"|"$/g, '').replace(/\\"/g, '"')
      })
  } catch {
    return []
  }
}

/**
 * If `url` is mongodb+srv://, resolve it to mongodb:// via DoH and return the
 * explicit form. Otherwise return the URL unchanged.
 */
export async function resolveMongoSrvUrl(url: string): Promise<string> {
  if (!url.startsWith('mongodb+srv://')) return url

  // Use URL parser by swapping the scheme so unicode hostnames, optional
  // user-info, and query strings are handled correctly.
  let parsed: URL
  try {
    parsed = new URL(url.replace('mongodb+srv://', 'http://'))
  } catch {
    throw new Error('Malformed mongodb+srv:// connection string')
  }

  const host = parsed.hostname
  if (!host) throw new Error('mongodb+srv URL has no host')

  const auth = parsed.username
    ? `${encodeURIComponent(decodeURIComponent(parsed.username))}:${encodeURIComponent(decodeURIComponent(parsed.password))}@`
    : ''

  const srvName = `_mongodb._tcp.${host}`
  const hosts = await resolveSrvDoh(srvName)
  const hostList = hosts.map((h) => `${h.host}:${h.port}`).join(',')

  // Merge query: start from URL params, then layer TXT records (TXT does not
  // override anything explicitly set by the user).
  const merged = new URLSearchParams(parsed.search)
  const txtLines = await resolveTxtDoh(host)
  for (const line of txtLines) {
    for (const [k, v] of new URLSearchParams(line)) {
      if (!merged.has(k)) merged.set(k, v)
    }
  }
  // mongodb+srv implies TLS
  if (!merged.has('ssl') && !merged.has('tls')) merged.set('tls', 'true')

  // Path segment after host = optional db / + opts. Preserve it as-is.
  const dbPath = parsed.pathname || '/'

  const q = merged.toString()
  return `mongodb://${auth}${hostList}${dbPath}${q ? '?' + q : ''}`
}
