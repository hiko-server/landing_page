import type { NextApiResponse } from 'next'
import { getCloudflarePurgeConfig, getIndexNowKey, getPublicHost } from './env'
import { log } from './log'
import { uploadNamesIn } from './uploadVariants'
import { LLMS_INDEX_PATH, LLMS_PATHS, markdownTwinPaths } from './markdownTwinPaths'
import { invalidateSearchIndex } from './searchIndexCache'

/**
 * On-demand ISR revalidation.
 *
 * /, /about, /cv, /cv/zh, /contact, /blog, /work, /now, /uses, the posts,
 * case studies and /colophon are statically generated with a revalidate window. Without this, an admin save
 * only shows up on the public page after that window elapses *and* someone
 * visits twice. Calling `res.revalidate()` right after a successful write
 * regenerates the affected pages immediately, so "Save" means "live".
 *
 * Failures never fail the write itself — the content is already stored; the
 * time-based revalidation is still there as a fallback. The list of paths
 * that could not be refreshed is returned so the API can report it.
 *
 * `confirm` paths are regenerated a second time once the first pass is done.
 * Next batches regenerations per path: an on-demand revalidation that
 * arrives while a background regeneration of the same page is running (a
 * visitor hit a stale copy just before the save) joins it — and that render
 * read the store BEFORE the write. The second pass always starts after the
 * first finished, so the stored page comes from a render that read the new
 * content. Used where a stale copy matters: hiding a CV entry must take
 * effect (CV_PAGE_PATHS, HOME_PAGE_PATHS).
 *
 * Then the persisted copies of pages that no longer exist are removed
 * (forgetVanishedPages below, lib/isrPages), so a deleted or unpublished
 * page can never come back from disk after a restart.
 *
 * Every save also refreshes the search index (GET /api/search-index: the ⌘K
 * documents and the "Ask" passages): the built copy is marked stale first
 * (lib/searchIndexCache), so the next request rebuilds it from the saved
 * content, and the edge copy is purged with the pages (derivedPurgePaths).
 *
 * Every path that did refresh is then handed to the edge (`notifyEdge`):
 * purged from the Cloudflare cache when CF_ZONE_ID + CF_API_TOKEN are set and
 * pushed to IndexNow when INDEXNOW_KEY is set. Both are fire-and-forget.
 */
export async function revalidatePaths(res: NextApiResponse, paths: string[], opts: { confirm?: readonly string[] } = {}): Promise<string[]> {
  invalidateSearchIndex()
  const unique = Array.from(new Set(paths.filter((p) => typeof p === 'string' && p.startsWith('/'))))
  const failed: string[] = []
  const pass = (list: string[]) =>
    Promise.all(
      list.map(async (p) => {
        try {
          await revalidateSerially(p, () => res.revalidate(p))
        } catch (err) {
          if (!failed.includes(p)) failed.push(p)
          log.warn('revalidate failed', { path: p, err })
        }
      }),
    )
  await pass(unique)
  const again = unique.filter((p) => opts.confirm?.includes(p) && !failed.includes(p))
  if (again.length) await pass(again)
  await forgetVanishedPages()
  const refreshed = unique.filter((p) => !failed.includes(p))
  if (refreshed.length) void notifyEdge(refreshed)
  return failed
}

/**
 * A page that turned into a 404 keeps its last 200 copy on disk, which a
 * restart would serve again (lib/isrCache). Every write that can make a
 * page disappear — deleting, unpublishing or renaming a post or case study,
 * hiding the last paper, a snapshot / backup / Mongo restore, a storage
 * pull — ends here, so this removes the persisted copies of the posts, case
 * studies and /publications page that no longer exist (lib/isrPages). Best
 * effort; it never fails the write.
 */
async function forgetVanishedPages(): Promise<void> {
  try {
    const { forgetVanishedContentPages } = await import('./isrPages')
    const { paths } = forgetVanishedContentPages()
    if (paths.length) log.info('removed the persisted copies of pages that no longer exist', { paths })
  } catch (err) {
    log.warn('could not remove the persisted copies of pages that no longer exist', { err })
  }
}

