#!/usr/bin/env node
/**
 * Purge the Cloudflare cache after a deploy (scripts/deploy.sh runs it inside
 * the new container: `docker exec <container> node scripts/edge-purge.mjs`).
 *
 * Why: every build has new chunk names, and the ISR pages are edge-cacheable
 * (scripts/cloudflare-config.mjs), so an edge copy of the previous build's
 * HTML would keep pointing at scripts the new image does not have.
 *
 * Credentials: the same CF_ZONE_ID + CF_API_TOKEN (a token with Cache Purge)
 * the app uses for its on-demand purges (lib/revalidate.ts notifyEdge), read
 * from the container's environment — the token never leaves the server.
 *
 *   1. `purge_everything` — one request, also covers every post, case study
 *      and query-string variant.
 *   2. If Cloudflare refuses that, the public pages, feeds and API responses
 *      the cache rules make cacheable, plus every page the sitemap lists
 *      (posts, case studies), by URL in batches of 30.
 *
 *   node scripts/edge-purge.mjs [--dry-run] [--base http://127.0.0.1:3000]
 *
 * --dry-run prints what would be purged and sends nothing. --base is where
 * the sitemap is read for step 2 (default: this container's server).
 * Exit codes: 0 purged (or dry run), 3 not configured (nothing sent),
 * 1 the purge failed. Never prints the token.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { CACHEABLE_EXACT_PATHS, CACHEABLE_PREFIXES } from './cloudflare-config.mjs'

const API = 'https://api.cloudflare.com/client/v4'
/** Cloudflare accepts at most 30 URLs per purge-by-URL request (as lib/revalidate.ts). */
export const PURGE_BATCH_SIZE = 30
export const PURGE_TIMEOUT_MS = 10_000
export const EXIT = { purged: 0, failed: 1, skipped: 3 }

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'])

/** @typedef {Record<string, string | undefined>} Env */

/**
 * CF_ZONE_ID + CF_API_TOKEN, or null when either is unset (lib/env getCloudflarePurgeConfig).
 * @param {Env} [env]
 */
export function purgeConfig(env = process.env) {
  const zoneId = (env.CF_ZONE_ID || '').trim()
  const apiToken = (env.CF_API_TOKEN || '').trim()
  return zoneId && apiToken ? { zoneId, apiToken } : null
}

/**
 * The public host from SITE_URL / NEXT_PUBLIC_SITE_HOST, never a loopback name (lib/env getPublicHost).
 * @param {Env} [env]
 */
export function publicHost(env = process.env) {
  for (const value of [env.SITE_URL, env.NEXT_PUBLIC_SITE_HOST]) {
    const raw = (value || '').trim()
    if (!raw) continue
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
      const host = url.hostname.toLowerCase().replace(/\.$/, '')
      if (host && !LOOPBACK.has(host) && !host.endsWith('.localhost') && !/^127\./.test(host))
        return host
    } catch {
      // Not a URL: try the next one.
    }
  }
  return null
}

/** Paths from a sitemap's <loc> entries on `host` that the cache rules make cacheable. */
export function sitemapPaths(xml, host) {
  const out = []
  for (const m of String(xml || '').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    try {
      const url = new URL(m[1].replace(/&amp;/g, '&'))
      if (url.hostname.toLowerCase() !== host) continue
      const p = url.pathname
      if (CACHEABLE_EXACT_PATHS.includes(p) || CACHEABLE_PREFIXES.some((pre) => p.startsWith(pre)))
        out.push(p)
    } catch {
      // Not a URL.
    }
  }
  return out
}

/** Every URL the by-URL fallback purges: the cacheable exact paths plus the sitemap's pages. */
export function fallbackUrls(host, extraPaths = []) {
  const paths = new Set([...CACHEABLE_EXACT_PATHS, ...extraPaths])
  return Array.from(paths, (p) => `https://${host}${p}`)
}

