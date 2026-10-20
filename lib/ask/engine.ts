/**
 * "Ask" (J1): answer a question about the site's owner ONLY with passages
 * quoted from the site's public pages. Pure; runs in the browser over the
 * passage index of GET /api/search-index (lib/askIndex.ts). Nothing is
 * generated and nothing leaves the browser: the answer is a ranked list of
 * verbatim quotes (and an entry's facts line), each with a link to where it
 * appears; when no passage matches, the answer says so.
 *
 * Ranking
 *   - The question is analysed like a search (lib/search/query): question
 *     words and the owner's names dropped, CJK words, synonyms in English
 *     and Chinese ("internship" ↔ 实习, "patents" ↔ 专利), the topics a
 *     word asks about ("awards" → the Competitions & Awards entries).
 *   - Passages are scored with BM25 (k1 1.2, b 0.75) over their words (CJK
 *     bigrams), their section / entry / page names counting at 40 %; each
 *     concept counts with its best alternative (a synonym at 70 %), a passage
 *     of the topic a concept asks about counts as a match, and a passage must
 *     match all of one- or two-concept questions and 60 % of longer ones
 *     (lone CJK characters no synonym knows are never required).
 *   - Quotes in the question's language rank first; of an EN / ZH pair of
 *     the same CV line (same twin key) only one is shown.
 *   - Answers are grouped by source (a CV entry, an article section), best
 *     source first, quotes in page order, with the matched words marked.
 */

import {
  allAltRanges,
  analyzeQuery,
  fieldIndex,
  markRanges,
  requiredMatchesFor,
  strongConcepts,
  SYNONYM_WEIGHT,
  type Alt,
  type Concept,
  type FieldIndex,
  type Range,
  type Segment,
} from '../search/query'
import { foldText, hasCjk, tokenize } from '../search/text'
import { directiveOf, withTextDirective } from '../search/textFragment'

/** A passage as the browser uses it (validated from the index). */
export type Passage = {
  id: number
  text: string
  /** Same-site page URL with the source's anchor. */
  url: string
  /** Raw text-directive terms ([] when the passage cannot be highlighted). */
  terms: string[]
  page: string
  section: string
  title: string
  lang: string
  kind: string
  /** The source's topic: a CV section (sessionName), 'availability', or ''. */
  topic: string
  /** Key shared with the same CV line in the other language ('' when none). */
  twin: string
  /** Index of the source (passages of one source are one group). */
  source: number
  /** A facts line (an entry's title · organisation · dates), not a verbatim quote. */
  meta: boolean
}

const isSitePath = (u: unknown): u is string => typeof u === 'string' && u.startsWith('/') && !u.startsWith('//') && !u.startsWith('/\\')
const str = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Validate the `ask` part of GET /api/search-index; malformed rows are dropped. */
export function parseAskIndex(raw: unknown): Passage[] {
  const o = raw && typeof raw === 'object' ? (raw as { sources?: unknown; passages?: unknown }) : {}
  const sources = Array.isArray(o.sources) ? o.sources : []
  const out: Passage[] = []
  for (const row of Array.isArray(o.passages) ? o.passages : []) {
    if (!row || typeof row !== 'object') continue
    const p = row as { t?: unknown; s?: unknown; f?: unknown; a?: unknown; l?: unknown; m?: unknown }
    const text = str(p.t)
    const si = typeof p.s === 'number' && Number.isInteger(p.s) ? p.s : -1
    const src = sources[si] as Record<string, unknown> | undefined
    if (!text || !src || typeof src !== 'object' || !isSitePath(src.url)) continue
    let terms: string[] = []
    if (p.f === 1) terms = [text]
    else if (Array.isArray(p.f) && p.f.length === 2 && p.f.every((n) => typeof n === 'number' && Number.isInteger(n))) {
      const [a, b] = p.f as number[]
      if (a > 0 && b > a && b < text.length) terms = [text.slice(0, a).trimEnd(), text.slice(b).trimStart()].filter(Boolean)
    } else if (Array.isArray(p.f) && p.f.length >= 1 && p.f.length <= 2 && p.f.every((t) => typeof t === 'string' && t.trim())) {
      terms = (p.f as string[]).map((t) => str(t, 400))
    }
    const align = str(src.align, 80)
    const line = str(p.a, 40)
    out.push({
      id: out.length,
      text,
      url: src.url as string,
      terms,
      page: str(src.page, 200),
      section: str(src.section, 200),
      title: str(src.title, 300),
      lang: str(p.l, 20) || str(src.lang, 20) || 'en',
      kind: str(src.kind, 20),
      topic: str(src.topic, 40),
      twin: align && line ? `${align}:${line}` : '',
      source: si,
      meta: p.m === 1,
    })
  }
  return out
}