const runningRevalidations = new Map<string, Promise<void>>()
const followUpRevalidations = new Map<string, Promise<void>>()

/**
 * Run `regenerate` (res.revalidate(path)) without ever joining a render of
 * `path` that is already under way. Next batches concurrent on-demand
 * revalidations of one path into a single render, so a save that lands while
 * an earlier save's render is running would receive that render — made
 * from the content as it was before the second save — and the page would
 * stay stale until its time window (an hour for / and /about) runs out.
 *
 * A request that finds a render running waits for it, then renders again;
 * every request that arrives meanwhile shares that one follow-up render,
 * which starts after all their writes. One Node process serves the site, so
 * process memory is the right scope.
 */
export function revalidateSerially(path: string, regenerate: () => Promise<void>): Promise<void> {
  const running = runningRevalidations.get(path)
  if (!running) {
    const run: Promise<void> = regenerate().finally(() => {
      if (runningRevalidations.get(path) === run) runningRevalidations.delete(path)
    })
    runningRevalidations.set(path, run)
    return run
  }
  const queued = followUpRevalidations.get(path)
  if (queued) return queued
  const followUp = running
    .catch(() => undefined)
    .then(() => {
      followUpRevalidations.delete(path)
      return revalidateSerially(path, regenerate)
    })
  followUpRevalidations.set(path, followUp)
  return followUp
}

export type Collection = 'blog' | 'work'

/** Upper bound on detail pages refreshed for one save (ISR covers the rest). */
export const MAX_SIBLING_PATHS = 50

/**
 * ISR pages that render the home document: / (everything), /about (hero,
 * portrait, socials, availability), /now (hero.currentlyCoding), /contact
 * (contact copy, reasons and their kinds, availability, e-mail / phone) and
 * the CV pages (socials, portrait and availability feed the CV header).
 */
export const HOME_PAGE_PATHS: readonly string[] = ['/', '/about', '/now', '/contact', '/cv', '/cv/zh']

/**
 * ISR pages that render the public CV: / (identity, hero facts, projects,
 * experience, skills, certifications), /about (identity, the CV sections),
 * /now (current roles and studies), /work (the "All projects" archive of
 * every public CV project), the CV itself (/cv, /cv/zh) and /publications
 * (the Publications section — PUBLICATIONS_STATIC_PATHS).
 */
export const CV_PAGE_PATHS: readonly string[] = ['/', '/about', '/now', '/work', '/cv', '/cv/zh', '/publications']

/**
 * Pages outside a collection that a post or case-study save changes: the
 * home page lists the latest writing and links projects and roles to case
 * studies; /about links roles and CV projects to case studies. (The CV pages,
 * CV_DOCUMENT_PATHS, are added by refreshCollection: their skill evidence
 * cites posts and case studies, and projects link their case study.)
 */
export const COLLECTION_EXTRA_PATHS: Record<Collection, readonly string[]> = {
  blog: ['/'],
  work: ['/', '/about'],
}

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
 * The bilingual CV (ISR, lib/cvPage.ts). It renders the CV, the home socials,
 * portrait and availability (header, profile links, Person facts, the job
 * intent and work-authorisation lines) and the published posts and case
 * studies (skill evidence, case-study links), so CV, home, post and
 * case-study writes all regenerate it.
 */
export const CV_DOCUMENT_PATHS = ['/cv', '/cv/zh'] as const

/**
 * ISR pages rendered from the CV's Publications section (lib/publicationsData),
 * regenerated on every CV write (CV_PAGE_PATHS, the versions restore) so a
 * paper that was added, hidden or deleted is live at once — including
 * /publications switching between its page and a 404.
 */
export const PUBLICATIONS_STATIC_PATHS = ['/publications'] as const

/**
 * Every statically generated (ISR) public page whose data lives in the content
 * store (a restore regenerates them all).
 */
