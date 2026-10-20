/**
 * Addresses of the Markdown twins (G9): every published post and case
 * study is also served as Markdown at its own address plus ".md" —
 * /blog/<slug>.md, /work/<slug>.md — the llmstxt.org convention. A
 * next.config.js rewrite sends them to /api/md. Client-safe (the article
 * pages link the twin from <head>).
 */

/** /blog/<slug> or /work/<slug>, nothing else. */
const DETAIL_RE = /^\/(blog|work)\/([a-z0-9][a-z0-9-_]*)$/

/** The twin of a post or case-study path: `/blog/x` → `/blog/x.md`. */
export function markdownTwinPath(path: string): string {
  return `${path.replace(/\/+$/, '')}.md`
}

/** The twins of the detail pages among `paths` (indexes and other pages have none). */
export function markdownTwinPaths(paths: readonly string[]): string[] {
  return paths.filter((p) => DETAIL_RE.test(p)).map(markdownTwinPath)
}

/** The index for language models (pages/llms.txt.tsx). */
export const LLMS_INDEX_PATH = '/llms.txt'

/** The site files for language models: the index and the full text (pages/llms-full.txt.tsx). */
export const LLMS_PATHS = [LLMS_INDEX_PATH, '/llms-full.txt'] as const

/** Edge caching of the twins and the llms files: five minutes at the edge (purged on saves), always revalidated by browsers. */
export const MARKDOWN_CACHE_CONTROL = 'public, max-age=0, s-maxage=300, stale-while-revalidate=600'
