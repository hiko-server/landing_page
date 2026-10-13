/**
 * BibTeX for a publication.
 *
 * Entry type by venue type and status:
 *   journal            → @article        (journal)
 *   conference / workshop → @inproceedings (booktitle)
 *   book-chapter       → @incollection   (booktitle)
 *   thesis             → @phdthesis, or @mastersthesis when the venue /
 *                        publisher names a master's degree (a bachelor's
 *                        thesis is @mastersthesis with type = {Bachelor's thesis})
 *   preprint / other   → @misc           (howpublished)
 *   any status "under review" → @unpublished with note = {Under review}
 *                        and no venue (the venue of a manuscript under
 *                        review is not cited).
 * Forthcoming work carries its status as a note (In press / Accepted), and
 * a preprint says so.
 *
 * Text fields escape BibTeX's special characters (\ { } $ & % # _ ~ ^);
 * capitalised words in titles (GPU, ImageNet) are braced so styles that
 * lowercase titles keep them. `doi` / `url` stay verbatim (biblatex and the
 * url package read them raw); a value with braces is left out rather than
 * breaking the entry. A hidden co-author becomes a trailing "and others".
 */

import { formatPages } from './citation'
import { bibtexName } from './names'
import { statusLabel, type Publication } from './types'

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Escape BibTeX/LaTeX special characters in a text field. */
export function escapeBibtex(value: string): string {
  return value
    .split('\\')
    .map((part) =>
      part
        .replace(/([{}$&%#_])/g, '\\$1')
        .replace(/~/g, '\\textasciitilde{}')
        .replace(/\^/g, '\\textasciicircum{}'),
    )
    .join('\\textbackslash{}')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Brace words with capitals after the first letter (GPU, ImageNet, LaTeX) so styles keep their case. */
export function protectCase(escapedTitle: string): string {
  return escapedTitle.replace(/(^|[\s(/–-])([\p{L}\p{N}]*\p{Lu}[\p{L}\p{N}]*)(?=$|[\s),.:;!?/–-])/gu, (m, lead: string, word: string) => {
    const chars = Array.from(word)
    const innerCap = chars.slice(1).some((c) => /\p{Lu}/u.test(c))
    return innerCap ? `${lead}{${word}}` : m
  })
}

function thesisKind(p: Publication): { type: 'phdthesis' | 'mastersthesis'; label?: string } {
  const where = `${p.venue} ${p.publisher}`
  if (/\bbachelor|\bundergraduate|\bb\.?\s?(?:sc|eng)\b|学士|本科/i.test(where)) return { type: 'mastersthesis', label: "Bachelor's thesis" }
  if (/\bmaster|\bm\.?\s?(?:phil|sc|eng|res)\b|硕士/i.test(where)) return { type: 'mastersthesis' }
  return { type: 'phdthesis' }
}

/** The entry type for a publication. */
export function bibtexType(p: Publication): string {
  if (p.status === 'under-review') return 'unpublished'
  switch (p.venueType) {
    case 'journal':
      return 'article'
    case 'conference':
    case 'workshop':
      return 'inproceedings'
    case 'book-chapter':
      return 'incollection'
    case 'thesis':
      return thesisKind(p).type
    default:
      return 'misc'
  }
}

export type BibtexOptions = {
  /** Citation key (see citationKeys). */
  key: string
  /** Origin for same-site links ("https://lucian-dev.com"); site paths are left out without it. */
  origin?: string
}

const verbatimOk = (v: string) => !!v && !/[{}\s]/.test(v)

function absolute(href: string, origin?: string): string {
  if (!href) return ''
  if (href.startsWith('/')) return origin ? `${origin.replace(/\/$/, '')}${href}` : ''
  return href
}

/** One BibTeX entry. */
export function toBibtex(p: Publication, opts: BibtexOptions): string {
  const type = bibtexType(p)
  const fields: Array<[string, string, 'braced' | 'bare']> = []
  const add = (name: string, value: string, mode: 'braced' | 'bare' = 'braced') => {
    if (value) fields.push([name, value, mode])
  }

  const visible = p.authors.filter((a) => !a.hidden)
  if (visible.length) {
    const names = visible.map((a) => bibtexName(a.name)).map(escapeAuthor)
    if (visible.length < p.authors.length) names.push('others')
    add('author', names.join(' and '))
  }
  add('title', protectCase(escapeBibtex(p.title)))

  const underReview = p.status === 'under-review'
  const venue = underReview ? '' : escapeBibtex(p.venue)
  if (type === 'article') add('journal', venue)
  else if (type === 'inproceedings' || type === 'incollection') add('booktitle', venue)
  else if (type === 'phdthesis' || type === 'mastersthesis') {
    add('school', venue || escapeBibtex(p.publisher))
    const label = thesisKind(p).label
    if (label) add('type', escapeBibtex(label))
  } else if (type === 'misc') add('howpublished', venue)

  if (!underReview) {
    if (type === 'article') {
      add('volume', escapeBibtex(p.volume))
      add('number', escapeBibtex(p.issue))
    } else if (type === 'inproceedings' || type === 'incollection') {
      add('volume', escapeBibtex(p.volume))
    }
    if (p.pages) add('pages', escapeBibtex(formatPages(p.pages)).replace(/–/g, '--'))
  }
  add('year', p.year)
  const month = p.date.length === 7 ? MONTHS[Number(p.date.slice(5, 7)) - 1] : ''
  if (month) add('month', month, 'bare')
  if (!underReview && !['phdthesis', 'mastersthesis'].includes(type)) add('publisher', escapeBibtex(p.publisher))
  if (verbatimOk(p.doi)) add('doi', p.doi)
  const url = absolute(p.url, opts.origin) || (p.doi ? '' : absolute(p.pdfUrl, opts.origin))
  if (verbatimOk(url)) add('url', url)
  if (p.status !== 'published') add('note', statusLabel(p.status, 'en'))
  if (p.keywords.length) add('keywords', p.keywords.map(escapeBibtex).join(', '))

  const width = Math.max(...fields.map(([n]) => n.length))
  const body = fields.map(([n, v, mode]) => `  ${n.padEnd(width)} = ${mode === 'bare' ? v : `{${v}}`}`).join(',\n')
  return `@${type}{${opts.key},\n${body}\n}`
}

/** Author names escaped, keeping the braces bibtexName added around corporate / multi-word names. */
function escapeAuthor(name: string): string {
  const braced = name.startsWith('{') && name.endsWith('}')
  if (braced) return `{${escapeBibtex(name.slice(1, -1))}}`
  // "{Family Name}, Given" — keep the leading group's braces.
  const m = name.match(/^\{([^}]*)\}(, .*)$/)
  if (m) return `{${escapeBibtex(m[1])}}${escapeBibtex(m[2])}`
  return escapeBibtex(name)
}

/** A whole bibliography (entries separated by a blank line). `keys` matches `list` (citationKeys). */
export function toBibtexAll(list: readonly Publication[], keys: readonly string[], origin?: string): string {
  return list.map((p, i) => toBibtex(p, { key: keys[i], origin })).join('\n\n')
}
