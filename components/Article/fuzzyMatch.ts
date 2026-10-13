/**
 * Small fuzzy matcher + ranker for the ⌘K command palette (pure, no deps).
 *
 *   - A contiguous match beats a scattered one; matches at the start of the
 *     text or of a word (after a space/punctuation, a camelCase hump, or any
 *     CJK character) score higher; exact matches score highest.
 *   - Scattered (subsequence) matches reward runs and word starts and are
 *     penalised for gaps, so "gh" finds "GitHub" but not every string that
 *     happens to contain a g and later an h far apart.
 *   - Every whitespace-separated query token must match the label or the
 *     keywords. Only label matches are highlighted.
 *   - Content documents (posts, case studies, pages, CV entries) are ranked
 *     by rankSearchDocs with per-field weights.
 */

import { safeHref } from '../../lib/cvFormat'

export type Match = { score: number; indices: number[] }

const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const WORDISH_RE = /[\p{L}\p{N}]/u

function isBoundary(text: string, i: number): boolean {
  if (i <= 0) return true
  const ch = text[i]
  const prev = text[i - 1]
  if (CJK_RE.test(ch)) return true
  if (!WORDISH_RE.test(prev)) return true
  return prev === prev.toLowerCase() && ch !== ch.toLowerCase()
}

/** True when q[k..] is a subsequence of t[from..] (spaces in q ignored). */
function canFinish(q: string, k: number, t: string, from: number): boolean {
  let pos = from
  for (let j = k; j < q.length; j++) {
    if (q[j] === ' ') continue
    const next = t.indexOf(q[j], pos)
    if (next < 0) return false
    pos = next + 1
  }
  return true
}

/** Score `query` against `text`; null when it does not match. */
export function fuzzyMatch(query: string, text: string): Match | null {
  const q = query.trim().toLowerCase()
  if (!q) return { score: 0, indices: [] }
  if (!text) return null
  const t = text.toLowerCase()

  const at = t.indexOf(q)
  if (at >= 0) {
    let score = 100
    if (t.length === q.length) score += 60
    else if (at === 0) score += 40
    else if (isBoundary(text, at)) score += 25
    score -= Math.min(at, 30) * 0.5 + Math.min(t.length - q.length, 60) * 0.1
    return { score, indices: Array.from({ length: q.length }, (_, k) => at + k) }
  }

  // Scattered match: for each query char take the next occurrence, preferring
  // a word start when one is reachable before the next plain occurrence run.
  const indices: number[] = []
  let from = 0
  let score = 0
  for (let k = 0; k < q.length; k++) {
    const ch = q[k]
    if (ch === ' ') continue
    let pos = t.indexOf(ch, from)
    if (pos < 0) return null
    const prev = indices[indices.length - 1]
    if (prev === undefined || pos !== prev + 1) {
      // Not continuing a run: jump to a word-start occurrence if there is one.
      for (let p = pos; p >= 0 && p < t.length; p = t.indexOf(ch, p + 1)) {
        if (isBoundary(text, p)) {
          if (canFinish(q, k + 1, t, p + 1)) pos = p
          break
        }
      }
    }
    score += 1
    if (prev !== undefined && pos === prev + 1) score += 3
    if (isBoundary(text, pos)) score += 4
    if (prev !== undefined) score -= Math.min(pos - prev - 1, 25) * 0.4
    else score -= Math.min(pos, 12) * 0.2
    indices.push(pos)
    from = pos + 1
  }
  if (score <= q.replace(/\s/g, '').length * 1.5) return null
  return { score: Math.min(score, 70), indices }
}

export type Searchable = { label: string; keywords?: string; hint?: string }

export type Ranked<T> = { item: T; score: number; indices: number[] }

/**
 * Rank items for `query` (best first, stable for ties). Each token must hit
 * the label (full weight, highlighted) or the keywords / hint (60 %).
 * `boost` adds a per-item bonus (e.g. recently used, group priority).
 */
