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
 *   - Content documents (posts, case studies, pages, CV entries in English
 *     and Chinese, publications) are ranked by rankSearchDocs with per-field
 *     weights over the analysed query (lib/search/query: question words
 *     dropped, CJK words, synonyms in both languages), with every matched
 *     word marked in a snippet.
 */

import { safeHref } from '../../lib/cvFormat'
import {
  SYNONYM_WEIGHT,
  allAltRanges,
  analyzeQuery,
  fieldIndex,
  findAlt,
  requiredMatchesFor,
  strongConcepts,
  windowSegments,
  type Alt,
  type Concept,
  type FieldIndex,
  type Range,
} from '../../lib/search/query'

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

/** Kinds of search documents (a structural copy of lib/searchIndex.ts, which is server-only). */
export const SEARCH_DOC_KINDS = ['post', 'work', 'page', 'cv', 'publication'] as const
export type SearchDocKind = (typeof SEARCH_DOC_KINDS)[number]

/** Structural copy of the SearchDoc contract (lib/searchIndex.ts is server-only). */
export type SearchDocLike = {
  kind: SearchDocKind
  title: string
  href: string
  description?: string
  tags?: string[]
  headings?: string[]
  body?: string
  lang?: string
  /** CV docs: the section's heading as the page shows it ("PATENTS", "专利"). */
  section?: string
  /** CV docs: shared with the same entry in the other language's CV. */
  twin?: string
}

/** What the palette keeps from GET /api/search-index. */
export type SearchIndex = {
  docs: SearchDocLike[]
  bookingUrl: string
  /** The site owner's public names (dropped from questions: "Does Lucian have…"). */
  subject: string[]
  /** The raw "Ask" passage index (validated by lib/ask/engine parseAskIndex when Ask is used); null when absent. */
  ask: unknown
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined
}

function strList(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : undefined
}

const isKind = (v: unknown): v is SearchDocKind => typeof v === 'string' && (SEARCH_DOC_KINDS as readonly string[]).includes(v)

/** A same-site path ("/…", never "//…" or "/\…"). */
export function isSitePath(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/\\')
}

/**
 * Validate a GET /api/search-index body: keeps only well-formed docs that
 * point at a page of this site, an http(s) booking URL, the owner's names
 * (short strings) and the raw "Ask" part.
 */
export function parseSearchIndex(body: unknown): SearchIndex {
  const raw =
    body && typeof body === 'object' ? (body as { docs?: unknown; availability?: { bookingUrl?: unknown }; subject?: unknown; ask?: unknown }) : {}
  const docs: SearchDocLike[] = []
  for (const d of Array.isArray(raw.docs) ? raw.docs : []) {
    if (!d || typeof d !== 'object') continue
    const o = d as Record<string, unknown>
    const kind = o.kind
    const title = str(o.title)
    const href = str(o.href)
    if (!isKind(kind) || !title || !href || !isSitePath(href)) continue
    docs.push({
      kind,
      title,
      href,
      description: str(o.description),
      tags: strList(o.tags),
      headings: strList(o.headings),
      body: str(o.body),
      lang: str(o.lang),
      section: str(o.section),
      twin: str(o.twin),
    })
  }
  const booking = safeHref(raw.availability?.bookingUrl)
  return {
    docs,
    bookingUrl: /^https?:\/\//i.test(booking) ? booking : '',
    subject: (strList(raw.subject) || []).map((s) => s.trim().slice(0, 40)).slice(0, 12),
    ask: raw.ask && typeof raw.ask === 'object' ? raw.ask : null,
  }
}

export type DocField = 'title' | 'tag' | 'description' | 'heading' | 'section' | 'body'

export type Segment = { text: string; match: boolean }

export type DocHit<T> = {
  doc: T
  score: number
  /** The field that explains the match: 'title' when every concept hit the title. */
  field: DocField
  /** That field's value ('' for title hits; a single tag / heading; a body snippet as text). */
  value: string
  /** Title characters to highlight. */
  indices: number[]
  /** For non-title fields: about SNIPPET_CHARS of the field with every match marked. */
  snippet?: Segment[]
  /** Share of the query's concepts the doc matches (1 = all). */
  coverage: number
}

/**
 * Relative field weights (title ×3, tags ×2, description / headings ×1, a CV
 * entry's section ×1, body ×0.5). Scores are divided by the title weight so
 * a title hit ranks on the same scale as a palette command's label hit.
 */
export const DOC_FIELD_WEIGHT: Record<DocField, number> = { title: 3, tag: 2, description: 1, heading: 1, section: 1, body: 0.5 }
const WEIGHT_SCALE = 1 / DOC_FIELD_WEIGHT.title
/** A whole-word / substring hit counts as a contiguous match. */
const CONTIGUOUS_SCORE = 100
/** A whole stemmed word ("patents" → "Patent") ranks just below a fuzzy word-start hit. */
const WORD_SCORE = 115
/** Latin words shorter than this never search the body (CJK words of 2+ characters do). */
const BODY_MIN_QUERY = 3
/** A weak concept (a lone CJK character no synonym knows) adds this share of its score. */
const WEAK_WEIGHT = 0.3
/** A document in the other language than the query's (CJK query → Chinese) ranks at this share. */
const OTHER_LANG = 0.85
export const SNIPPET_CHARS = 60

