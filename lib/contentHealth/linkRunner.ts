import { getPublicHost } from '../env'
import { log } from '../log'
import { SITE_HOST } from '../schema'
import { safeFetch, SafeFetchError } from '../security/safeFetch'
import { currentExternalUrls } from './collect'
import { createHostGate, planRun, runChecks, type HopFetcher, type LinkRecord } from './linkCheck'
import { linkRuntime, readLinkStore, writeLinkStore } from './linkStore'
import type { LinkRunInfo, LinkTrigger } from './types'

/**
 * Runs the external link check on this server (SERVER-ONLY): from the daily
 * schedule (POST /api/internal/content-health) or "Check links now" (POST
 * /api/admin/content-health, started in the background so the request
 * returns at once). One run at a time per process.
 *
 * Politeness and load (one small VPS, 1 vCPU — the work is waiting on the
 * network, not computing):
 *   - every request goes through lib/security/safeFetch (public addresses
 *     only, pinned DNS, hop-by-hop redirects re-vetted, 10 s timeout, GET
 *     bodies cut at 64 KB) with a User-Agent naming the site's link checker
 *   - at most 3 requests in flight, one per host, and 2 s of quiet per host
 *     between two requests to it (lib/contentHealth/linkCheck createHostGate)
 *   - at most 400 URLs per run and 40 per host; never-checked links first,
 *     then the oldest results; an 8-minute budget, after which no new request
 *     starts (the rest keeps its old result and goes first next time)
 *   - a scheduled run re-checks results older than 20 h, "Check links now"
 *     those older than 15 minutes, so repeated clicks do not re-hit sites
 * Results are saved every 25 checks and at the end (lib/contentHealth/linkStore).
 */

export const LINK_CHECK_LIMITS = {
  concurrency: 3,
  minGapMs: 2000,
  timeoutMs: 10_000,
  maxBytes: 64 * 1024,
  maxUrls: 400,
  perHostMax: 40,
  budgetMs: 8 * 60_000,
  scheduledMaxAgeMs: 20 * 3_600_000,
  manualMaxAgeMs: 15 * 60_000,
} as const

export class LinkCheckBusyError extends Error {
  constructor() {
    super('A link check is already running')
    this.name = 'LinkCheckBusyError'
  }
}

export function linkCheckerUserAgent(): string {
  const host = getPublicHost() || SITE_HOST
  return `Mozilla/5.0 (compatible; ${host}-linkcheck/1.0; +https://${host}/)`
}

/** One hop through safeFetch (no automatic redirects, body capped and cut). */
export function safeHopFetcher(): HopFetcher {
  const headers = {
    'user-agent': linkCheckerUserAgent(),
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en,zh;q=0.8',
  }
  return async (url, method) => {
    try {
      const res = await safeFetch(url, {
        method,
        headers,
        redirect: 'manual',
        truncate: true,
        maxBytes: LINK_CHECK_LIMITS.maxBytes,
        timeoutMs: LINK_CHECK_LIMITS.timeoutMs,
        allowHttp: true,
      })
      const location = res.headers.location
      return {
        status: res.status,
        location: typeof location === 'string' ? location : null,
        headers: res.headers,
      }
    } catch (err) {
      if (err instanceof SafeFetchError)
        throw Object.assign(new Error(err.message), { code: err.code })
      throw Object.assign(new Error(err instanceof Error ? err.message : String(err)), {
        code: 'NETWORK',
      })
    }
  }
}

export type LinkRunOptions = {
  fetchHop?: HopFetcher
  /** The URLs to consider (default: everything the public content links to now). */
  urls?: string[]
  now?: () => number
  minGapMs?: number
  setTimer?: (fn: () => void, ms: number) => unknown
}

const FLUSH_EVERY = 25

/** Run a check now and wait for it. Throws LinkCheckBusyError when one is running. */
export async function runLinkCheck(
  trigger: LinkTrigger,
  opts: LinkRunOptions = {}
): Promise<LinkRunInfo> {
  const rt = linkRuntime()
  if (rt.running) throw new LinkCheckBusyError()
  const now = opts.now ?? Date.now
  const startedAt = now()
  rt.running = true
  rt.trigger = trigger
  rt.startedAt = startedAt
  rt.done = 0
  rt.total = 0
  const info: LinkRunInfo = {
    trigger,
    startedAt,
    finishedAt: null,
    checked: 0,
    skipped: 0,
    partial: false,
    error: null,
  }
  try {
    const urls = opts.urls ?? currentExternalUrls()
    const store = readLinkStore()
    const maxAgeMs =
      trigger === 'manual' ? LINK_CHECK_LIMITS.manualMaxAgeMs : LINK_CHECK_LIMITS.scheduledMaxAgeMs
    const plan = planRun(urls, store.links, startedAt, {
      maxAgeMs,
      maxUrls: LINK_CHECK_LIMITS.maxUrls,
      perHostMax: LINK_CHECK_LIMITS.perHostMax,
    })
    rt.total = plan.due.length
    info.skipped = plan.skipped
    const gate = createHostGate({
      concurrency: LINK_CHECK_LIMITS.concurrency,
      minGapMs: opts.minGapMs ?? LINK_CHECK_LIMITS.minGapMs,
      now,
      ...(opts.setTimer ? { setTimer: opts.setTimer } : {}),
    })
    let live: Record<string, LinkRecord> = { ...store.links }
    let sinceFlush = 0
    const result = await runChecks(plan.due, store.links, {
      fetchHop: opts.fetchHop ?? safeHopFetcher(),
      gate,
      now,
      deadline: startedAt + LINK_CHECK_LIMITS.budgetMs,
      onResult: (record, done) => {
        rt.done = done
        live = { ...live, [record.url]: record }
        if (++sinceFlush >= FLUSH_EVERY) {
          sinceFlush = 0
          try {
            writeLinkStore({ version: 1, lastRun: store.lastRun, links: live })
          } catch (err) {
            log.warn('could not save link check progress', { err })
          }
        }
      },
    })
    // Forget links the content no longer references.
    const keep = new Set(urls)
    const links: Record<string, LinkRecord> = {}
    for (const [k, v] of Object.entries(result.records)) if (keep.has(k)) links[k] = v
    info.checked = result.checked
    info.partial = result.partial
    info.finishedAt = now()
    writeLinkStore({ version: 1, lastRun: info, links })
    log.info('link check finished', {
      trigger,
      checked: info.checked,
      skipped: info.skipped,
      partial: info.partial,
    })
    return info
  } catch (err) {
    info.error = err instanceof Error ? err.message : String(err)
    info.finishedAt = now()
    log.error('link check failed', { trigger, err })
    try {
      const store = readLinkStore()
      writeLinkStore({ ...store, lastRun: info })
    } catch {
      // The failure is logged; the old results stay.
    }
    return info
  } finally {
    rt.running = false
    rt.done = 0
    rt.total = 0
  }
}

/** "Check links now": start a run in the background; false when one is already running. */
export function startLinkCheck(trigger: LinkTrigger, opts: LinkRunOptions = {}): boolean {
  if (linkRuntime().running) return false
  void runLinkCheck(trigger, opts).catch((err) => {
    if (!(err instanceof LinkCheckBusyError)) log.error('link check crashed', { err })
  })
  return true
}