export function rankItems<T extends Searchable>(items: readonly T[], query: string, boost?: (item: T) => number): Ranked<T>[] {
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  if (!tokens.length) return items.map((item) => ({ item, score: 0, indices: [] }))
  const whole = query.trim().toLowerCase()

  const out: Array<Ranked<T> & { order: number }> = []
  items.forEach((item, order) => {
    let score = 0
    const hit = new Set<number>()
    for (const tok of tokens) {
      const inLabel = fuzzyMatch(tok, item.label)
      const inMeta = fuzzyMatch(tok, `${item.keywords || ''} ${item.hint || ''}`.trim())
      const metaScore = inMeta ? inMeta.score * 0.6 : -Infinity
      if (!inLabel && !inMeta) return
      if (inLabel && inLabel.score >= metaScore) {
        score += inLabel.score
        inLabel.indices.forEach((i) => hit.add(i))
      } else {
        score += metaScore
      }
    }
    if (tokens.length > 1 && item.label.toLowerCase().includes(whole)) score += 50
    score += boost ? boost(item) : 0
    out.push({ item, score, indices: Array.from(hit).sort((a, b) => a - b), order })
  })
  return out
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ item, score, indices }) => ({ item, score, indices }))
}

/** Split `text` into plain / matched runs for highlighting. */
export function highlightSegments(text: string, indices: readonly number[]): Array<{ text: string; match: boolean }> {
  if (!indices.length) return text ? [{ text, match: false }] : []
  const marked = new Set(indices)
  const out: Array<{ text: string; match: boolean }> = []
  for (let i = 0; i < text.length; i++) {
    const match = marked.has(i)
    const last = out[out.length - 1]
    if (last && last.match === match) last.text += text[i]
    else out.push({ text: text[i], match })
  }
  return out
}

// ── Content search (the /api/search-index documents) ───────────────────────

/** Structural copy of the frozen SearchDoc contract (lib/searchIndex.ts is server-only). */
export type SearchDocLike = {
  kind: 'post' | 'work' | 'page' | 'cv'
  title: string
  href: string
  description?: string
  tags?: string[]
  headings?: string[]
  body?: string
  lang?: string
}

/** What the palette keeps from GET /api/search-index. */
export type SearchIndex = { docs: SearchDocLike[]; bookingUrl: string }

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined
}

function strList(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : undefined
}

/**
 * Validate a GET /api/search-index body: keeps only well-formed docs that
 * point at a page of this site, and an http(s) booking URL.
 */
