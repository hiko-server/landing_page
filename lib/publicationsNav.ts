/**
 * Keeping the Publications nav link true on statically generated pages.
 *
 * Every page loader ships `chromePublications` (lib/publicationsData), so
 * the header / footer / drawer / ⌘K link is in the server HTML. Server-
 * rendered pages are always current; ISR pages are regenerated here when a
 * CV write makes /publications appear or disappear, so their link follows at
 * once instead of after the 60 s window. (/now and /publications are already
 * regenerated on every CV write: CV_STATIC_PATHS.)
 *
 * SERVER-ONLY (reads the MDX collections).
 */

import { listPosts, listWork } from './mdx'
import { forgetPersistedPublicationsPage } from './publicationsCache'
import { hasPublicationsPage } from './publicationsData'
import { collectionPaths } from './revalidate'

/** ISR pages besides CV_STATIC_PATHS that render the nav link (detail pages capped like collectionPaths). */
export function publicationsNavPaths(): string[] {
  const slugs = (list: () => Array<{ slug: string }>) => {
    try {
      return list().map((i) => i.slug)
    } catch {
      return []
    }
  }
  return Array.from(new Set(['/uses', ...collectionPaths('blog', undefined, slugs(listPosts)), ...collectionPaths('work', undefined, slugs(listWork))]))
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
