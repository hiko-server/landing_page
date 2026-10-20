/**
 * Query analysis and field matching for site search and "Ask" (pure).
 *
 *   analyzeQuery("Does he have patents?")
 *     → one concept, "patents": the typed word (stem "patent") plus its
 *       synonyms — 专利, inventor, invention, … (lib/search/synonyms) — and
 *       the CV section it asks about ("patents").
 *   analyzeQuery("他在哪里实习过？") → one concept, 实习 (+ intern, internship…).
 *   analyzeQuery("hong kong") → one concept (a known phrase), + 香港, HK.
 *
 * Question and function words ("does", "he", 吗, 哪里 …) and the site
 * owner's own names (the index ships them as `subject`) are dropped, unless
 * nothing else is left — a search for "about" still searches "about".
 *
 * fieldIndex / findAlt match one alternative against a text: CJK by
 * substring (or, for 3+ characters, by most of its bigrams), Latin by whole
 * stemmed words in sequence — a synonym "AI" never matches inside "detail".
 */

import { SYNONYM_GROUPS } from './synonyms'
import { EN_STOP_WORDS, bigrams, cjkWords, foldText, hasCjk, looksLikeQuestion, stem, tokenize, type Token } from './text'

/** Weight of a synonym relative to the word that was typed. */
export const SYNONYM_WEIGHT = 0.7

export type Alt = {
  /** Folded surface form: 'patent', 'hong kong', '香港'. */
  text: string
  /** Token terms in order: stemmed Latin words, or CJK bigrams. */
  terms: string[]
  cjk: boolean
  /** 1 for what was typed, SYNONYM_WEIGHT for a synonym. */
  weight: number
  literal: boolean
}

export type Concept = {
  /** The word(s) as typed. */
  label: string
  /** Folded, unstemmed Latin word(s) as typed ('' for CJK): the palette's fuzzy title match uses it. */
  raw: string
  alts: Alt[]
  /** Topics this concept asks about: CV sections (sessionName) or 'availability'. */
  sections: string[]
  cjk: boolean
  /**
   * A lone CJK character no synonym group knows (哪里人 → 人): too vague to
   * require. It still ranks a passage that has it, but a result never has
   * to match it, and a question of only weak words names nothing.
   */
  weak: boolean
}

export type AnalyzedQuery = {
  concepts: Concept[]
  /** The query reads as a question ("Does he…?", "…吗"). */
  question: boolean
  /** Language of the query: 'zh' when it contains CJK. */
  lang: 'en' | 'zh'
  /** Stop words or names were dropped. */
  stripped: boolean
  /** Every word was a stop word or a name, so they were kept ("about"): the query names nothing specific. */
  fallback: boolean
}

// ── Synonym tables (built once) ──────────────────────────────────────────

type Tables = { byKey: Map<string, number[]>; maxWords: number }
let tables: Tables | null = null

/** Lookup key of a term: stemmed Latin words joined by spaces, or the folded CJK term. */
export function termKey(term: string): string {
  const folded = foldText(term.trim())
  if (hasCjk(folded)) return folded.replace(/\s+/g, '')
  return tokenize(folded)
    .filter((t) => !t.cjk)
    .map((t) => t.term)
    .join(' ')
}

function synonymTables(): Tables {
  if (tables) return tables
  const byKey = new Map<string, number[]>()
  let maxWords = 1
  SYNONYM_GROUPS.forEach((g, gi) => {
    for (const term of [...g.terms, ...(g.ambiguous || [])]) {
      const key = termKey(term)
      if (!key) continue
      if (!hasCjk(key)) maxWords = Math.max(maxWords, key.split(' ').length)
      const list = byKey.get(key)
      if (!list) byKey.set(key, [gi])
      else if (!list.includes(gi)) list.push(gi)
    }
  })
  tables = { byKey, maxWords }
  return tables
}

/** An alternative for a term as written in a synonym group (or typed). */
export function altOf(term: string, weight: number, literal: boolean): Alt | null {
  const text = foldText(term.trim()).replace(/\s+/g, ' ')
  if (!text) return null
  if (hasCjk(text)) {
    const compact = text.replace(/\s+/g, '')
    return { text: compact, terms: bigrams(compact), cjk: true, weight, literal }
  }
  const terms = tokenize(text)
    .filter((t) => !t.cjk)
    .map((t) => t.term)
  return terms.length ? { text, terms, cjk: false, weight, literal } : null
}

// ── Analysis ─────────────────────────────────────────────────────────────

