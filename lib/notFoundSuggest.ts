/**
 * "Did you mean …" for the 404 page: the pages of this site closest to the
 * address that was not found. Runs in the browser after the page mounts
 * (the 404 is static), against the public search index (/api/search-index)
 * plus the site's fixed pages; the requested path is never sent or logged.
 *
 * A candidate scores the best of:
 *   - path similarity: edit distance (with transpositions) between the last
 *     segments of the requested path and the candidate's, separators
 *     ignored — /work/swc → /work/swcs, /blgo → /blog, /posts/swcs →
 *     /blog/swcs, /blog/car-boy → /blog/carboy;
 *   - words: each word of the path against the candidate's title, slug and
 *     keywords (an exact word, a word start, a typo, then the palette's
 *     fuzzy match) — /resume → CV, /projects/carboy → Carboy.
 *
 * suggestFromIndex then reads the path's words as a site search (the
 * palette's ranking, lib/search: CJK words, synonyms in English and
 * Chinese): it marks why each suggestion matches — the matched title
 * letters and a snippet with the matched words — and fills free places with
 * pages whose content matches every word (/实习 → the internships, /patents
 * → the patent entry).
 * Pure (no DOM, no fetch), unit-tested in tests/chrome-identity.test.ts and
 * tests/search-ask.test.ts.
 */

import { fuzzyMatch, rankSearchDocs, type SearchDocLike, type Segment } from '../components/Article/fuzzyMatch'
import { PRIMARY_LINKS } from '../components/Chrome/chrome'

export type PageCandidate = {
  href: string
  title: string
  kind: SearchDocLike['kind']
  keywords?: string
  lang?: string
}

export type Suggestion = PageCandidate & {
  score: number
  /** Title characters the words of the path matched (suggestFromIndex). */
  marks?: number[]
  /** Where else they matched: a short snippet with the matched words marked. */
  snippet?: Segment[]
}

/** Below this a candidate is not offered. */
export const SUGGESTION_THRESHOLD = 0.5
/** At most this many suggestions. */
export const SUGGESTION_LIMIT = 4

const PAGE_KEYWORDS: Record<string, string> = {
  '/': 'home index start main',
  '/about': 'about bio profile me',
  '/work': 'work projects project portfolio case studies',
  '/blog': 'blog posts post articles article writing notes',
  '/cv': 'cv resume curriculum vitae english en',
  '/now': 'now status current',
  '/uses': 'uses tools setup gear stack',
  '/contact': 'contact email mail hire message',
}

/** The site's fixed pages (the primary navigation, the Chinese CV and the colophon). */
export const STATIC_CANDIDATES: readonly PageCandidate[] = [
  ...PRIMARY_LINKS.map((l) => ({ href: l.url, title: l.name, kind: 'page' as const, keywords: PAGE_KEYWORDS[l.url] })),
  { href: '/cv/zh', title: '中文简历', kind: 'page', keywords: 'cv zh chinese resume 简历 中文', lang: 'zh-Hans' },
  { href: '/colophon', title: 'Colophon', kind: 'page', keywords: 'colophon privacy changelog stack fonts site' },
]

const IGNORED_EXTENSIONS = /\.(html?|php|aspx?|jsp)$/i

