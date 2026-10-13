/**
 * Never resurrect a /publications page that should answer 404.
 *
 * /publications is ISR. Next.js keeps a regenerated page in memory AND on
 * disk, but when a regeneration answers notFound it only updates the memory
 * cache (next/dist/server/lib/incremental-cache/file-system-cache.js writes
 * nothing for a null result). The last 200 page — with papers the owner has
 * since hidden or deleted — stays on disk, and after the next process
 * restart Next serves it again until it is regenerated. So its persisted
 * copies are removed after a CV write that makes it disappear
 * (lib/publicationsNav), and at every server start (instrumentation.ts) —
 * always safe: without them Next renders the page afresh on the first
 * request, from the current content store.
 *
 * Next.js internals: the ISR disk cache of a Pages route lives in
 * `.next/server/route-cache/PAGES/<build key>/$/<route>.{html,json,meta}`
 * (Next 16) and the build-time prerender in `.next/server/pages/` — both are
 * checked. Missing files are fine (nothing to remove); without them Next
 * simply renders the page again.
 *
 * SERVER-ONLY (fs). Dependency-free on purpose: instrumentation.ts imports it.
 */

import fs from 'node:fs'
import path from 'node:path'

const FILES = ['publications.html', 'publications.json', 'publications.meta']

function subdirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(dir, d.name))
  } catch {
    return []
  }
}

/** Remove the persisted /publications page; returns the files removed. */
export function forgetPersistedPublicationsPage(serverDir: string = path.join(process.cwd(), '.next', 'server')): string[] {
  const dirs = [path.join(serverDir, 'pages'), ...subdirs(path.join(serverDir, 'route-cache', 'PAGES')).map((d) => path.join(d, '$'))]
  const removed: string[] = []
  for (const dir of dirs) {
    for (const name of FILES) {
      const file = path.join(dir, name)
      try {
        fs.unlinkSync(file)
        removed.push(file)
      } catch {
        /* not there */
      }
    }
  }
  return removed
}
