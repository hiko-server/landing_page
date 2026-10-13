/**
 * APA 7 reference for a publication, as plain text (for the clipboard).
 *
 *   Journal       Author, A. A., & Author, B. B. (2025). Title. Journal, 12(3), 45–67. https://doi.org/…
 *   Forthcoming   Author, A. A. (in press). Title. Journal. https://doi.org/…   (accepted / in press)
 *   Conference    Author, A. A. (2025). Title. In Proceedings (pp. 45–67). Publisher. https://doi.org/…
 *   Chapter       Author, A. A. (2025). Title. In Book (pp. 45–67). Publisher.
 *   Preprint      Author, A. A. (2025). Title. arXiv. https://…
 *   Thesis        Author, A. A. (2025). Title [Doctoral dissertation, School]. https://…
 *   Under review  Author, A. A. (2025). Title [Manuscript submitted for publication].
 *
 * Authors: up to 20 are listed with "&" before the last; from 21 on, the
 * first 19, an ellipsis and the last. A hidden co-author is an ellipsis in
 * place, so the order stays truthful. (Italics are lost in plain text.)
 */

import { formatDetails, formatPages } from './citation'
import { doiUrl } from './doi'
import { apaName } from './names'
import type { PubAuthor, Publication } from './types'

export type ApaOptions = {
  /** Origin for same-site links ("https://lucian-dev.com"); site paths are left out without it. */
  origin?: string
}

const ELLIPSIS = '…'

/** "Li, Y., Smith, J., & Doe, J." */
export function apaAuthors(authors: readonly PubAuthor[]): string {
  const names = authors.map((a) => (a.hidden ? ELLIPSIS : apaName(a.name)))
  if (!names.length) return ''
  if (names.length === 1) return names[0]
  if (names.length > 20) return `${names.slice(0, 19).join(', ')}, … ${names[names.length - 1]}`
  return `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`
}

/** End a sentence part with a full stop unless it already ends in . ? ! */
function sentence(s: string): string {
  const t = s.trim()
  if (!t) return ''
  return /[.?!]$/.test(t) ? t : `${t}.`
}

function thesisLabel(p: Publication): string {
  const where = `${p.venue} ${p.publisher}`
  if (/\bbachelor|\bundergraduate|\bb\.?\s?(?:sc|eng)\b|学士|本科/i.test(where)) return "Bachelor's thesis"
  if (/\bmaster|\bm\.?\s?(?:phil|sc|eng|res)\b|硕士/i.test(where)) return "Master's thesis"
  return 'Doctoral dissertation'
}

function link(p: Publication, origin?: string): string {
  const doi = doiUrl(p.doi)
  if (doi) return doi
  const href = p.url || p.pdfUrl
  if (!href) return ''
  if (href.startsWith('/')) return origin ? `${origin.replace(/\/$/, '')}${href}` : ''
  return href
}

export function toApa(p: Publication, opts: ApaOptions = {}): string {
  const forthcoming = p.status === 'in-press' || p.status === 'accepted'
  const when = `(${forthcoming ? 'in press' : p.year || 'n.d.'}).`
  const authors = apaAuthors(p.authors)
  const bare = p.title.trim().replace(/\.$/, '')

  let titlePart: string
  const rest: string[] = []
  if (p.status === 'under-review') {
    titlePart = `${bare} [Manuscript submitted for publication].`
  } else if (p.venueType === 'thesis') {
    const school = p.venue || p.publisher
    titlePart = `${bare} [${thesisLabel(p)}${school ? `, ${school}` : ''}].`
  } else {
    titlePart = sentence(p.title)
    const pages = p.pages && !forthcoming ? formatPages(p.pages) : ''
    if (p.venueType === 'conference' || p.venueType === 'workshop' || p.venueType === 'book-chapter') {
      if (p.venue) rest.push(`In ${p.venue}${pages ? ` (${/–/.test(pages) ? 'pp.' : 'p.'} ${pages})` : ''}.`)
      if (p.publisher) rest.push(sentence(p.publisher))
    } else if (p.venueType === 'journal') {
      const details = forthcoming ? '' : formatDetails(p)
      if (p.venue) rest.push(sentence([p.venue, details].filter(Boolean).join(', ')))
    } else {
      // Preprints and other work: the repository / venue, then the publisher when it differs.
      if (p.venue) rest.push(sentence(p.venue))
      if (p.publisher && p.publisher !== p.venue) rest.push(sentence(p.publisher))
    }
  }

  // Without an author the title takes the author position (APA 9.12).
  const lead = authors ? [sentence(authors), when, titlePart] : [titlePart, when]
  const tail = link(p, opts.origin)
  return [...lead, ...rest, tail].filter(Boolean).join(' ')
}