export function parseSearchIndex(body: unknown): SearchIndex {
  const raw = body && typeof body === 'object' ? (body as { docs?: unknown; availability?: { bookingUrl?: unknown } }) : {}
  const docs: SearchDocLike[] = []
  for (const d of Array.isArray(raw.docs) ? raw.docs : []) {
    if (!d || typeof d !== 'object') continue
    const o = d as Record<string, unknown>
    const kind = o.kind
    const title = str(o.title)
    const href = str(o.href)
    if ((kind !== 'post' && kind !== 'work' && kind !== 'page' && kind !== 'cv') || !title || !href) continue
    if (!href.startsWith('/') || href.startsWith('//')) continue
    docs.push({
      kind,
      title,
      href,
      description: str(o.description),
      tags: strList(o.tags),
      headings: strList(o.headings),
      body: str(o.body),
      lang: str(o.lang),
    })
  }
  const booking = safeHref(raw.availability?.bookingUrl)
  return { docs, bookingUrl: /^https?:\/\//i.test(booking) ? booking : '' }
}

export type DocField = 'title' | 'tag' | 'description' | 'heading' | 'body'

export type Segment = { text: string; match: boolean }

export type DocHit<T> = {
  doc: T
  score: number
  /** The field that explains the match: 'title' when every token hit the title. */
  field: DocField
  /** That field's value ('' for title hits; a single tag / heading; a body snippet as text). */
  value: string
  /** Title characters to highlight. */
  indices: number[]
  /** For field 'body': a ~60-char window with the match marked. */
  snippet?: Segment[]
}

/**
 * Relative field weights (title ×3, tags ×2, description / headings ×1, body
 * substring ×0.5). Scores are divided by the title weight so a title hit
 * ranks on the same scale as a palette command's label hit.
 */
export const DOC_FIELD_WEIGHT: Record<DocField, number> = { title: 3, tag: 2, description: 1, heading: 1, body: 0.5 }
const WEIGHT_SCALE = 1 / DOC_FIELD_WEIGHT.title
/** A body hit is a plain substring (no fuzzy score); it counts as a contiguous match. */
const BODY_MATCH_SCORE = 100
const BODY_MIN_QUERY = 3
export const SNIPPET_CHARS = 60

const normalizedBodies = new WeakMap<object, { text: string; lower: string }>()

function bodyOf(doc: SearchDocLike): { text: string; lower: string } | null {
  if (!doc.body) return null
  let cached = normalizedBodies.get(doc)
  if (!cached) {
    const text = doc.body.replace(/\s+/g, ' ').trim()
    cached = { text, lower: text.toLowerCase() }
    normalizedBodies.set(doc, cached)
  }
  return cached
}

function bestOf(query: string, values: readonly string[] | undefined): { match: Match; value: string } | null {
  let best: { match: Match; value: string } | null = null
  for (const value of values || []) {
    if (typeof value !== 'string' || !value) continue
    const m = fuzzyMatch(query, value)
    if (m && (!best || m.score > best.match.score)) best = { match: m, value }
  }
  return best
}

/** A window of about `width` characters of `text` around [at, at+len), with the match marked. */
export function snippetAround(text: string, at: number, len: number, width = SNIPPET_CHARS): Segment[] {
  const half = Math.max(0, Math.floor((width - len) / 2))
  let start = Math.max(0, at - half)
  const end = Math.min(text.length, Math.max(at + len, start + width))
  start = Math.max(0, Math.min(start, end - width))
  const out: Segment[] = []
  const before = text.slice(start, at)
  const after = text.slice(at + len, end)
  out.push({ text: `${start > 0 ? '…' : ''}${before}`, match: false })
  out.push({ text: text.slice(at, at + len), match: true })
  out.push({ text: `${after}${end < text.length ? '…' : ''}`, match: false })
  return out.filter((s) => s.text)
}

/** `text` cut to `max` characters with an ellipsis. */
export function truncate(text: string, max = SNIPPET_CHARS): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/**
 * Rank search documents for `query` (best first, stable for ties). Every
 * whitespace-separated token must hit at least one field; each token counts
 * with its best weighted field. The hit reports which field explains the
 * match so the palette can say where it was found.
 */
export function rankSearchDocs<T extends SearchDocLike>(docs: readonly T[], query: string, boost?: (doc: T) => number): DocHit<T>[] {
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  if (!tokens.length) return []
  const whole = query.trim().toLowerCase()

  const out: Array<DocHit<T> & { order: number }> = []
  docs.forEach((doc, order) => {
    let score = 0
    const titleHits = new Set<number>()
    let explain: { field: Exclude<DocField, 'title'>; value: string; weighted: number; snippet?: Segment[] } | null = null
    const body = bodyOf(doc)

    for (const tok of tokens) {
      const candidates: Array<{ field: DocField; weighted: number; value: string; indices?: number[]; snippet?: Segment[] }> = []
      const inTitle = fuzzyMatch(tok, doc.title)
      if (inTitle) candidates.push({ field: 'title', weighted: inTitle.score * DOC_FIELD_WEIGHT.title, value: '', indices: inTitle.indices })
      const inTag = bestOf(tok, doc.tags)
      if (inTag) candidates.push({ field: 'tag', weighted: inTag.match.score * DOC_FIELD_WEIGHT.tag, value: inTag.value })
      const inDesc = doc.description ? fuzzyMatch(tok, doc.description) : null
      if (inDesc) candidates.push({ field: 'description', weighted: inDesc.score * DOC_FIELD_WEIGHT.description, value: doc.description as string })
      const inHeading = bestOf(tok, doc.headings)
      if (inHeading) candidates.push({ field: 'heading', weighted: inHeading.match.score * DOC_FIELD_WEIGHT.heading, value: inHeading.value })
      if (body && tok.length >= BODY_MIN_QUERY) {
        const at = body.lower.indexOf(tok.toLowerCase())
        if (at >= 0) {
          const snippet = snippetAround(body.text, at, tok.length)
          candidates.push({ field: 'body', weighted: BODY_MATCH_SCORE * DOC_FIELD_WEIGHT.body, value: snippet.map((s) => s.text).join(''), snippet })
        }
      }
      if (!candidates.length) return
      const best = candidates.reduce((a, b) => (b.weighted > a.weighted ? b : a))
      score += best.weighted
      if (best.field === 'title') best.indices?.forEach((i) => titleHits.add(i))
      else if (!explain || best.weighted > explain.weighted) {
        explain = { field: best.field, value: best.value, weighted: best.weighted, snippet: best.snippet }
      }
    }

    if (tokens.length > 1 && doc.title.toLowerCase().includes(whole)) score += 50 * DOC_FIELD_WEIGHT.title
    out.push({
      doc,
      score: score * WEIGHT_SCALE + (boost ? boost(doc) : 0),
      field: explain ? explain.field : 'title',
      value: explain ? explain.value : '',
      indices: Array.from(titleHits).sort((a, b) => a - b),
      snippet: explain?.snippet,
      order,
    })
  })
  return out
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ doc, score, field, value, indices, snippet }) => ({ doc, score, field, value, indices, snippet }))
}