/** The link of a passage: its page, the source anchor and a text directive that highlights it. */
export function passageHref(p: Pick<Passage, 'url' | 'terms'>): string {
  return withTextDirective(p.url, p.terms.length ? directiveOf(p.terms) : undefined)
}

// ── Engine ───────────────────────────────────────────────────────────────

type Indexed = {
  p: Passage
  f: FieldIndex
  /** term → weighted frequency (text 1, context 0.4). */
  tf: Map<string, number>
  len: number
  /** Folded text + context, for lone-character CJK words. */
  hay: string
}

export type AskEngine = {
  passages: Passage[]
  docs: Indexed[]
  df: Map<string, number>
  avgLen: number
}

const CONTEXT_WEIGHT = 0.4
const K1 = 1.2
const B = 0.75

export function createAskEngine(passages: readonly Passage[]): AskEngine {
  const docs: Indexed[] = []
  const df = new Map<string, number>()
  let total = 0
  for (const p of passages) {
    const f = fieldIndex(p.text)
    const tf = new Map<string, number>()
    for (const t of f.tokens) tf.set(t.term, (tf.get(t.term) || 0) + 1)
    const ctx = [p.section, p.title, p.page].filter(Boolean).join(' ')
    for (const t of tokenize(ctx)) tf.set(t.term, (tf.get(t.term) || 0) + CONTEXT_WEIGHT)
    for (const term of tf.keys()) df.set(term, (df.get(term) || 0) + 1)
    const len = Math.max(1, f.tokens.length)
    total += len
    docs.push({ p, f, tf, len, hay: `${f.folded} ${foldText(ctx)}` })
  }
  return { passages: [...passages], docs, df, avgLen: docs.length ? total / docs.length : 1 }
}

function idf(engine: AskEngine, term: string): number {
  const n = engine.docs.length
  const d = engine.df.get(term) || 0
  return Math.log(1 + (n - d + 0.5) / (d + 0.5))
}

function bm25(engine: AskEngine, doc: Indexed, term: string): number {
  const tf = doc.tf.get(term) || 0
  if (!tf) return 0
  const norm = tf + K1 * (1 - B + (B * doc.len) / engine.avgLen)
  return (idf(engine, term) * tf * (K1 + 1)) / norm
}

/** Smallest share of a CJK word's bigrams a passage must contain. */
const CJK_COVERAGE_MIN = 2 / 3

/** Score of one alternative in one passage (0 = no match). */
function altScore(engine: AskEngine, doc: Indexed, alt: Alt): number {
  if (!alt.terms.length) return 0
  if (alt.cjk && Array.from(alt.text).length === 1) {
    // A lone character: present or not.
    return doc.hay.includes(alt.text) ? 1 : 0
  }
  let sum = 0
  let found = 0
  for (const term of alt.terms) {
    const s = bm25(engine, doc, term)
    if (s > 0) {
      sum += s
      found += 1
    }
  }
  if (!found) return 0
  const coverage = found / alt.terms.length
  if (alt.cjk ? coverage < CJK_COVERAGE_MIN : coverage < 1) return 0
  let score = (sum / alt.terms.length) * coverage
  // The exact word / phrase, not only its parts.
  if (alt.terms.length > 1 && (alt.cjk ? doc.hay.includes(alt.text) : allAltRanges(alt, doc.f, 1).length > 0)) score *= 1.25
  return score
}

/** A passage of the topic a concept asks about counts at least this much (about one rare word)… */
const TOPIC_MATCH = 1.6
/** …plus this, so on-topic passages outrank a stray synonym elsewhere ("major" in a project for "study"). */
const TOPIC_BONUS = 1
/** A concept found only in a passage's context (its section / entry / page name) counts this much. */
const CONTEXT_ONLY = 0.6
/** Passages in the other language than the question's count this much. */
const OTHER_LANG = 0.8
/** A weak concept (Concept.weak) adds this share of its score and is never required. */
const WEAK_WEIGHT = 0.3

export type ScoredPassage = { passage: Passage; score: number; coverage: number; matched: Concept[] }

const isZh = (lang: string) => /^zh/i.test(lang)

