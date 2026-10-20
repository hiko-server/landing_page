/**
 * Find & replace for the admin editor (H3) — the matching rules, pure and
 * unit-tested. Used on the raw MDX text (the MDX tab) and, block by block,
 * on the visual editor's document (./findPlugin.ts).
 *
 *   - plain text by default, case-insensitive unless "Match case";
 *   - "Whole word" only matches when no letter, digit or "_" touches the
 *     match (Unicode-aware, so it also works next to accented letters;
 *     CJK text has no word boundaries and simply matches);
 *   - "Regex": a JavaScript regular expression; the replacement may use
 *     $1…$9 / $& like String.replace. An invalid pattern is reported, never
 *     thrown. Empty matches are skipped.
 */

export type FindOptions = { caseSensitive: boolean; wholeWord: boolean; regex: boolean }

export type Match = { from: number; to: number }

export const DEFAULT_FIND_OPTIONS: FindOptions = { caseSensitive: false, wholeWord: false, regex: false }

/** Stop collecting after this many matches (a pathological query on a long body). */
export const MAX_MATCHES = 2000

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The search pattern, or an error message for an invalid regular expression. */
export function buildMatcher(query: string, opts: FindOptions): { re: RegExp | null; error: string } {
  if (!query) return { re: null, error: '' }
  let source = opts.regex ? query : escapeRe(query)
  if (opts.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`
  try {
    return { re: new RegExp(source, `gu${opts.caseSensitive ? '' : 'i'}`), error: '' }
  } catch (err) {
    return { re: null, error: err instanceof Error ? err.message.replace(/^Invalid regular expression: /, '') : 'Invalid pattern' }
  }
}

/** Every non-empty match of `re` in `text` (at most `limit`). */
export function findAll(text: string, re: RegExp | null, limit = MAX_MATCHES): Match[] {
  if (!re || !text) return []
  const out: Match[] = []
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
  let m: RegExpExecArray | null
  while ((m = g.exec(text)) && out.length < limit) {
    if (m[0].length === 0) {
      g.lastIndex += 1
      continue
    }
    out.push({ from: m.index, to: m.index + m[0].length })
  }
  return out
}

/** The replacement text for one matched string ($1…, $& expanded in regex mode). */
export function expandReplacement(matched: string, re: RegExp, replacement: string, opts: FindOptions): string {
  if (!opts.regex) return replacement
  const single = new RegExp(re.source, re.flags.replace('g', ''))
  return matched.replace(single, replacement)
}

/** `text` with one match replaced. */
export function replaceOne(text: string, match: Match, re: RegExp, replacement: string, opts: FindOptions): string {
  const matched = text.slice(match.from, match.to)
  return text.slice(0, match.from) + expandReplacement(matched, re, replacement, opts) + text.slice(match.to)
}

/** `text` with every match replaced, and how many there were. */
export function replaceAll(text: string, re: RegExp | null, replacement: string, opts: FindOptions): { text: string; count: number } {
  const matches = findAll(text, re, Number.MAX_SAFE_INTEGER)
  if (!re || !matches.length) return { text, count: 0 }
  let out = ''
  let last = 0
  for (const m of matches) {
    out += text.slice(last, m.from) + expandReplacement(text.slice(m.from, m.to), re, replacement, opts)
    last = m.to
  }
  return { text: out + text.slice(last), count: matches.length }
}

/** Index of the first match at or after `pos` (wrapping to 0), or -1. */
export function matchAtOrAfter(matches: readonly Match[], pos: number): number {
  if (!matches.length) return -1
  const i = matches.findIndex((m) => m.from >= pos)
  return i === -1 ? 0 : i
}

/** 1-based line of a character offset (for the MDX tab's "line 12" hint). */
export function lineOf(text: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++
  return line
}
