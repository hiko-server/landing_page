import { stripTrackingParams } from './tracking'

/**
 * External link checking (pure: the network, the clock and the timers are
 * injected; unit-tested). The server wiring is lib/contentHealth/linkRunner.ts.
 *
 * One check: HEAD, following redirects hop by hop (each hop a separate,
 * re-vetted request), then GET when HEAD is refused (any 4xx/5xx other than
 * 429 / 999, or a reset connection) — many servers answer HEAD wrongly.
 *
 * Verdicts (lychee-style, but stricter about what counts as broken):
 *   ok            2xx, possibly through temporary redirects
 *   moved         every redirect hop is permanent (301 / 308) and the end is
 *                 2xx; `safeMove` when the link can be replaced by the new
 *                 address without review (same site, https, not collapsed to
 *                 the home page or a sign-in page)
 *   broken        404 / 410: the page is gone
 *   failing       5xx, other 4xx, timeouts, DNS and network errors, redirect
 *                 loops — transient until it has failed on runs ≥ 20 h apart
 *   unverifiable  the site refuses automated requests: LinkedIn's 999,
 *                 401 / 403 / 407 / 429, 405 / 406 / 451, a Cloudflare
 *                 challenge — never reported as broken
 *   blocked       the host resolves to a private address (never requested)
 */

export type LinkOutcome = 'ok' | 'moved' | 'broken' | 'failing' | 'unverifiable' | 'blocked'

export type LinkVerdict = {
  outcome: LinkOutcome
  /** Final HTTP status (null for network-level failures). */
  status: number | null
  /** Network error code (DNS, TIMEOUT, NETWORK, REDIRECTS, …) or null. */
  code: string | null
  /** Owner-facing reason for unverifiable / failing / blocked. */
  reason: string | null
  /** moved: the address it ends at, tracking parameters removed. */
  finalUrl: string | null
  safeMove: boolean
}

export type LinkRecord = LinkVerdict & {
  url: string
  checkedAt: number
  /** failing: runs in a row that failed, and when that began. */
  failures: number
  failingSince: number | null
}

/** A failing link becomes an error once it failed on two runs at least this far apart. */
export const FAILING_ESCALATE_MS = 20 * 3_600_000
export const MAX_HOPS = 5

export type HopResponse = {
  status: number
  location: string | null
  headers: Record<string, string | string[] | undefined>
}
export type HopFetcher = (url: string, method: 'HEAD' | 'GET') => Promise<HopResponse>

/** Thrown by a fetcher for network-level failures; `code` is kept in the verdict. */
export type CodedError = Error & { code?: string }

export type Gate = { run<T>(host: string, fn: () => Promise<T>): Promise<T> }