/** Every passage that answers the concepts, best first. */
export function rankPassages(engine: AskEngine, concepts: readonly Concept[], lang: 'en' | 'zh'): ScoredPassage[] {
  if (!concepts.length) return []
  const strong = new Set(strongConcepts(concepts))
  const required = requiredMatchesFor(concepts)
  const out: ScoredPassage[] = []
  for (const doc of engine.docs) {
    let score = 0
    let hits = 0
    const matched: Concept[] = []
    for (const c of concepts) {
      let best = 0
      let inText = false
      for (const alt of c.alts) {
        const s = altScore(engine, doc, alt) * alt.weight
        if (s <= 0) continue
        best = Math.max(best, s)
        if (!inText) inText = alt.cjk && Array.from(alt.text).length === 1 ? doc.f.folded.includes(alt.text) : allAltRanges(alt, doc.f, 1).length > 0
      }
      // Words only in the section / entry name: the passage is about it, but does not say it.
      if (best > 0 && !inText) best *= CONTEXT_ONLY
      if (doc.p.topic && c.sections.includes(doc.p.topic)) best = Math.max(best, TOPIC_MATCH * SYNONYM_WEIGHT) + TOPIC_BONUS
      if (best <= 0) continue
      matched.push(c)
      if (strong.has(c)) {
        score += best
        hits += 1
      } else score += best * WEAK_WEIGHT
    }
    if (hits < required) continue
    const coverage = strong.size ? hits / strong.size : 1
    const sameLang = (lang === 'zh') === isZh(doc.p.lang)
    out.push({ passage: doc.p, score: score * coverage * (sameLang ? 1 : OTHER_LANG), coverage, matched })
  }
  return out.sort((a, b) => b.score - a.score || a.passage.id - b.passage.id)
}

// ── Answers ──────────────────────────────────────────────────────────────

export type Quote = {
  passage: Passage
  /** The text with the matched words marked. */
  segments: Segment[]
  /** Link to the passage on its page (with a text directive when it can be highlighted). */
  href: string
  score: number
}

export type AnswerGroup = {
  source: number
  page: string
  section: string
  title: string
  kind: string
  lang: string
  /** The source link (page + anchor). */
  url: string
  quotes: Quote[]
  /** Further passages of this source that also match (not shown). */
  more: number
}

export type AskStatus = 'empty' | 'vague' | 'answered' | 'partial' | 'none'

export type AskResult = {
  /**
   * 'empty'    nothing asked yet;
   * 'vague'    only question words ("what does he do?"): nothing to look for;
   * 'answered' passages match the whole question;
   * 'partial'  the best passages match only part of a longer question;
   * 'none'     nothing on the site answers it.
   */
  status: AskStatus
  /** Language of the question ('zh' when it has CJK). */
  lang: 'en' | 'zh'
  groups: AnswerGroup[]
  /** Number of quotes shown. */
  count: number
  /** For 'partial': the words of the question no shown passage covers. */
  missing: string[]
}

export type AskOptions = {
  /** The owner's public names (dropped from questions). */
  subject?: readonly string[]
  /** At most this many sources… */
  maxGroups?: number
  /** …this many quotes per source… */
  maxPerGroup?: number
  /** …and this many quotes in all. */
  maxQuotes?: number
}

/** A quote is shown when it scores at least this share of the best one. */
const RELATIVE_FLOOR = 0.3

/** Mark every match of the matched concepts in a passage. */
function quoteSegments(engine: AskEngine, p: Passage, matched: readonly Concept[]): Segment[] {
  const doc = engine.docs[p.id]
  const ranges: Range[] = []
  for (const c of matched) for (const alt of c.alts) ranges.push(...allAltRanges(alt, doc?.f ?? fieldIndex(p.text)))
  return markRanges(p.text, ranges)
}

