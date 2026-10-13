/**
 * Keeping the Publications nav link true on statically generated pages.
 *
 * Every page loader ships `chromePublications` (lib/publicationsData), so
 * the header / footer / drawer / ⌘K link is in the server HTML. The ISR
 * pages that do not render the CV are regenerated here when a CV write makes
 * /publications appear or disappear, so their link follows at once instead
 * of after the revalidate window. (The CV-backed pages — CV_PAGE_PATHS: /,
 * /about, /now, /work, /cv, /cv/zh and /publications — are regenerated on
 * every CV write anyway.)
 *
 * SERVER-ONLY (reads the MDX collections).
 */

import { listPosts, listWork } from './mdx'
import { forgetPersistedPublicationsPage } from './publicationsCache'
import { hasPublicationsPage } from './publicationsData'
import { CV_PAGE_PATHS, STATIC_CONTENT_PATHS, collectionPaths } from './revalidate'

/**
 * Pages that render the nav link from build-time data only (revalidate:
 * false, never regenerated at runtime): they keep the chrome's last-known
 * value instead.
 */
const BUILD_TIME_PAGES: readonly string[] = ['/colophon']

/** ISR pages besides CV_PAGE_PATHS that render the nav link (detail pages capped like collectionPaths). */
export function publicationsNavPaths(): string[] {
  const slugs = (list: () => Array<{ slug: string }>) => {
    try {
      return list().map((i) => i.slug)
    } catch {
      return []
    }
  }
  const others = (STATIC_CONTENT_PATHS as readonly string[]).filter((p) => !CV_PAGE_PATHS.includes(p) && !BUILD_TIME_PAGES.includes(p))
  return Array.from(new Set([...others, ...collectionPaths('blog', undefined, slugs(listPosts)), ...collectionPaths('work', undefined, slugs(listWork))]))
}

/**
 * Remember whether /publications exists before a CV write; afterwards
 * `pathsIfChanged()` lists the ISR pages to regenerate (none when the
 * answer did not change). When /publications just disappeared, its
 * persisted copy is removed too (lib/publicationsCache), so a restart can
 * never serve it again.
 */
export function trackPublicationsNav(): { pathsIfChanged: () => string[] } {
  const before = hasPublicationsPage()
  return {
    pathsIfChanged: () => {
      const now = hasPublicationsPage()
      if (now === before) return []
      if (!now) forgetPersistedPublicationsPage()
      return publicationsNavPaths()
    },
  }
}
