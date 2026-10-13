import { listItems } from '../contentStore'
import { log } from '../log'

/**
 * Which /blog/<slug> and /work/<slug> paths the analytics may record: only
 * those of a currently published post or case study, so a script cannot plant
 * made-up pages in the admin report (they would persist in the rollups for
 * ROLLUP_DAYS).
 *
 * The slug sets come from the content store (published = present and not a
 * draft, the same rule as lib/mdx listPosts / listWork) and are cached for
 * SLUG_TTL_MS. A path missing from the cache triggers one early re-read (at
 * most every SLUG_MISS_REFRESH_MS) so the first readers of a post published a
 * moment ago still count. If the lookup fails, every slug-shaped path is
 * accepted until the next refresh — analytics must never drop real traffic
 * because the content store hiccupped — and the failure is logged.
 */

export const SLUG_TTL_MS = 60_000
export const SLUG_MISS_REFRESH_MS = 5_000

export type PublishedSlugs = { blog: Iterable<string>; work: Iterable<string> }
export type PublishedSlugSource = () => PublishedSlugs

const publishedIn = (collection: 'blog' | 'work'): string[] =>
  listItems(collection)
    .filter((item) => !item.frontmatter?.draft)
    .map((item) => item.slug)

const contentStoreSource: PublishedSlugSource = () => ({ blog: publishedIn('blog'), work: publishedIn('work') })

type Cache = {
  at: number
  /** null = the lookup failed: accept every slug until the next refresh. */
  sets: { blog: Set<string>; work: Set<string> } | null
}

let source: PublishedSlugSource = contentStoreSource
let cache: Cache | null = null

/** Test seam: replace where published slugs come from (null restores the content store). Clears the cache. */
export function setPublishedSlugSource(next: PublishedSlugSource | null) {
  source = next ?? contentStoreSource
  cache = null
}

function load(now: number): Cache {
  try {
    const s = source()
    return { at: now, sets: { blog: new Set(s.blog), work: new Set(s.work) } }
  } catch (err) {
    log.warn('analytics: published-slug lookup failed; accepting every slug-shaped path until the next refresh', { err })
    return { at: now, sets: null }
  }
}

const ARTICLE_PATH = /^\/(blog|work)\/([^/]+)$/

/**
 * Whether a normalised tracked path (lib/analytics/shared normalizeTrackedPath)
 * may be recorded: every non-article path is; /blog/<slug> and /work/<slug>
 * only when the slug is published. Never throws.
 */
export function isRecordablePath(path: string, now: number = Date.now()): boolean {
  const m = ARTICLE_PATH.exec(path)
  if (!m) return true
  const kind = m[1] as 'blog' | 'work'
  const slug = m[2]
  if (!cache || now - cache.at >= SLUG_TTL_MS || now < cache.at) cache = load(now)
  if (!cache.sets || cache.sets[kind].has(slug)) return true
  if (now - cache.at < SLUG_MISS_REFRESH_MS) return false
  cache = load(now)
  return !cache.sets || cache.sets[kind].has(slug)
}