/** Answer a question (see the module comment). */
export function ask(engine: AskEngine, question: string, opts: AskOptions = {}): AskResult {
  const { maxGroups = 3, maxPerGroup = 3, maxQuotes = 7 } = opts
  const q = (question || '').trim()
  const analysed = analyzeQuery(q, { subject: opts.subject })
  const lang = analysed.lang
  const empty = (status: AskStatus): AskResult => ({ status, lang, groups: [], count: 0, missing: [] })
  if (!q) return empty('empty')
  if (analysed.fallback || !analysed.concepts.length || analysed.concepts.every((c) => c.weak)) return empty('vague')
  const ranked = rankPassages(engine, analysed.concepts, lang)
  if (!ranked.length) return empty('none')
  const top = ranked[0].score
  const preferZh = lang === 'zh'
  // One of each EN / ZH twin: the one in the question's language when both match.
  const byTwin = new Map<string, ScoredPassage>()
  for (const r of ranked) {
    if (!r.passage.twin) continue
    const prev = byTwin.get(r.passage.twin)
    const preferred = (s: ScoredPassage) => isZh(s.passage.lang) === preferZh
    if (!prev || (preferred(r) && !preferred(prev))) byTwin.set(r.passage.twin, r)
  }
  const kept = ranked.filter((r) => r.score >= top * RELATIVE_FLOOR && (!r.passage.twin || byTwin.get(r.passage.twin) === r))
  const groups = new Map<number, { best: number; items: ScoredPassage[] }>()
  for (const r of kept) {
    const g = groups.get(r.passage.source)
    if (g) g.items.push(r)
    else groups.set(r.passage.source, { best: r.score, items: [r] })
  }
  const chosen = Array.from(groups.entries())
    .sort((a, b) => b[1].best - a[1].best)
    .slice(0, maxGroups)
  const out: AnswerGroup[] = []
  let count = 0
  for (const [source, g] of chosen) {
    if (count >= maxQuotes) break
    const take = Math.min(maxPerGroup, maxQuotes - count)
    const items = g.items.slice(0, take).sort((a, b) => a.passage.id - b.passage.id)
    const first = items[0].passage
    out.push({
      source,
      page: first.page,
      section: first.section,
      title: first.title,
      kind: first.kind,
      lang: first.lang,
      url: first.url,
      quotes: items.map((r) => ({ passage: r.passage, segments: quoteSegments(engine, r.passage, r.matched), href: passageHref(r.passage), score: r.score })),
      more: g.items.length - items.length,
    })
    count += items.length
  }
  const shown = out.flatMap((g) => g.quotes)
  const best = ranked[0]
  const status: AskStatus = best.coverage < 1 ? 'partial' : 'answered'
  const covered = new Set(shown.flatMap((qt) => ranked.find((r) => r.passage === qt.passage)?.matched ?? []))
  const missing = status === 'partial' ? strongConcepts(analysed.concepts).filter((c) => !covered.has(c)).map((c) => c.label) : []
  return { status, lang, groups: out, count, missing }
}

/** True when the text is written in Chinese (the answer view then speaks Chinese too). */
export function isChinese(text: string): boolean {
  return hasCjk(text)
}

// ── Suggested questions ──────────────────────────────────────────────────

/**
 * Questions the empty Ask view offers. Generic on purpose — they name
 * topics, never facts — and a suggestion is shown only when this site
 * answers it (askSuggestions), so none leads to "nothing found".
 */
export const SUGGESTED_QUESTIONS: Readonly<Record<'en' | 'zh', readonly string[]>> = {
  en: [
    'Does he have any patents?',
    'Where did he study?',
    'What internships has he done?',
    'Has he won any awards?',
    'Has he founded a startup?',
    'Does he have machine learning experience?',
    'Which certifications does he hold?',
    'What languages does he speak?',
    'Has he published any papers?',
    'Is he available for new roles?',
  ],
  zh: [
    '他有专利吗？',
    '他在哪里读书？',
    '他做过哪些实习？',
    '他获得过什么奖项？',
    '他创过业吗？',
    '他有机器学习经验吗？',
    '他有哪些证书？',
    '他会说哪些语言？',
    '他发表过论文吗？',
    '他现在在找工作吗？',
  ],
}

export type Suggestion = { question: string; lang: 'en' | 'zh' }

/**
 * Up to `limit` suggested questions this site answers in full: `primary`
 * language first, then `secondary` ones (at most `secondaryMax`).
 */
export function askSuggestions(
  engine: AskEngine,
  opts: { subject?: readonly string[]; primary?: 'en' | 'zh'; limit?: number; secondaryMax?: number } = {},
): Suggestion[] {
  const { primary = 'en', limit = 5, secondaryMax = 2 } = opts
  const secondary: 'en' | 'zh' = primary === 'en' ? 'zh' : 'en'
  const answered = (lang: 'en' | 'zh') =>
    SUGGESTED_QUESTIONS[lang].filter((question) => ask(engine, question, { subject: opts.subject }).status === 'answered').map((question) => ({ question, lang }))
  const second = answered(secondary).slice(0, Math.min(secondaryMax, limit))
  return [...answered(primary).slice(0, limit - second.length), ...second]
}