/** The requested path, decoded, lower-cased, without query, hash, extension or trailing slash. */
export function normalizeRequestedPath(raw: string): string {
  let path = (raw || '').split(/[?#]/)[0] || '/'
  try {
    path = decodeURIComponent(path)
  } catch {
    /* keep the raw path */
  }
  path = path.toLowerCase().replace(IGNORED_EXTENSIONS, '').replace(/\/index$/, '')
  path = `/${path.replace(/^\/+/, '')}`.replace(/\/{2,}/g, '/').replace(/\/+$/, '')
  return path || '/'
}

/** Words of a path or title (letters / digits, CJK kept), lower-cased. */
export function wordsOf(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** Optimal-string-alignment distance (Levenshtein plus adjacent transpositions). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const rows = a.length + 1
  const cols = b.length + 1
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[rows - 1][cols - 1]
}

/** 1 for equal strings, 0 for nothing in common (edit distance over the longer length). */
export function similarity(a: string, b: string): number {
  const len = Math.max(a.length, b.length)
  return len ? 1 - editDistance(a, b) / len : 1
}

const lastSegment = (path: string) => path.split('/').filter(Boolean).pop() || ''

/** Words of a path that say nothing about where the visitor wanted to go. */
const STOPWORDS = new Set(['the', 'and', 'for', 'not', 'this', 'that', 'does', 'page', 'pages', 'www', 'http', 'https', 'html'])
const squash = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '')

/** How well one word of the requested path matches a candidate's words (0–1). */
function wordScore(token: string, words: readonly string[], haystack: string): number {
  let best = 0
  for (const w of words) {
    if (w === token) return 0.9
    if (token.length >= 3 && w.startsWith(token)) best = Math.max(best, 0.8)
    if (token.length >= 4 && w.length >= 4) {
      const sim = similarity(token, w)
      if (sim >= 0.7) best = Math.max(best, 0.85 * sim)
    }
  }
  if (best === 0 && token.length >= 3) {
    const m = fuzzyMatch(token, haystack)
    if (m) best = m.score >= 100 ? 0.65 : 0.35 * Math.min(1, m.score / 70)
  }
  return best
}

/** Score of one candidate for a normalised requested path (0–1). */
export function scoreCandidate(requested: string, candidate: PageCandidate): number {
  const target = normalizeRequestedPath(candidate.href)
  if (target === requested) return 0
  // The last segment carries the intent (a section prefix is shared by every
  // page in it): a typo in it, or the same slug under another section
  // (/posts/x → /blog/x), counts almost fully.
  const reqLast = squash(lastSegment(requested))
  const candLast = squash(lastSegment(target))
  let pathScore = 0
  if (reqLast && candLast && candidate.kind !== 'cv') {
    const segSim = similarity(reqLast, candLast)
    pathScore = segSim >= 0.7 ? segSim * 0.95 : 0
  }

  const tokens = wordsOf(requested).filter((t) => t.length >= 2 && !STOPWORDS.has(t))
  // A candidate is described by its title, keywords and slug — not by its
  // section (every /work/… page would match "work"), and a CV entry not by
  // its anchor.
  const slug = candidate.kind === 'cv' ? '' : lastSegment(target)
  const words = wordsOf(`${candidate.title} ${slug} ${candidate.keywords || ''}`)
  const haystack = `${candidate.title} ${slug.replace(/-+/g, ' ')} ${candidate.keywords || ''}`
  // In a deeper path the first segment only says which section the visitor
  // was in (/work/swc): it may point at the section page, but weaker than
  // a match on the rest of the path.
  const segments = requested.split('/').filter(Boolean)
  const sectionWord = segments.length > 1 ? segments[0] : ''
  let tokenScore = 0
  let matched = 0
  for (const t of tokens) {
    const s = t === sectionWord ? Math.min(0.7, wordScore(t, words, haystack)) : wordScore(t, words, haystack)
    if (s >= 0.6) matched += 1
    tokenScore = Math.max(tokenScore, s)
  }
  if (matched > 1) tokenScore = Math.min(1, tokenScore + 0.05 * (matched - 1))

  let score = Math.max(pathScore, tokenScore)
  // Among good matches, the same section (/work/… for /work/…) wins ties.
  const reqSection = requested.split('/')[1] || ''
  const sameSection = !!reqSection && reqSection === (target.split('/')[1] || '') && target !== `/${reqSection}`
  if (sameSection && score >= SUGGESTION_THRESHOLD) score += 0.05
  // CV entries are anchors inside /cv: offered after real pages.
  if (candidate.kind === 'cv') score *= 0.85
  return Math.min(1, score)
}

/** Candidates from the search index (posts, case studies, pages, CV entries) plus the fixed pages, one per href. */
export function candidatesFrom(docs: readonly SearchDocLike[] | null | undefined): PageCandidate[] {
  const out = new Map<string, PageCandidate>()
  for (const c of STATIC_CANDIDATES) out.set(c.href, c)
  for (const d of docs || []) {
    if (!d || typeof d.href !== 'string' || !d.href.startsWith('/') || d.href.startsWith('//')) continue
    if (out.has(d.href)) continue
    out.set(d.href, { href: d.href, title: d.title, kind: d.kind, keywords: (d.tags || []).join(' '), lang: d.lang && d.lang !== 'en' ? d.lang : undefined })
  }
  return [...out.values()]
}

/** The best matches for a requested path, best first. */
export function suggestPages(rawPath: string, candidates: readonly PageCandidate[], limit = SUGGESTION_LIMIT): Suggestion[] {
  const requested = normalizeRequestedPath(rawPath)
  if (requested === '/') return []
  // Array.prototype.sort is stable: equal scores keep the candidates' order.
  return candidates
    .map((c) => ({ ...c, score: scoreCandidate(requested, c) }))
    .filter((c) => c.score >= SUGGESTION_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** The words of the requested path, as the palette's prefilled query ("/work/swc" → "work swc"). */
export function queryFromPath(rawPath: string): string {
  return wordsOf(normalizeRequestedPath(rawPath)).join(' ').slice(0, 60)
}

/**
 * "Did you mean" from the search index: suggestPages over the fixed pages
 * and the index, each annotated with what matched, then — while places are
 * free — the documents whose content matches every word of the path, as
 * the palette ranks them.
 */
export function suggestFromIndex(
  rawPath: string,
  docs: readonly SearchDocLike[] | null | undefined,
  opts: { subject?: readonly string[]; limit?: number } = {},
): Suggestion[] {
  const limit = opts.limit ?? SUGGESTION_LIMIT
  const list = Array.isArray(docs) ? docs : []
  const byPath = suggestPages(rawPath, candidatesFrom(list), limit)
  const q = queryFromPath(rawPath)
  if (!q || normalizeRequestedPath(rawPath) === '/') return byPath
  const hits = rankSearchDocs(list, q, undefined, { subject: opts.subject })
  const best = new Map<string, (typeof hits)[number]>()
  for (const h of hits) if (!best.has(h.doc.href)) best.set(h.doc.href, h)
  const annotate = (h: (typeof hits)[number] | undefined) =>
    h ? { ...(h.indices.length ? { marks: h.indices } : {}), ...(h.field !== 'title' && h.snippet?.length ? { snippet: h.snippet } : {}) } : {}
  const out: Suggestion[] = byPath.map((s) => ({ ...s, ...annotate(best.get(s.href)) }))
  for (const h of best.values()) {
    if (out.length >= limit) break
    if (h.coverage < 1 || out.some((o) => o.href === h.doc.href)) continue
    out.push({
      href: h.doc.href,
      title: h.doc.title,
      kind: h.doc.kind,
      lang: h.doc.lang && h.doc.lang !== 'en' ? h.doc.lang : undefined,
      score: SUGGESTION_THRESHOLD,
      ...annotate(h),
    })
  }
  return out
}