type DocIndex = {
  title: FieldIndex
  description: FieldIndex | null
  tags: FieldIndex[]
  headings: FieldIndex[]
  section: FieldIndex | null
  body: FieldIndex | null
  /** The topic a doc answers: a CV doc's sessionName (`/cv#cv-patents-0` → 'patents'), 'publications' for papers. */
  sessionName: string
}

const docIndexes = new WeakMap<object, DocIndex>()

const squashWs = (s: string) => s.replace(/\s+/g, ' ').trim()

/** The tokenised fields of a document, built once per document (CJK bigrams, stemmed words). */
function docIndex(doc: SearchDocLike): DocIndex {
  let idx = docIndexes.get(doc)
  if (!idx) {
    const anchor = /#cv-([A-Za-z]+)/.exec(doc.href)
    idx = {
      title: fieldIndex(doc.title),
      description: doc.description ? fieldIndex(doc.description) : null,
      tags: (doc.tags || []).filter((t) => typeof t === 'string' && t).map(fieldIndex),
      headings: (doc.headings || []).filter((h) => typeof h === 'string' && h).map(fieldIndex),
      section: doc.section ? fieldIndex(doc.section) : null,
      body: doc.body ? fieldIndex(squashWs(doc.body)) : null,
      // Papers answer the "publications" topic too ("has he published?").
      sessionName: doc.kind === 'cv' && anchor ? anchor[1] : doc.kind === 'publication' ? 'publications' : '',
    }
    docIndexes.set(doc, idx)
  }
  return idx
}

/** A window of about `width` characters of `text` around [at, at+len), with the match marked. */
export function snippetAround(text: string, at: number, len: number, width = SNIPPET_CHARS): Segment[] {
  return windowSegments(text, { start: at, end: at + len }, [{ start: at, end: at + len }], width)
}

/** `text` cut to `max` characters with an ellipsis. */
export function truncate(text: string, max = SNIPPET_CHARS): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

type Candidate = {
  field: DocField
  weighted: number
  /** The field text that matched (a tag / heading / the description / the body). */
  source: FieldIndex | null
  range: Range | null
  indices?: number[]
}

/** Score of `alt` in one field: fuzzy for the typed word on short fields, whole words / substrings otherwise. */
function matchField(concept: Concept, alt: Alt, f: FieldIndex, fuzzy: boolean): { score: number; range: Range; indices?: number[] } | null {
  let best: { score: number; range: Range; indices?: number[] } | null = null
  if (alt.literal && fuzzy && !concept.cjk && concept.raw) {
    const m = fuzzyMatch(concept.raw, f.text)
    if (m && m.indices.length) best = { score: m.score, range: { start: m.indices[0], end: m.indices[m.indices.length - 1] + 1 }, indices: m.indices }
  }
  const hit = findAlt(alt, f)
  if (hit) {
    let score: number
    if (alt.cjk && hit.coverage === 1) {
      // A CJK substring scores like the palette's contiguous match (exact title, prefix, word start…).
      const m = fuzzyMatch(alt.text, f.text)
      score = m ? Math.max(m.score, CONTIGUOUS_SCORE) : CONTIGUOUS_SCORE
    } else score = (alt.cjk ? CONTIGUOUS_SCORE : WORD_SCORE) * hit.coverage
    score *= alt.weight
    if (!best || score > best.score) {
      const indices = Array.from({ length: hit.end - hit.start }, (_, k) => hit.start + k)
      best = { score, range: hit, indices }
    }
  }
  return best
}

/** Every field of one doc where one concept matches, with its weighted score. */
function conceptCandidates(concept: Concept, idx: DocIndex): Candidate[] {
  const out: Candidate[] = []
  const consider = (field: DocField, f: FieldIndex | null, fuzzy: boolean) => {
    if (!f) return
    let best: Candidate | null = null
    for (const alt of concept.alts) {
      const m = matchField(concept, alt, f, fuzzy)
      if (!m) continue
      const weighted = m.score * DOC_FIELD_WEIGHT[field]
      if (!best || weighted > best.weighted) best = { field, weighted, source: f, range: m.range, indices: m.indices }
    }
    if (best) out.push(best)
  }
  consider('title', idx.title, true)
  for (const t of idx.tags) consider('tag', t, true)
  consider('description', idx.description, true)
  for (const h of idx.headings) consider('heading', h, true)
  consider('section', idx.section, false)
  if (idx.body) {
    // The body: a substring of the typed word (as before), or whole words / CJK substrings.
    let best: Candidate | null = null
    const body = idx.body
    for (const alt of concept.alts) {
      let range: Range | null = null
      if (alt.literal && !alt.cjk) {
        const raw = concept.raw
        const stemmed = alt.terms.length === 1 ? alt.terms[0] : ''
        for (const needle of [raw, stemmed]) {
          if (range || !needle || Array.from(needle).length < BODY_MIN_QUERY) continue
          const at = body.folded.indexOf(needle)
          if (at >= 0) range = { start: at, end: at + needle.length }
        }
      } else if (!alt.cjk || Array.from(alt.text).length >= 2 || alt.literal) {
        const hit = findAlt(alt, body)
        if (hit && hit.coverage === 1) range = hit
      }
      if (!range) continue
      const weighted = CONTIGUOUS_SCORE * alt.weight * DOC_FIELD_WEIGHT.body
      if (!best || weighted > best.weighted) best = { field: 'body', weighted, source: body, range }
    }
    if (best) out.push(best)
  }
  // A CV entry of the section the question asks about ("awards" → Competitions & Awards).
  if (idx.sessionName && concept.sections.includes(idx.sessionName)) {
    out.push({ field: 'section', weighted: CONTIGUOUS_SCORE * SYNONYM_WEIGHT * DOC_FIELD_WEIGHT.section, source: idx.section, range: null })
  }
  return out
}