type Unit = { label: string; raw: string; key: string; cjk: boolean; stop: boolean }

/** A run of word characters joined by ".", "-", "+", "#", "/" or "'" ("next.js", "co-founder", "c++", "he's"). */
const LATIN_CHUNK_RE = /[\p{L}\p{N}]+(?:[.\-+#/'’][\p{L}\p{N}]+)*[+#]*/gu
const CJK_SPLIT_RE = /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+)/u

/**
 * CJK query words: single characters that sit next to each other are one
 * word the segmenter did not know (奖 + 项 → 奖项).
 */
function mergeSingles(words: readonly string[]): string[] {
  const out: string[] = []
  let pending = ''
  for (const w of words) {
    if (Array.from(w).length === 1) pending += w
    else {
      if (pending) out.push(pending)
      pending = ''
      out.push(w)
    }
  }
  if (pending) out.push(pending)
  return out
}

function unitsOf(query: string, subject: ReadonlySet<string>, subjectCjk: readonly string[]): Unit[] {
  const units: Unit[] = []
  const folded = foldText(query)
  // Split into CJK runs and the rest, keeping offsets for the labels.
  let offset = 0
  for (const part of folded.split(CJK_SPLIT_RE)) {
    const label = query.slice(offset, offset + part.length)
    if (!part) continue
    if (hasCjk(part)) {
      let run = part
      for (const name of subjectCjk) run = run.split(name).join(' ')
      const words = mergeSingles(run.split(/\s+/).filter(Boolean).flatMap((r) => cjkWords(r)))
      if (words.length) for (const w of words) units.push({ label: w, raw: '', key: w, cjk: true, stop: false })
      else units.push({ label, raw: '', key: part, cjk: true, stop: true })
    } else {
      LATIN_CHUNK_RE.lastIndex = 0
      for (let m = LATIN_CHUNK_RE.exec(part); m; m = LATIN_CHUNK_RE.exec(part)) {
        const raw = m[0]
        const words = tokenize(raw)
          .filter((t) => !t.cjk && t.term !== 'c++' && t.term !== 'c#' && t.term !== 'f#')
          .map((t) => raw.slice(t.start, t.end))
        if (!words.length) continue
        const symbol = /^(?:c\+\+|c#|f#|\.net)$/.test(raw)
        const key = symbol ? raw : words.map(stem).join(' ')
        const stop = !symbol && words.every((w) => EN_STOP_WORDS.has(w) || subject.has(w) || w === 's')
        units.push({ label: label.slice(m.index, m.index + raw.length), raw, key, cjk: false, stop })
      }
    }
    offset += part.length
  }
  return units
}

function conceptOf(label: string, raw: string, key: string, cjk: boolean): Concept {
  const { byKey } = synonymTables()
  const literal = cjk ? { text: key, terms: bigrams(key), cjk: true, weight: 1, literal: true } : altOf(raw, 1, true)
  const alts: Alt[] = literal ? [literal] : []
  const seen = new Set(alts.map((a) => a.text))
  const sections = new Set<string>()
  const groups = byKey.get(key) || []
  for (const gi of groups) {
    const group = SYNONYM_GROUPS[gi]
    group.sections?.forEach((s) => sections.add(s))
    for (const term of group.terms) {
      const alt = altOf(term, SYNONYM_WEIGHT, false)
      if (!alt || seen.has(alt.text) || (literal && termKey(term) === key)) continue
      // A lone character (读, 奖, 云) finds its group when typed, but is too
      // ambiguous to stand in for another word (读 is in 阅读 too).
      if (alt.cjk && Array.from(alt.text).length === 1) continue
      seen.add(alt.text)
      alts.push(alt)
    }
  }
  const weak = cjk && Array.from(key).length === 1 && !groups.length
  return { label, raw, alts, sections: Array.from(sections), cjk, weak }
}

type Span = { units: Unit[]; phrase: boolean }

/**
 * Group units into spans: a known multi-word phrase ("hong kong", "machine
 * learning", "open to work") is one span — found before stop words are
 * dropped, so a phrase with a function word in it survives — every other
 * unit is its own span.
 */
function spansOf(units: readonly Unit[]): Span[] {
  const { byKey, maxWords } = synonymTables()
  const out: Span[] = []
  for (let i = 0; i < units.length; ) {
    let taken = 1
    const cjk = units[i].cjk
    // CJK: words the segmenter split that form a known compound (编程 + 语言 → 编程语言).
    const longest = cjk ? Math.min(3, units.length - i) : Math.min(maxWords, units.length - i)
    for (let n = longest; n > 1; n--) {
      const slice = units.slice(i, i + n)
      const fits = cjk ? slice.every((s) => s.cjk && !s.stop) : slice.every((s) => !s.cjk) && !slice[0].stop && !slice[n - 1].stop
      if (!fits) continue
      if (byKey.has(slice.map((s) => s.key).join(cjk ? '' : ' '))) {
        out.push({ units: slice, phrase: true })
        taken = n
        break
      }
    }
    if (taken === 1) out.push({ units: [units[i]], phrase: false })
    i += taken
  }
  return out
}

/**
 * The concepts of a query (see the module comment). `subject` lists the site
 * owner's names (lower-case words and CJK names) to drop from questions.
 */
export function analyzeQuery(query: string, opts: { subject?: readonly string[] } = {}): AnalyzedQuery {
  const q = (query || '').replace(/\s+/g, ' ').trim()
  const lang: 'en' | 'zh' = hasCjk(q) ? 'zh' : 'en'
  if (!q) return { concepts: [], question: false, lang, stripped: false, fallback: false }
  const subjectWords = new Set<string>()
  const subjectCjk: string[] = []
  for (const s of opts.subject || []) {
    const f = foldText(String(s || '').trim())
    if (!f) continue
    if (hasCjk(f)) subjectCjk.push(f.replace(/\s+/g, ''))
    else f.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1).forEach((w) => subjectWords.add(w))
  }
  subjectCjk.sort((a, b) => b.length - a.length)

  const spans = spansOf(unitsOf(q, subjectWords, subjectCjk))
  let kept = spans.filter((s) => s.phrase || !s.units[0].stop)
  const stripped = kept.length < spans.length
  const fallback = !kept.length && spans.length > 0
  if (fallback) kept = spans

  const concepts = kept.map(({ units, phrase }) => {
    if (!phrase) return conceptOf(units[0].label, units[0].raw, units[0].key, units[0].cjk)
    const cjk = units[0].cjk
    const sep = cjk ? '' : ' '
    return conceptOf(
      units.map((s) => s.label).join(sep),
      units.map((s) => s.raw).join(sep),
      units.map((s) => s.key).join(sep),
      cjk,
    )
  })
  // The same concept typed twice counts once.
  const unique = concepts.filter((c, i) => concepts.findIndex((d) => d.alts[0]?.text === c.alts[0]?.text) === i)
  return { concepts: unique, question: looksLikeQuestion(q), lang, stripped, fallback }
}

/**
 * How many of a query's concepts a result must match: all of one or two
 * (keywords), 60 % of a longer, natural-language query. Weak concepts
 * (Concept.weak) are never required, unless the query has nothing else.
 */
export function requiredMatchesFor(concepts: readonly Concept[] | number): number {
  const n = typeof concepts === 'number' ? concepts : strongConcepts(concepts).length
  return n <= 2 ? n : Math.ceil(n * 0.6)
}

/** The concepts a result is required to match: the strong ones, or all of them when every one is weak. */
export function strongConcepts(concepts: readonly Concept[]): Concept[] {
  const strong = concepts.filter((c) => !c.weak)
  return strong.length ? strong : [...concepts]
}

// ── Field matching ───────────────────────────────────────────────────────

export type FieldIndex = {
  text: string
  folded: string
  tokens: Token[]
  /** term → indices into `tokens`. */
  terms: Map<string, number[]>
}

export function fieldIndex(text: string): FieldIndex {
  const folded = foldText(text)
  const tokens = tokenize(text, folded)
  const terms = new Map<string, number[]>()
  tokens.forEach((t, i) => {
    const list = terms.get(t.term)
    if (list) list.push(i)
    else terms.set(t.term, [i])
  })
  return { text, folded, tokens, terms }
}

export type Range = { start: number; end: number }

export type AltHit = Range & {
  /** 1 for a full match; the share of bigrams found for a partial CJK match. */
  coverage: number
}

/** Smallest share of a 3+ character CJK word's bigrams that still counts as a (partial) match. */
export const CJK_PARTIAL_MIN = 2 / 3

/** Where `alt` occurs in the field (first occurrence), or null. */
export function findAlt(alt: Alt, f: FieldIndex): AltHit | null {
  if (!alt.terms.length) return null
  if (alt.cjk) {
    if (!f.terms.has(alt.terms[0]) && alt.terms.length > 1) {
      // The first bigram is missing: only a partial match is possible.
    } else {
      const at = f.folded.indexOf(alt.text)
      if (at >= 0) return { start: at, end: at + alt.text.length, coverage: 1 }
    }
    if (alt.terms.length < 2 || Array.from(alt.text).length < 3) return null
    let found = 0
    let first: Range | null = null
    for (const term of alt.terms) {
      const at = f.terms.get(term)
      if (!at) continue
      found += 1
      const tok = f.tokens[at[0]]
      if (!first || tok.start < first.start) first = { start: tok.start, end: tok.end }
    }
    const coverage = found / alt.terms.length
    return first && coverage >= CJK_PARTIAL_MIN ? { ...first, coverage } : null
  }
  const starts = f.terms.get(alt.terms[0])
  if (!starts) return null
  for (const i of starts) {
    let ok = true
    for (let k = 1; k < alt.terms.length; k++) {
      const t = f.tokens[i + k]
      if (!t || t.cjk || t.term !== alt.terms[k]) {
        ok = false
        break
      }
    }
    if (ok) return { start: f.tokens[i].start, end: f.tokens[i + alt.terms.length - 1].end, coverage: 1 }
  }
  return null
}

/** Every occurrence of `alt` in the field (whole matches only), for highlighting. */
export function allAltRanges(alt: Alt, f: FieldIndex, limit = 12): Range[] {
  const out: Range[] = []
  if (!alt.terms.length) return out
  if (alt.cjk) {
    for (let at = f.folded.indexOf(alt.text); at >= 0 && out.length < limit; at = f.folded.indexOf(alt.text, at + alt.text.length)) {
      out.push({ start: at, end: at + alt.text.length })
    }
    return out
  }
  for (const i of f.terms.get(alt.terms[0]) || []) {
    if (out.length >= limit) break
    let ok = true
    for (let k = 1; k < alt.terms.length; k++) {
      const t = f.tokens[i + k]
      if (!t || t.cjk || t.term !== alt.terms[k]) {
        ok = false
        break
      }
    }
    if (ok) out.push({ start: f.tokens[i].start, end: f.tokens[i + alt.terms.length - 1].end })
  }
  return out
}

/** Merge overlapping / touching ranges, sorted. */
export function mergeRanges(ranges: readonly Range[]): Range[] {
  const sorted = [...ranges].filter((r) => r.end > r.start).sort((a, b) => a.start - b.start || b.end - a.end)
  const out: Range[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else out.push({ ...r })
  }
  return out
}

export type Segment = { text: string; match: boolean }

/** `text` split into plain / marked runs for the given ranges. */
export function markRanges(text: string, ranges: readonly Range[]): Segment[] {
  const out: Segment[] = []
  let pos = 0
  for (const r of mergeRanges(ranges)) {
    const start = Math.max(pos, r.start)
    const end = Math.min(text.length, r.end)
    if (end <= start) continue
    if (start > pos) out.push({ text: text.slice(pos, start), match: false })
    out.push({ text: text.slice(start, end), match: true })
    pos = end
  }
  if (pos < text.length) out.push({ text: text.slice(pos), match: false })
  return out
}

/**
 * A window of about `width` characters of `text` centred on `anchor`, with
 * every range inside it marked, an ellipsis where it was cut.
 */
export function windowSegments(text: string, anchor: Range, ranges: readonly Range[], width: number): Segment[] {
  const len = anchor.end - anchor.start
  const half = Math.max(0, Math.floor((width - len) / 2))
  let start = Math.max(0, anchor.start - half)
  const end = Math.min(text.length, Math.max(anchor.end, start + width))
  start = Math.max(0, Math.min(start, end - width))
  // Do not cut a surrogate pair in half.
  if (start > 0 && /[\udc00-\udfff]/.test(text[start])) start -= 1
  const inside = ranges
    .map((r) => ({ start: Math.max(r.start, start), end: Math.min(r.end, end) }))
    .filter((r) => r.end > r.start)
    .map((r) => ({ start: r.start - start, end: r.end - start }))
  const segs = markRanges(text.slice(start, end), inside)
  if (start > 0) {
    if (segs[0] && !segs[0].match) segs[0] = { ...segs[0], text: `…${segs[0].text}` }
    else segs.unshift({ text: '…', match: false })
  }
  if (end < text.length) {
    const last = segs[segs.length - 1]
    if (last && !last.match) segs[segs.length - 1] = { ...last, text: `${last.text}…` }
    else segs.push({ text: '…', match: false })
  }
  return segs.filter((s) => s.text)
}
