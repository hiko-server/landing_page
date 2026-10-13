import type { NextApiResponse } from 'next'
import { getCloudflarePurgeConfig, getIndexNowKey, getPublicHost } from './env'
import { log } from './log'
import { uploadNamesIn } from './uploadVariants'

/**
 * On-demand ISR revalidation.
 *
 * /blog, /work, /now, /uses, the posts, case studies and /colophon are
 * statically generated with a revalidate window. Without this, an admin save
 * only shows up on the public page after that window elapses *and* someone
 * visits twice. Calling `res.revalidate()` right after a successful write
 * regenerates the affected pages immediately, so "Save" means "live".
 *
 * Failures never fail the write itself — the content is already stored; the
 * time-based revalidation is still there as a fallback. The list of paths
 * that could not be refreshed is returned so the API can report it.
 *
 * Every path that did refresh is then handed to the edge (`notifyEdge`):
 * purged from the Cloudflare cache when CF_ZONE_ID + CF_API_TOKEN are set and
 * pushed to IndexNow when INDEXNOW_KEY is set. Both are fire-and-forget.
 */
export async function revalidatePaths(res: NextApiResponse, paths: string[]): Promise<string[]> {
  const unique = Array.from(new Set(paths.filter((p) => typeof p === 'string' && p.startsWith('/'))))
  const failed: string[] = []
  await Promise.all(
    unique.map(async (p) => {
      try {
        await res.revalidate(p)
      } catch (err) {
        failed.push(p)
        log.warn('revalidate failed', { path: p, err })
      }
    }),
  )
  const refreshed = unique.filter((p) => !failed.includes(p))
  if (refreshed.length) void notifyEdge(refreshed)
  return failed
}

export type Collection = 'blog' | 'work'

/** Upper bound on detail pages refreshed for one save (ISR covers the rest). */
export const MAX_SIBLING_PATHS = 50

/**
 * Public paths that render a collection item: the index, the item's detail
 * page and — because every detail page shows prev/next and related links —
 * the other detail pages of the same collection (`siblings`, capped).
 */
export function collectionPaths(collection: Collection, slug?: string, siblings: readonly string[] = []): string[] {
  const base = `/${collection}`
  const out = [base]
  if (slug) out.push(`${base}/${slug}`)
  for (const s of siblings.slice(0, MAX_SIBLING_PATHS)) {
    if (typeof s === 'string' && s && s !== slug) out.push(`${base}/${s}`)
  }
  return Array.from(new Set(out))
}

/** A public page and the content it renders (body, cover URLs, …). */
export type ContentSource = { path: string; text: string }

/**
 * Pages whose content references at least one of the given uploads (original
 * file names, e.g. "photo.png" for /uploads/photo.png). Used after the
 * media-optimize backfill: those pages embed the uploads' srcsets, which only
 * change when they are regenerated.
 */
export function pathsReferencingUploads(names: Iterable<string>, sources: readonly ContentSource[]): string[] {
  const wanted = new Set(names)
  if (!wanted.size) return []
  const out = new Set<string>()
  for (const s of sources) {
    if (typeof s.path !== 'string' || !s.path.startsWith('/')) continue
    if (uploadNamesIn(s.text).some((n) => wanted.has(n))) out.add(s.path)
  }
  return Array.from(out)
}

/**
 * Every statically generated (ISR) public page whose data lives in the content
 * store. The server-rendered pages (/, /about, /cv, /cv/zh, /contact) are
 * fresh on every request and need no revalidation.
 */
export const STATIC_CONTENT_PATHS = ['/blog', '/work', '/now', '/uses', '/colophon'] as const

// ── Edge notifications (Cloudflare purge, IndexNow) ──────────────────────

/** Cloudflare accepts at most 30 URLs per purge-by-URL request. */
export const PURGE_BATCH_SIZE = 30
/** Per-request timeout: a slow CDN API must never hold anything up. */
export const EDGE_TIMEOUT_MS = 3000
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

type FetchFn = typeof fetch

export type EdgeResult = {
  /** URLs Cloudflare confirmed purged, derived ones included (0 when purge is not configured). */
  purged: number
  /** URLs IndexNow accepted (0 when IndexNow is not configured). */
  indexed: number
}

/** Split into chunks of at most `size` (size ≥ 1). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size))
  const out: T[][] = []
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n))
  return out
}

/** Feeds, sitemap and search index list every post and case study. */
const COLLECTION_DERIVED_PATHS = ['/feed.xml', '/feed.json', '/work/feed.xml', '/api/rss.xml', '/sitemap.xml', '/api/search-index']