async function cfPurge(fetchFn, { zoneId, apiToken }, body) {
  try {
    const res = await fetchFn(`${API}/zones/${encodeURIComponent(zoneId)}/purge_cache`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PURGE_TIMEOUT_MS),
    })
    const json = await res.json().catch(() => null)
    if (res.ok && json?.success) return { ok: true }
    const errors = (json?.errors || [])
      .slice(0, 3)
      .map((e) => `${e.code ?? '?'} ${e.message ?? ''}`.trim())
    return {
      ok: false,
      error: `HTTP ${res.status}${errors.length ? `: ${errors.join('; ')}` : ''}`,
    }
  } catch (err) {
    return {
      ok: false,
      error: err?.name === 'TimeoutError' ? 'timeout' : String(err?.message || err),
    }
  }
}

/**
 * Purge the zone: everything, else the cacheable URLs in batches.
 * `sitemap()` is only called for the fallback and may fail (its pages are
 * then left to the edge TTL cap, lib/edgeHtmlTtl.ts).
 *
 * @param {{ env?: Env, fetchFn?: typeof fetch, sitemap?: () => Promise<string>, dryRun?: boolean, log?: (msg: string) => void }} [options]
 * @returns {Promise<{ status: 'purged' | 'skipped' | 'failed' | 'dry-run', method: 'everything' | 'urls' | null, urls: number, errors: string[] }>}
 */
export async function purgeEdge({
  env = process.env,
  fetchFn = (...args) => fetch(...args),
  sitemap = async () => '',
  dryRun = false,
  log = () => {},
} = {}) {
  const config = purgeConfig(env)
  if (!config) return { status: 'skipped', method: null, urls: 0, errors: [] }
  if (dryRun) {
    log(`would purge everything in zone ${config.zoneId} (then by URL if that is refused)`)
    return { status: 'dry-run', method: 'everything', urls: 0, errors: [] }
  }
  const everything = await cfPurge(fetchFn, config, { purge_everything: true })
  if (everything.ok) return { status: 'purged', method: 'everything', urls: 0, errors: [] }

  const errors = [`purge_everything refused (${everything.error})`]
  log(`${errors[0]} — purging by URL instead`)
  const host = publicHost(env)
  if (!host) {
    errors.push('no public host (SITE_URL / NEXT_PUBLIC_SITE_HOST) to build URLs from')
    return { status: 'failed', method: 'urls', urls: 0, errors }
  }
  let extra = []
  try {
    extra = sitemapPaths(await sitemap(), host)
  } catch (err) {
    errors.push(
      `sitemap unreadable (${err?.message || err}); posts and case studies keep the edge TTL cap`
    )
  }
  const urls = fallbackUrls(host, extra)
  let purged = 0
  for (let i = 0; i < urls.length; i += PURGE_BATCH_SIZE) {
    const files = urls.slice(i, i + PURGE_BATCH_SIZE)
    const r = await cfPurge(fetchFn, config, { files })
    if (r.ok) purged += files.length
    else errors.push(`batch of ${files.length} refused (${r.error})`)
  }
  return {
    status: purged === urls.length ? 'purged' : 'failed',
    method: 'urls',
    urls: purged,
    errors,
  }
}

/**
 * @param {string[]} [argv]
 * @param {Env} [env]
 */
export async function main(argv = process.argv.slice(2), env = process.env) {
  const dryRun = argv.includes('--dry-run')
  const baseIdx = argv.indexOf('--base')
  const base = baseIdx >= 0 ? argv[baseIdx + 1] : `http://127.0.0.1:${env.PORT || '3000'}`
  const say = (msg) => console.log(`[edge-purge] ${msg}`)
  const result = await purgeEdge({
    env,
    dryRun,
    log: say,
    sitemap: async () => {
      const res = await fetch(`${base}/sitemap.xml`, { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.text()
    },
  })
  for (const e of result.errors) say(`warning: ${e}`)
  switch (result.status) {
    case 'skipped':
      say('not configured (CF_ZONE_ID + CF_API_TOKEN): nothing purged')
      return EXIT.skipped
    case 'dry-run':
      return EXIT.purged
    case 'purged':
      say(
        result.method === 'everything'
          ? 'purged the whole zone'
          : `purged ${result.urls} URL(s) one by one`
      )
      return EXIT.purged
    default:
      say(`FAILED (${result.urls} URL(s) purged)`)
      return EXIT.failed
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main()
}
