/**
 * Word and character counts for the admin writing bar (H3) — pure,
 * client-safe and unit-tested.
 *
 * Counted over the prose a reader reads (lib/toc readableText: no link
 * targets, URLs, JSX tags or Markdown markers), the same text the public
 * reading time is computed from, and the reading time itself is
 * lib/toc readingMinutes — so the editor and the published page agree.
 *
 *   words       Latin-script words (Intl.Segmenter word segments, numbers
 *               included) plus every CJK character — Chinese, Japanese and
 *               Korean are counted by character, as word processors do;
 *   cjk         the CJK characters among them (字数);
 *   characters  user-perceived characters (grapheme clusters) with spaces,
 *               runs of whitespace counted once;
 *   charactersNoSpaces  the same without whitespace.
 */

import { readableText, readingMinutes } from './toc'

export type TextStats = {
  words: number
  cjk: number
  characters: number
  charactersNoSpaces: number
  readingMinutes: number
}

const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const CJK_RE_G = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu
const LATIN_WORD_RE = /[\p{Script=Latin}\p{N}][\p{Script=Latin}\p{N}'’-]*/gu

type SegmenterLike = { segment: (s: string) => Iterable<{ segment: string; isWordLike?: boolean }> }

function segmenter(granularity: 'word' | 'grapheme'): SegmenterLike | null {
  const Seg = (Intl as unknown as { Segmenter?: new (locale?: string, o?: { granularity: string }) => SegmenterLike }).Segmenter
  if (typeof Seg !== 'function') return null
  try {
    return new Seg('en', { granularity })
  } catch {
    return null
  }
}

const wordSeg = segmenter('word')
const graphemeSeg = segmenter('grapheme')

/** Latin-script (and other non-CJK) words of `text`; CJK runs are left to the character count. */
export function latinWordCount(text: string): number {
  const nonCjk = text.replace(CJK_RE_G, ' ')
  if (!wordSeg) return nonCjk.match(LATIN_WORD_RE)?.length ?? 0
  let n = 0
  for (const s of wordSeg.segment(nonCjk)) if (s.isWordLike && !CJK_RE.test(s.segment)) n++
  return n
}

/** Grapheme clusters (an emoji or "é" written as two code points counts once). */
export function graphemeCount(text: string): number {
  return graphemeSeg ? Array.from(graphemeSeg.segment(text)).length : Array.from(text).length
}

export function textStats(markdown: string): TextStats {
  const text = readableText(markdown || '')
  const cjk = text.match(CJK_RE_G)?.length ?? 0
  const spaced = text.replace(/\s+/g, ' ').trim()
  return {
    words: latinWordCount(text) + cjk,
    cjk,
    characters: graphemeCount(spaced),
    charactersNoSpaces: graphemeCount(spaced.replace(/\s/g, '')),
    readingMinutes: text.trim() ? readingMinutes(markdown) : 0,
  }
}

/** "1,234" in the admin's locale-independent format. */
export const formatCount = (n: number) => n.toLocaleString('en-US')

/** The writing bar's one-line summary, e.g. "1,234 words · 6,010 characters · 6 min read". */
export function statsSummary(s: TextStats): string {
  const words = `${formatCount(s.words)} word${s.words === 1 ? '' : 's'}`
  const cjk = s.cjk && s.cjk !== s.words ? ` (${formatCount(s.cjk)} CJK)` : ''
  const chars = `${formatCount(s.characters)} character${s.characters === 1 ? '' : 's'}`
  const read = s.readingMinutes ? ` · ${s.readingMinutes} min read` : ''
  return `${words}${cjk} · ${chars}${read}`
}
