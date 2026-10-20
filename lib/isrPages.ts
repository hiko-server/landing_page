/**
 * The ISR pages that can turn into a 404, and the check that removes their
 * stale persisted copies (lib/isrCache explains why).
 *
 *   /blog/<slug>    a post — gone once deleted or unpublished (draft)
 *   /work/<slug>    a case study — likewise
 *   /publications   gone while the CV has no public paper
 *   /zh, /zh/…      a Chinese page — gone while its Chinese copy is not
 *                   written (F3, lib/zhSite)
 *
 * Each answers what its getStaticProps answers (pages/blog/[slug],
 * pages/work/[slug], pages/publications, pages/zh/*): a stored item that is
 * not a draft (the rule of lib/mdx listPosts / listWork / getPost /
 * getWork), a public paper, the owner's Chinese copy. Runs after every content write (lib/revalidate revalidatePaths —
 * deletes, unpublishes, renames, snapshot / backup / Mongo restores and
 * storage pulls all go through it) and at server start (instrumentation.ts).
 *
 * SERVER-ONLY (content store). Reachable from instrumentation.ts, whose
 * bundle may not reach React client APIs: so it reads the posts and case
 * studies straight from the store (lib/contentStore) instead of through
 * lib/mdx, and lib/publicationsData stays React-free too.
 */

import { publishedItemSlugs } from './contentStore'
import { forgetVanishedPages, serverDir, type ForgetResult, type VanishingRoute } from './isrCache'
import { PUBLICATIONS_PATH, hasPublicationsPage } from './publicationsData'
import { ZH_PATHS, zhPathOf } from './zhRoutes'
import { zhAvailable } from './zhSite'

/** Slugs of a collection's published items: stored and not a draft (lib/mdx's rule, lib/contentStore). */
export function publishedSlugs(collection: 'blog' | 'work'): Set<string> {
  return publishedItemSlugs(collection)
}

/** The page families that can vanish, with fresh content checks (one store read per family and call). */
export function vanishingRoutes(): VanishingRoute[] {
  const route = (name: 'blog' | 'work'): VanishingRoute => {
    const re = new RegExp(`^/${name}/([A-Za-z0-9_-]+)$`)
    let slugs: Set<string> | null = null
    return {
      name,
      prefixes: [`/${name}`],
      match: (p) => re.test(p),
      exists: (p) => (slugs ??= publishedSlugs(name)).has(re.exec(p)?.[1] ?? ''),
    }
  }
  let publications: boolean | null = null
  let zh: Set<string> | null = null
  return [
    route('blog'),
    route('work'),
    {
      name: 'publications',
      match: (p) => p === PUBLICATIONS_PATH,
      // A store that cannot be read counts as "no paper": removing a copy is always safe.
      exists: () => (publications ??= hasPublicationsPage()),
    },
    {
      name: 'zh',
      prefixes: ['/zh'],
      match: (p) => ZH_PATHS.includes(p),
      // zhAvailable answers "none" for a store it cannot read: removing a copy is always safe.
      exists: (p) => (zh ??= new Set(zhAvailable().map((en) => zhPathOf(en) ?? ''))).has(p),
    },
  ]
}

/** Remove the persisted copies of every post, case study, /publications or Chinese page that no longer exists. */
export function forgetVanishedContentPages(dir: string = serverDir()): ForgetResult {
  return forgetVanishedPages(vanishingRoutes(), dir)
}
