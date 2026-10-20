/**
 * Text fragments (`#:~:text=…`, https://wicg.github.io/scroll-to-text-fragment/):
 * the link a cited passage carries, so the browser scrolls to the quote on
 * its page and highlights it. Pure; the "Ask" passage index computes them on
 * the server (lib/askIndex.ts), where the exact rendered text is known.
 *
 * Rules the directive must satisfy (spec §3.5–3.6):
 *   - each term (textStart, textEnd) matches inside ONE block, case- and
 *     accent-insensitively, starting and ending on word boundaries;
 *   - the range form `text=start,end` spans from the first match of start
 *     to the next match of end, so start must not occur earlier on the page;
 *   - '-', ',' and '&' are syntax: they are percent-encoded in the terms.
 *
 * So a short quote (one CV bullet, a short paragraph) is matched whole, and a
 * long one by its first and last words, cut at word boundaries (spaces in
 * Latin text; the dictionary segmenter's boundaries — the same ICU rules the
 * browser applies — or punctuation in CJK text), with the start lengthened
 * until no other text of the page contains it.
 */

import { foldText, hasCjk } from './text'

/** Quotes up to this many characters are matched whole (CJK characters weigh more in a URL). */
export const FULL_MATCH_MAX = { latin: 100, cjk: 40 } as const
/** Minimum length of the start and end terms of a range. */
export const RANGE_TERM_MIN = { latin: { start: 24, end: 16 }, cjk: { start: 10, end: 8 } } as const

/** Percent-encode one term of a text directive. */
export function encodeTextTerm(term: string): string {
  return encodeURIComponent(term).replace(/-/g, '%2D')
}

type Segmenter = { segment(input: string): Iterable<{ segment: string; index: number }> }
const segmenters = new Map<string, Segmenter | null>()

function wordSegmenter(locale: string): Segmenter | null {
  if (segmenters.has(locale)) return segmenters.get(locale) ?? null
  let seg: Segmenter | null = null
  try {
    const Ctor = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: 'word' }) => Segmenter }).Segmenter
    seg = Ctor ? new Ctor(locale, { granularity: 'word' }) : null
  } catch {
    seg = null
  }
  segmenters.set(locale, seg)
  return seg
}

const CJK_PUNCT_RE = /[，。；：、！？（）「」『』《》“”‘’,.;:!?()]/u

/**
 * Offsets in `text` where a term may start or end: 0, text.length and every
 * word boundary — spaces for Latin text; segmenter boundaries (or
 * punctuation without one) for CJK text.
 */
export function wordBoundaries(text: string): number[] {
  const out = new Set<number>([0, text.length])
  if (hasCjk(text)) {
    const seg = wordSegmenter('zh')
    if (seg) for (const s of seg.segment(text)) out.add(s.index)
    else {
      for (let i = 0; i < text.length; i++) {
        if (CJK_PUNCT_RE.test(text[i]) || /\s/.test(text[i])) {
          out.add(i)
          out.add(i + 1)
        }
      }
    }
  } else {
    for (let i = 0; i < text.length; i++) {
      if (/\s/.test(text[i])) {
        out.add(i)
        out.add(i + 1)
      }
    }
  }
  return Array.from(out).sort((a, b) => a - b)
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * The text directive ("text=…", without the leading "#:~:") for `text`, the
 * whole text content of one rendered block — or of a sentence run inside one
 * (sentences start and end on word boundaries too). `others` are the other
 * texts of the same page: a range start is lengthened until none contains
 * it. '' for empty text.
 */
export function textDirective(text: string, others: readonly string[] = []): string {
  const terms = textDirectiveTerms(text, others)
  return terms.length ? directiveOf(terms) : ''
}

/** "text=start,end" for raw terms (percent-encoded here). */
export function directiveOf(terms: readonly string[]): string {
  return `text=${terms.map(encodeTextTerm).join(',')}`
}

/** The raw terms of textDirective(): [whole text] or [start, end]; [] for empty text. */
export function textDirectiveTerms(text: string, others: readonly string[] = []): string[] {
  const t = squash(text)
  if (!t) return []
  const cjk = hasCjk(t)
  const length = Array.from(t).length
  const full = [t]
  if (length <= (cjk ? FULL_MATCH_MAX.cjk : FULL_MATCH_MAX.latin)) return full
  const min = cjk ? RANGE_TERM_MIN.cjk : RANGE_TERM_MIN.latin
  const bounds = wordBoundaries(t)
  const foldedOthers = others.map((o) => foldText(squash(o))).filter((o) => o && o !== foldText(t))
  const unique = (term: string) => {
    const f = foldText(term)
    return !foldedOthers.some((o) => o.includes(f))
  }
  // Start: the shortest prefix of at least min.start characters, ending on a boundary, found in no other text.
  let startEnd = -1
  for (const b of bounds) {
    const term = t.slice(0, b).trimEnd()
    if (Array.from(term).length < min.start || !/[\p{L}\p{N}]$/u.test(term)) continue
    if (unique(term)) {
      startEnd = b
      break
    }
  }
  // End: the shortest suffix of at least min.end characters, starting on a boundary.
  let endStart = -1
  for (let i = bounds.length - 1; i >= 0; i--) {
    const b = bounds[i]
    const term = t.slice(b).trimStart()
    if (Array.from(term).length < min.end || !/^[\p{L}\p{N}]/u.test(term)) continue
    endStart = b
    break
  }
  if (startEnd < 0 || endStart < 0 || endStart <= startEnd) return full
  return [t.slice(0, startEnd).trimEnd(), t.slice(endStart).trimStart()]
}

/** `url` with a text directive appended ("/cv#cv-patents-0" + "text=…" → "/cv#cv-patents-0:~:text=…"). */
export function withTextDirective(url: string, directive: string | undefined): string {
  if (!directive) return url
  return url.includes('#') ? `${url}:~:${directive}` : `${url}#:~:${directive}`
}
