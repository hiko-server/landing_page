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

/** Public paths that render a collection item (index + detail). */
export function collectionPaths(collection: Collection, slug?: string): string[] {
  const base = `/${collection}`
  return slug ? [base, `${base}/${slug}`] : [base]
}

/** Every statically generated public page whose data lives in the content store. */
export const STATIC_CONTENT_PATHS = ['/blog', '/work', '/now', '/uses'] as const
