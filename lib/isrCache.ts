/**
 * Never resurrect an ISR page that should answer 404.
 *
 * Next.js keeps a regenerated Pages-router page in memory AND on disk, but
 * when a regeneration answers `notFound` it only updates the memory cache
 * (next/dist/server/lib/incremental-cache/file-system-cache.js `set` writes
 * nothing for a null result). The last 200 copy — a post or case study that
 * was since deleted or unpublished, a /publications page whose papers were
 * since hidden — stays on disk. After the next process restart (or once the
 * memory cache evicts the 404) Next serves that copy again until the page
 * is regenerated.
 *
 * So the persisted copies of a page that no longer exists are removed: after
 * every content write (lib/revalidate revalidatePaths → lib/isrPages) and at
 * every server start (instrumentation.ts). That is always safe — without a
 * persisted copy Next renders the page afresh on the next request, from the
 * current content store, and answers 404.
 *
 * Next.js internals (checked on Next 16.3; recheck on upgrades): a Pages
 * route's ISR copies live in
 *   .next/server/route-cache/PAGES/<sha256 of the source route>/$/<path>.{html,json,meta}
 * and the build-time prerender (also read as the seed of that cache) in
 *   .next/server/pages/<path>.{html,json,meta}
 * ('/' is stored as index). Missing files are fine: nothing to remove.
 *
 * SERVER-ONLY (fs). Dependency-free on purpose: instrumentation.ts and
 * lib/publicationsCache import it, and the content checks are passed in
 * (lib/isrPages knows the routes).
 */

import fs from 'node:fs'
import path from 'node:path'

/** The files Next writes per persisted Pages-router page. */
export const PAGE_FILE_EXTENSIONS = ['.html', '.json', '.meta'] as const

/** A page file name: one path segment and an extension — never the compiled `[slug].js` or its `.nft.json`. */
const PAGE_FILE_RE = /^([A-Za-z0-9_-]+)\.(html|json|meta)$/
/** A public page path made of safe segments ('/', '/blog', '/blog/my-post'). */
const PAGE_PATH_RE = /^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/
/** Directories of the build output that never hold an ISR page copy. */
const SKIP_DIRS = new Set(['api', '_next'])

/** The server output directory of the running app (`.next/server` under the working directory). */
export function serverDir(cwd: string = process.cwd()): string {
  return path.join(cwd, '.next', 'server')
}

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

/** The roots that hold persisted page copies: the build prerenders and each route-cache owner's `$` tree. */
export function pageCacheRoots(dir: string = serverDir()): string[] {
  return [path.join(dir, 'pages'), ...subdirs(path.join(dir, 'route-cache', 'PAGES')).map((d) => path.join(d, '$'))]
}

/** '/' → 'index', '/blog/x' → 'blog/x'; null for anything that is not a safe page path. */
export function pageFileStem(pathname: string): string | null {
  if (typeof pathname !== 'string' || !PAGE_PATH_RE.test(pathname)) return null
  return pathname === '/' ? 'index' : pathname.slice(1)
}

function stemToPath(stem: string): string {
  return stem === 'index' ? '/' : `/${stem}`
}

function unlink(file: string): boolean {
  try {
    fs.unlinkSync(file)
    return true
  } catch {
    return false
  }
}

/** Remove the persisted copies of the given page paths; returns the files removed. */
export function forgetPersistedPages(pathnames: readonly string[], dir: string = serverDir()): string[] {
  const stems = pathnames.map(pageFileStem).filter((s): s is string => !!s)
  if (!stems.length) return []
  const removed: string[] = []
  for (const root of pageCacheRoots(dir)) {
    for (const stem of stems) {
      for (const ext of PAGE_FILE_EXTENSIONS) {
        const file = path.join(root, `${stem}${ext}`)
        if (unlink(file)) removed.push(file)
      }
    }
  }
  return removed
}

/**
 * Every persisted page on disk whose path `wanted` accepts, with its files
 * (both roots). `wanted` keeps the walk cheap: it is asked about each
 * directory prefix too, so unrelated trees are never entered.
 */
export function persistedPages(wanted: (pathname: string, isPrefix: boolean) => boolean, dir: string = serverDir()): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const walk = (abs: string, stemPrefix: string, depth: number) => {
    if (depth > 6) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || !/^[A-Za-z0-9_-]+$/.test(e.name)) continue
        const stem = `${stemPrefix}${e.name}`
        if (wanted(stemToPath(stem), true)) walk(path.join(abs, e.name), `${stem}/`, depth + 1)
      } else if (e.isFile()) {
        const m = PAGE_FILE_RE.exec(e.name)
        if (!m) continue
        const pathname = stemToPath(`${stemPrefix}${m[1]}`)
        if (!wanted(pathname, false)) continue
        const files = out.get(pathname) || []
        files.push(path.join(abs, e.name))
        out.set(pathname, files)
      }
    }
  }
  for (const root of pageCacheRoots(dir)) walk(root, '', 0)
  return out
}

/**
 * A family of ISR pages that can stop existing (a post, a case study,
 * /publications): `match` recognises its paths, `prefixes` are the
 * directories they live under ('/blog'), `exists` answers for one path.
 */
export type VanishingRoute = {
  name: string
  match: (pathname: string) => boolean
  prefixes?: readonly string[]
  exists: (pathname: string) => boolean
}

export type ForgetResult = { paths: string[]; files: string[] }

/**
 * Remove the persisted copies of every page of `routes` that no longer
 * exists. A route whose check throws (the store could not be read) keeps
 * its copies: removing is only ever done on a definite "gone".
 */
export function forgetVanishedPages(routes: readonly VanishingRoute[], dir: string = serverDir()): ForgetResult {
  const wanted = (pathname: string, isPrefix: boolean) =>
    routes.some((r) => (isPrefix ? (r.prefixes || []).includes(pathname) : r.match(pathname)))
  const found = persistedPages(wanted, dir)
  const result: ForgetResult = { paths: [], files: [] }
  for (const [pathname, files] of found) {
    const route = routes.find((r) => r.match(pathname))
    if (!route) continue
    let gone = false
    try {
      gone = !route.exists(pathname)
    } catch {
      gone = false
    }
    if (!gone) continue
    const removed = files.filter(unlink)
    if (removed.length) {
      result.paths.push(pathname)
      result.files.push(...removed)
    }
  }
  return result
}
