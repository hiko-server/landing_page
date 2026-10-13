/**
 * JSON Resume `publications` (https://jsonresume.org/schema):
 *   { name, publisher, releaseDate, url, summary }
 *
 * The schema has no status field, so work that is not yet published says so
 * in `publisher` ("Accepted · Venue", "Under review", "Preprint · arXiv")
 * and carries no releaseDate unless it is a released preprint — a resume
 * built from this never passes unpublished work off as published.
 */

import { showsVenue } from './citation'
import { doiUrl } from './doi'
import { statusLabel, type Publication } from './types'

export type JsonResumePublication = {
  name: string
  publisher?: string
  releaseDate?: string
  url?: string
  summary?: string
}

export function toJsonResume(list: readonly Publication[], opts: { origin?: string } = {}): JsonResumePublication[] {
  return list.map((p) => {
    const venue = showsVenue(p) ? p.venue : ''
    const publisher = p.status === 'published' ? venue : [statusLabel(p.status, 'en'), venue].filter(Boolean).join(' · ')
    const href = doiUrl(p.doi) || p.url || p.pdfUrl
    const url = href.startsWith('/') ? (opts.origin ? `${opts.origin.replace(/\/$/, '')}${href}` : '') : href
    const released = (p.status === 'published' || p.status === 'preprint') && p.date
    const out: JsonResumePublication = { name: p.title }
    if (publisher) out.publisher = publisher
    if (released) out.releaseDate = p.date
    if (url) out.url = url
    if (p.abstract) out.summary = p.abstract
    return out
  })
}