/** Every range of every concept's alternatives in a field (for marking a snippet). */
function conceptRanges(concepts: readonly Concept[], f: FieldIndex): Range[] {
  const out: Range[] = []
  for (const c of concepts) for (const alt of c.alts) out.push(...allAltRanges(alt, f))
  return out
}

const isZhLang = (lang: string | undefined) => /^zh/i.test(lang || '')

/**
 * Rank search documents for `query` (best first, stable for ties). The query
 * is analysed into concepts (lib/search/query: stop words and the owner's
 * names dropped, CJK words, synonyms in both languages); each concept counts
 * with its best weighted field, and a doc must match requiredMatchesFor() of
 * them. Documents in the query's language rank first (a CJK query prefers
 * the Chinese CV), and of a CV entry found in both languages (same `twin`)
 * only the better one is kept. The hit reports which field explains the
 * match so the palette can say where it was found, with the matched words
 * marked.
 */
export function rankSearchDocs<T extends SearchDocLike>(
  docs: readonly T[],
  query: string,
  boost?: (doc: T) => number,
  opts: { subject?: readonly string[] } = {},
): DocHit<T>[] {
  const { concepts, lang } = analyzeQuery(query, opts)
  if (!concepts.length) return []
  const whole = query.trim().toLowerCase()
  const multiWord = query.trim().split(/\s+/).length > 1
  const strong = new Set(strongConcepts(concepts))
  const required = requiredMatchesFor(concepts)

  const out: Array<DocHit<T> & { order: number }> = []
  docs.forEach((doc, order) => {
    const idx = docIndex(doc)
    let score = 0
    let matched = 0
    const titleHits = new Set<number>()
    let explain: Candidate | null = null
    for (const concept of concepts) {
      const candidates = conceptCandidates(concept, idx)
      if (!candidates.length) continue
      const best = candidates.reduce((a, b) => (b.weighted > a.weighted ? b : a))
      if (strong.has(concept)) {
        matched += 1
        score += best.weighted
      } else score += best.weighted * WEAK_WEIGHT
      if (best.field === 'title') best.indices?.forEach((i) => titleHits.add(i))
      else if (!explain || best.weighted > explain.weighted) explain = best
    }
    if (matched < required) return
    const coverage = strong.size ? matched / strong.size : 1
    if (multiWord && doc.title.toLowerCase().includes(whole)) score += 50 * DOC_FIELD_WEIGHT.title
    // Title hits of the other concepts are marked too.
    if (titleHits.size || !explain) for (const r of conceptRanges(concepts, idx.title)) for (let i = r.start; i < r.end; i++) titleHits.add(i)

    let value = ''
    let snippet: Segment[] | undefined
    const chosen = explain as Candidate | null
    if (chosen) {
      const src = chosen.source
      if (chosen.field === 'body' && src && chosen.range) {
        snippet = windowSegments(src.text, chosen.range, [chosen.range, ...conceptRanges(concepts, src)], SNIPPET_CHARS)
        value = snippet.map((s) => s.text).join('')
      } else if (src) {
        value = src.text
        const ranges = [...(chosen.range ? [chosen.range] : []), ...conceptRanges(concepts, src)]
        const anchor = chosen.range || ranges[0] || { start: 0, end: 0 }
        snippet = windowSegments(src.text, anchor, ranges, SNIPPET_CHARS)
      }
    }
    const sameLang = isZhLang(doc.lang) === (lang === 'zh')
    out.push({
      doc,
      score: score * coverage * WEIGHT_SCALE * (sameLang ? 1 : OTHER_LANG) + (boost ? boost(doc) : 0),
      field: chosen ? chosen.field : 'title',
      value,
      indices: Array.from(titleHits).sort((a, b) => a - b),
      snippet,
      coverage,
      order,
    })
  })
  out.sort((a, b) => b.score - a.score || a.order - b.order)
  // One of each EN / ZH twin: the better-ranked one.
  const seenTwins = new Set<string>()
  return out
    .filter(({ doc }) => {
      if (!doc.twin) return true
      if (seenTwins.has(doc.twin)) return false
      seenTwins.add(doc.twin)
      return true
    })
    .map(({ doc, score, field, value, indices, snippet, coverage }) => ({ doc, score, field, value, indices, snippet, coverage }))
}
