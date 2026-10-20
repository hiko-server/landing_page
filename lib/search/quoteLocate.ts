/**
 * Find a cited quote in a page's text, the way a text directive does
 * (lib/search/textFragment): the whole quote, or from its start term to the
 * first end term after it; case-, width- and accent-insensitive, whitespace
 * collapsed. Pure — components/Search/citation.ts builds the page text from
 * the DOM and maps the offsets back to text nodes.
 */

import { foldText } from './text'

export type FlatText = {
  /** The text with every whitespace run collapsed to one space, folded (lower case, no accents). */
  folded: string
  /** For each character of `folded`: its index in the source text. */
  map: number[]
}

/** Collapse whitespace and fold `text`, keeping a map back to the source offsets. */
export function flatten(text: string): FlatText {
  const folded = foldText(text)
  let out = ''
  const map: number[] = []
  let space = true
  for (let i = 0; i < folded.length; i++) {
    const ch = folded[i]
    if (/\s/.test(ch)) {
      if (space) continue
      space = true
      out += ' '
      map.push(i)
      continue
    }
    space = false
    out += ch
    map.push(i)
  }
  return { folded: out, map }
}

const norm = (t: string) => foldText(t.replace(/\s+/g, ' ').trim())

/**
 * Where the quote given by its directive terms ([whole] or [start, end])
 * lies in `flat`: offsets into flat.folded (end exclusive), or null.
 */
export function locateQuote(flat: FlatText, terms: readonly string[]): { start: number; end: number } | null {
  const [first, last] = terms.map(norm).filter(Boolean)
  if (!first) return null
  const start = flat.folded.indexOf(first)
  if (start < 0) return null
  if (!last) return { start, end: start + first.length }
  const endAt = flat.folded.indexOf(last, start + first.length)
  if (endAt < 0) return null
  return { start, end: endAt + last.length }
}