/** The key a link is checked and stored under: its href without the fragment (never sent). */
export function linkKey(url: string): string | null {
  const raw = url.startsWith('//') ? `https:${url}` : url
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    u.hash = ''
    return u.href
  } catch {
    return null
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

const PERMANENT = new Set([301, 308])
const isRedirect = (s: number) => s >= 300 && s < 400 && s !== 304
const UNVERIFIABLE_STATUS = new Set([401, 403, 405, 406, 407, 429, 451, 999])
const SIGN_IN_PATH =
  /(^|\/)(login|log-in|signin|sign-in|sign_in|auth|authorize|sso|consent|accounts?|session)(\/|$|\.)/i

function headerValue(h: HopResponse['headers'], name: string): string {
  const v = h[name]
  return (Array.isArray(v) ? v[0] : v) || ''
}

type Chain = {
  hops: Array<{ url: string; status: number }>
  final: HopResponse | null
  finalUrl: string
  error: CodedError | null
}

async function follow(
  url: string,
  method: 'HEAD' | 'GET',
  fetchHop: HopFetcher,
  gate: Gate
): Promise<Chain> {
  const hops: Chain['hops'] = []
  let current = url
  for (let i = 0; i <= MAX_HOPS; i++) {
    let res: HopResponse
    try {
      res = await gate.run(hostOf(current), () => fetchHop(current, method))
    } catch (err) {
      return { hops, final: null, finalUrl: current, error: err as CodedError }
    }
    if (isRedirect(res.status) && res.location) {
      hops.push({ url: current, status: res.status })
      let next: string
      try {
        next = new URL(res.location, current).href
      } catch {
        return {
          hops,
          final: null,
          finalUrl: current,
          error: Object.assign(new Error('Redirect to an invalid address'), {
            code: 'BAD_REDIRECT',
          }),
        }
      }
      if (next === current || hops.some((h) => h.url === next)) {
        return {
          hops,
          final: null,
          finalUrl: next,
          error: Object.assign(new Error('Redirect loop'), { code: 'REDIRECT_LOOP' }),
        }
      }
      current = next
      continue
    }
    return { hops, final: res, finalUrl: current, error: null }
  }
  return {
    hops,
    final: null,
    finalUrl: current,
    error: Object.assign(new Error('Too many redirects'), { code: 'REDIRECTS' }),
  }
}

/** Is replacing `from` with the permanent target `to` safe without review? */
export function isSafeMove(from: string, to: string): boolean {
  let a: URL
  let b: URL
  try {
    a = new URL(from)
    b = new URL(to)
  } catch {
    return false
  }
  if (b.protocol !== 'https:') return false
  const bare = (h: string) => h.toLowerCase().replace(/^www\./, '')
  if (bare(a.hostname) !== bare(b.hostname)) return false
  if (a.pathname !== '/' && b.pathname === '/') return false
  if (SIGN_IN_PATH.test(b.pathname)) return false
  return true
}

const NETWORK_REASON: Record<string, string> = {
  DNS: 'The domain does not resolve',
  TIMEOUT: 'No answer within 10 s',
  NETWORK: 'The connection failed',
  REDIRECTS: 'Too many redirects',
  REDIRECT_LOOP: 'The redirects go round in a loop',
  BAD_REDIRECT: 'It redirects to an invalid address',
}

function statusReason(status: number): string {
  if (status === 999) return 'LinkedIn answers automated requests with 999'
  if (status === 429) return 'The site rate-limits automated requests (HTTP 429)'
  if (status === 401 || status === 407) return `It needs a sign-in (HTTP ${status})`
  if (status === 403) return 'The site refuses automated requests (HTTP 403)'
  if (status === 451) return 'Not available from the server’s region (HTTP 451)'
  return `HTTP ${status}`
}

function verdictOf(url: string, chain: Chain): LinkVerdict {
  const base = { finalUrl: null, safeMove: false }
  if (chain.error) {
    const code = chain.error.code || 'NETWORK'
    if (code === 'BLOCKED_HOST')
      return {
        ...base,
        outcome: 'blocked',
        status: null,
        code,
        reason: 'It points to a private network address',
      }
    if (code === 'BAD_URL')
      return {
        ...base,
        outcome: 'unverifiable',
        status: null,
        code,
        reason:
          'Not checked: the checker only visits standard web addresses (port 80 / 443, no password in the link)',
      }
    return {
      ...base,
      outcome: 'failing',
      status: null,
      code,
      reason: NETWORK_REASON[code] || chain.error.message || 'The request failed',
    }
  }
  const res = chain.final as HopResponse
  const status = res.status
  if (status >= 200 && status < 300) {
    const permanent = chain.hops.length > 0 && chain.hops.every((h) => PERMANENT.has(h.status))
    if (!permanent) return { ...base, outcome: 'ok', status, code: null, reason: null }
    const finalUrl = stripTrackingParams(chain.finalUrl)
    return {
      outcome: 'moved',
      status,
      code: null,
      reason: null,
      finalUrl,
      safeMove: isSafeMove(url, finalUrl),
    }
  }
  if (status === 404 || status === 410)
    return {
      ...base,
      outcome: 'broken',
      status,
      code: null,
      reason: status === 404 ? 'Not found (HTTP 404)' : 'Gone (HTTP 410)',
    }
  if (UNVERIFIABLE_STATUS.has(status))
    return { ...base, outcome: 'unverifiable', status, code: null, reason: statusReason(status) }
  if (status === 503 && /challenge/i.test(headerValue(res.headers, 'cf-mitigated'))) {
    return {
      ...base,
      outcome: 'unverifiable',
      status,
      code: null,
      reason: 'A bot check (Cloudflare challenge) stands in front of the page',
    }
  }
  if (isRedirect(status))
    return {
      ...base,
      outcome: 'unverifiable',
      status,
      code: null,
      reason: `HTTP ${status} without a target address`,
    }
  return {
    ...base,
    outcome: 'failing',
    status,
    code: null,
    reason: status >= 500 ? `Server error (HTTP ${status})` : `HTTP ${status}`,
  }
}

/** Check one link: HEAD, then GET when HEAD is refused. */
export async function checkLink(
  url: string,
  fetchHop: HopFetcher,
  gate: Gate
): Promise<LinkVerdict> {
  const head = await follow(url, 'HEAD', fetchHop, gate)
  const headStatus = head.final?.status ?? 0
  const retry =
    (head.error && (head.error.code || 'NETWORK') === 'NETWORK') ||
    (!head.error && headStatus >= 400 && headStatus !== 429 && headStatus !== 999)
  if (head.error?.code === 'DEADLINE') throw head.error
  if (!retry) return verdictOf(url, head)
  const get = await follow(url, 'GET', fetchHop, gate)
  if (get.error?.code === 'DEADLINE') throw get.error
  return verdictOf(url, get)
}

/** The stored record after a check (failure streaks continue, success resets them). */
export function nextRecord(
  prev: LinkRecord | undefined,
  v: LinkVerdict,
  url: string,
  now: number
): LinkRecord {
  const failing = v.outcome === 'failing'
  const streak = failing && prev?.outcome === 'failing'
  return {
    ...v,
    url,
    checkedAt: now,
    failures: failing ? (streak ? prev.failures + 1 : 1) : 0,
    failingSince: failing ? (streak && prev.failingSince ? prev.failingSince : now) : null,
  }
}

/** A failing link that has failed long enough to count as broken. */
export function isPersistentFailure(
  r: Pick<LinkRecord, 'outcome' | 'failures' | 'failingSince'>,
  now: number
): boolean {
  return (
    r.outcome === 'failing' &&
    r.failures >= 2 &&
    r.failingSince !== null &&
    now - r.failingSince >= FAILING_ESCALATE_MS
  )
}

// ── Pacing ────────────────────────────────────────────────────────────────

export type GateOptions = {
  /** Requests in flight at once, all hosts together. */
  concurrency: number
  /** Quiet time after a request to a host finishes before the next one to it starts. */
  minGapMs: number
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

/**
 * A polite request gate: at most `concurrency` requests in flight, one per
 * host, and at least `minGapMs` between the end of a request to a host and
 * the start of the next one to it. Waiting requests to other hosts go first,
 * so one slow or busy host never stalls the rest.
 */
export function createHostGate(opts: GateOptions): Gate & { waiting: () => number } {
  const now = opts.now ?? Date.now
  const setTimer = opts.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearTimer =
    opts.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const queue: Array<{ host: string; start: () => void }> = []
  const busy = new Set<string>()
  const nextFree = new Map<string, number>()
  let active = 0
  let timer: unknown = null
  let timerAt = Infinity

  const pump = () => {
    const t = now()
    let soonest = Infinity
    for (let i = 0; i < queue.length && active < opts.concurrency; ) {
      const w = queue[i]
      if (busy.has(w.host)) {
        i++
        continue
      }
      const free = nextFree.get(w.host) ?? 0
      if (free > t) {
        soonest = Math.min(soonest, free)
        i++
        continue
      }
      queue.splice(i, 1)
      busy.add(w.host)
      active++
      w.start()
    }
    if (soonest < Infinity && active < opts.concurrency && soonest < timerAt) {
      if (timer !== null) clearTimer(timer)
      timerAt = soonest
      timer = setTimer(
        () => {
          timer = null
          timerAt = Infinity
          pump()
        },
        Math.max(0, soonest - t)
      )
    }
  }

  return {
    async run<T>(host: string, fn: () => Promise<T>): Promise<T> {
      await new Promise<void>((resolve) => {
        queue.push({ host, start: resolve })
        pump()
      })
      try {
        return await fn()
      } finally {
        busy.delete(host)
        active--
        nextFree.set(host, now() + opts.minGapMs)
        pump()
      }
    },
    waiting: () => queue.length,
  }
}

// ── A run ─────────────────────────────────────────────────────────────────

export type RunLimits = {
  /** Re-check a stored result older than this. */
  maxAgeMs: number
  /** URLs requested per run at most. */
  maxUrls: number
  /** URLs per host per run at most (the rest wait for the next run). */
  perHostMax: number
}

/** Which URLs a run requests: never-checked first, then the oldest results; capped per run and per host. */
export function planRun(
  urls: readonly string[],
  records: Readonly<Record<string, LinkRecord>>,
  now: number,
  limits: RunLimits
): { due: string[]; skipped: number } {
  const stale = urls
    .filter((u) => {
      const r = records[u]
      return !r || now - r.checkedAt >= limits.maxAgeMs
    })
    .sort((a, b) => (records[a]?.checkedAt ?? -1) - (records[b]?.checkedAt ?? -1))
  const perHost = new Map<string, number>()
  const due: string[] = []
  for (const u of stale) {
    if (due.length >= limits.maxUrls) break
    const h = hostOf(u)
    const n = perHost.get(h) ?? 0
    if (n >= limits.perHostMax) continue
    perHost.set(h, n + 1)
    due.push(u)
  }
  return { due, skipped: urls.length - due.length }
}

export type RunDeps = {
  fetchHop: HopFetcher
  gate: Gate
  now: () => number
  /** No new request starts after this time (ms); unfinished URLs keep their old result. */
  deadline: number
  onResult?: (record: LinkRecord, done: number, total: number) => void
}

/** Check `due` URLs (all at once; the gate paces them) and return the updated records. */
export async function runChecks(
  due: readonly string[],
  records: Readonly<Record<string, LinkRecord>>,
  deps: RunDeps
): Promise<{ records: Record<string, LinkRecord>; checked: number; partial: boolean }> {
  const out: Record<string, LinkRecord> = { ...records }
  let done = 0
  let checked = 0
  let partial = false
  const fetchHop: HopFetcher = (url, method) => {
    if (deps.now() > deps.deadline)
      return Promise.reject(
        Object.assign(new Error('Run time budget used up'), { code: 'DEADLINE' })
      )
    return deps.fetchHop(url, method)
  }
  await Promise.all(
    due.map(async (url) => {
      try {
        const verdict = await checkLink(url, fetchHop, deps.gate)
        const record = nextRecord(out[url], verdict, url, deps.now())
        out[url] = record
        checked++
        done++
        deps.onResult?.(record, done, due.length)
      } catch (err) {
        if ((err as CodedError)?.code !== 'DEADLINE') throw err
        partial = true
        done++
      }
    })
  )
  return { records: out, checked, partial }
}
