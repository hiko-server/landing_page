/**
 * Never resurrect a /publications page that should answer 404.
 *
 * /publications is ISR; when a CV write leaves it without a public paper it
 * answers notFound, but Next keeps its last 200 copy on disk (lib/isrCache
 * explains the mechanism, which covers posts and case studies too). The
 * general clean-up (lib/isrPages forgetVanishedContentPages) runs after every
 * revalidation round and at server start; this removes the /publications
 * copies unconditionally — always safe: without them Next renders the page
 * afresh on the next request, from the current content store.
 *
 * SERVER-ONLY (fs). Dependency-free on purpose.
 */

import { forgetPersistedPages, serverDir } from './isrCache'

/** Remove the persisted /publications page; returns the files removed. */
export function forgetPersistedPublicationsPage(dir: string = serverDir()): string[] {
  return forgetPersistedPages(['/publications'], dir)
}