export const STATIC_CONTENT_PATHS = [
  '/',
  '/about',
  '/blog',
  '/work',
  '/now',
  '/uses',
  '/colophon',
  '/contact',
  ...CV_DOCUMENT_PATHS,
  ...PUBLICATIONS_STATIC_PATHS,
] as const

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

/** Feeds, sitemap, search index and the llms files (G9) list every post and case study. */
const COLLECTION_DERIVED_PATHS = ['/feed.xml', '/feed.json', '/work/feed.xml', '/api/rss.xml', '/sitemap.xml', '/api/search-index', ...LLMS_PATHS]

/** The downloadable files of each CV page (lib/cvExport/files.ts EXPORT_PATHS). */
const CV_FILE_PATHS: Record<string, readonly string[]> = {
  '/cv': ['/cv.pdf', '/cv.txt', '/cv.json'],
  '/cv/zh': ['/cv/zh.pdf', '/cv/zh.txt', '/cv/zh.json'],
}

/** The search index (⌘K documents and "Ask" passages, lib/searchIndex.ts). */
export const SEARCH_INDEX_PATH = '/api/search-index'

/**
 * Edge-cached responses derived from the given pages that must be purged with
 * them:
 *   - a post or case-study change alters the feeds, the sitemap, the search
 *     index and the llms files (G9: /llms.txt lists every piece,
 *     /llms-full.txt holds them), and each post or case study has its
 *     Markdown twin (/blog/<slug>.md, /work/<slug>.md);
 *   - the /now, /uses and /about (bio) bodies are part of the search index,
 *     /contact's availability is quoted by "Ask", and /llms.txt quotes the
 *     /now and /uses descriptions;
 *   - a CV page change alters its PDF, plain-text and JSON Resume files and
 *     the search index (CV entries in both languages), and /llms.txt links
 *     each CV language only while it has public content;
 *   - the sitemap and /llms.txt list /publications only while it has public
 *     papers, and its papers are search documents.
 */
export function derivedPurgePaths(paths: readonly string[]): string[] {
  const out = new Set<string>()
  const add = (list: readonly string[]) => list.forEach((d) => out.add(d))
  for (const p of paths) {
    if (/^\/(blog|work)(\/|$)/.test(p)) {
      add(COLLECTION_DERIVED_PATHS)
      add(markdownTwinPaths([p]))
    } else if (p === '/now' || p === '/uses') add([SEARCH_INDEX_PATH, LLMS_INDEX_PATH])
    else if (p === '/about' || p === '/contact') add([SEARCH_INDEX_PATH])
    else if (CV_FILE_PATHS[p]) add([...CV_FILE_PATHS[p], LLMS_INDEX_PATH, SEARCH_INDEX_PATH])
    else if (p === '/publications') add(['/sitemap.xml', LLMS_INDEX_PATH, SEARCH_INDEX_PATH])
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
 * by the proxy's rewrite to /api/indexnow-key). A key file only
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
 * Purge files (not pages) from the Cloudflare cache — e.g. the uploads of an
 * image moved to the media library's trash, which the edge would otherwise
 * keep serving for a year (`immutable`). Never submitted to IndexNow. Same
 * configuration, host and batch rules as notifyEdge; never throws; returns
 * how many URLs Cloudflare confirmed.
 */
export async function purgeEdgeUrls(paths: readonly string[], fetchFn: FetchFn = (...args) => fetch(...args)): Promise<number> {
  try {
    const purge = getCloudflarePurgeConfig()
    if (!purge) return 0
    const host = getPublicHost()
    if (!host) return 0
    const urls = Array.from(new Set(paths.filter((p) => typeof p === 'string' && p.startsWith('/')))).map((p) => `https://${host}${p}`)
    let purged = 0
    await Promise.all(
      chunk(urls, PURGE_BATCH_SIZE).map((files) =>
        purgeBatch(fetchFn, purge.zoneId, purge.apiToken, files).then((ok) => {
          if (ok) purged += files.length
        }),
      ),
    )
    return purged
  } catch (err) {
    log.warn('edge purge of files failed', { err })
    return 0
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