/**
 * Edge-cached responses derived from the given pages that must be purged with
 * them: a post or case-study change alters the feeds, the sitemap and the
 * search index; /now and /uses bodies are part of the search index.
 */
export function derivedPurgePaths(paths: readonly string[]): string[] {
  const out = new Set<string>()
  for (const p of paths) {
    if (/^\/(blog|work)(\/|$)/.test(p)) COLLECTION_DERIVED_PATHS.forEach((d) => out.add(d))
    else if (p === '/now' || p === '/uses') out.add('/api/search-index')
  }
  return Array.from(out)
}

async function purgeBatch(fetchFn: FetchFn, zoneId: string, apiToken: string, files: string[]): Promise<boolean> {
  try {
    const res = await fetchFn(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/purge_cache`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files }),
      signal: AbortSignal.timeout(EDGE_TIMEOUT_MS),
    })
    const body = (await res.json().catch(() => null)) as { success?: boolean; errors?: { code?: number; message?: string }[] } | null
    if (!res.ok || !body?.success) {
      log.warn('cloudflare purge rejected', { status: res.status, errors: body?.errors?.slice(0, 3), count: files.length })
      return false
    }
    return true
  } catch (err) {
    log.warn('cloudflare purge failed', { err, count: files.length })
    return false
  }
}

/**
 * Where search engines verify the key: `/<key>.txt` at the site root (served
 * by the middleware rewrite to /api/indexnow-key). A key file only
 * authorises URLs in its own directory and below, so anything deeper than
 * the root would leave /blog/* and /work/* unverified.
 */
export function indexNowKeyLocation(host: string, key: string): string {
  return `https://${host}/${key}.txt`
}

async function submitIndexNow(fetchFn: FetchFn, host: string, key: string, urlList: string[]): Promise<boolean> {
  try {
    const res = await fetchFn(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation: indexNowKeyLocation(host, key), urlList }),
      signal: AbortSignal.timeout(EDGE_TIMEOUT_MS),
    })
    if (!res.ok) {
      log.warn('indexnow rejected', { status: res.status, count: urlList.length })
      return false
    }
    return true
  } catch (err) {
    log.warn('indexnow failed', { err, count: urlList.length })
    return false
  }
}

/**
 * Tell the edge that `paths` changed: purge their absolute URLs (plus the
 * feeds / sitemap / search index derived from them) from the Cloudflare cache
 * in batches of ≤30, and submit the page URLs to IndexNow. Each part is
 * env-gated and does nothing without its configuration or without a public
 * host (SITE_URL / NEXT_PUBLIC_SITE_HOST that is not loopback). Never throws.
 */
export async function notifyEdge(paths: readonly string[], fetchFn: FetchFn = (...args) => fetch(...args)): Promise<EdgeResult> {
  const result: EdgeResult = { purged: 0, indexed: 0 }
  try {
    const purge = getCloudflarePurgeConfig()
    const indexNowKey = getIndexNowKey()
    if (!purge && !indexNowKey) return result
    const host = getPublicHost()
    if (!host) {
      log.warn('edge notification skipped: no public host configured (SITE_URL / NEXT_PUBLIC_SITE_HOST)')
      return result
    }
    const pagePaths = Array.from(new Set(paths.filter((p) => typeof p === 'string' && p.startsWith('/'))))
    if (!pagePaths.length) return result
    const abs = (p: string) => `https://${host}${p}`
    const urls = pagePaths.map(abs)

    const tasks: Promise<void>[] = []
    if (purge) {
      const purgeUrls = Array.from(new Set([...pagePaths, ...derivedPurgePaths(pagePaths)])).map(abs)
      for (const files of chunk(purgeUrls, PURGE_BATCH_SIZE)) {
        tasks.push(
          purgeBatch(fetchFn, purge.zoneId, purge.apiToken, files).then((ok) => {
            if (ok) result.purged += files.length
          }),
        )
      }
    }
    if (indexNowKey) {
      tasks.push(
        submitIndexNow(fetchFn, host, indexNowKey, urls).then((ok) => {
          if (ok) result.indexed = urls.length
        }),
      )
    }
    await Promise.all(tasks)
    log.info('edge notified', { pages: urls.length, purged: result.purged, indexed: result.indexed })
  } catch (err) {
    log.warn('edge notification failed', { err })
  }
  return result
}
