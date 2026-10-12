import type { NextApiResponse } from 'next'

/**
 * On-demand ISR revalidation.
 *
 * /blog, /work, /now and /uses are statically generated with a 60 s
 * revalidate window. Without this, an admin save only shows up on the public
 * page after that window elapses *and* someone visits twice. Calling
 * `res.revalidate()` right after a successful write regenerates the affected
 * pages immediately, so "Save" means "live".
 *
 * Failures never fail the write itself — the content is already stored; the
 * time-based revalidation is still there as a fallback. The list of paths
 * that could not be refreshed is returned so the API can report it.
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
        console.warn(`[revalidate] ${p} failed:`, err instanceof Error ? err.message : err)
      }
    }),
  )
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

/** Every statically generated public page whose data lives in the content store. */
export const STATIC_CONTENT_PATHS = ['/blog', '/work', '/now', '/uses'] as const
