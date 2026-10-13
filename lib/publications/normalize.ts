/**
 * From stored CV entries to render-ready publications.
 *
 * Input is normally PUBLIC data (lib/cvVisibility publicSections): hidden
 * entries are gone, hidden fields are blank and listed in `redacted`, hidden
 * authors are the HIDDEN_ITEM_MARK placeholder (their position kept) and
 * other hidden list items are removed. Editor documents (the Studio preview
 * before pruning) are handled the same way through `hiddenFields` /
 * `hiddenItems`, so a hidden value never renders from either.
 *
 * An entry renders only when it has a title AND a valid status: a paper
 * whose status was never chosen is not shown at all rather than passing for
 * published work (the validator also refuses to save it).
 */

import { HIDDEN_ITEM_MARK, hiddenIndices, isRedacted } from '../cvVisibility'
import { safeHref } from '../url'
import { normalizeDoi } from './doi'
import {
  PAPERS_KEY,
  PUBLICATIONS_SECTION,
  PUBLICATION_STATUSES,
  isPublicationStatus,
  isVenueType,
  type PubAuthor,
  type Publication,
} from './types'

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)

/** YYYY or YYYY-MM with a real month. */
export const PUB_DATE_RE = /^(\d{4})(?:-(0[1-9]|1[0-2]))?$/

/** Trimmed text at node[key]; '' when hidden or not a string. Whitespace runs collapse to one space. */
function text(node: Record<string, any>, key: string, collapse = true): string {
  if (isRedacted(node, key)) return ''
  const v = node[key]
  if (typeof v !== 'string') return ''
  return collapse ? v.replace(/\s+/g, ' ').trim() : v.replace(/\r\n?/g, '\n').trim()
}

/** Visible string items at node[key] (hidden indices removed), trimmed, blanks dropped. */
function stringList(node: Record<string, any>, key: string): string[] {
  if (isRedacted(node, key) || !Array.isArray(node[key])) return []
  const skip = new Set(hiddenIndices(node, key))
  return (node[key] as unknown[])
    .filter((v, i) => !skip.has(i) && typeof v === 'string')
    .map((v) => (v as string).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/**
 * Authors in order. A hidden author keeps its place as `{ hidden: true }`
 * (pruned data carries the placeholder; editor data the hidden index), so
 * the owner never appears earlier in the list than he is. A list with no
 * visible author at all counts as empty.
 */
function authorList(node: Record<string, any>): PubAuthor[] {
  if (isRedacted(node, 'authors') || !Array.isArray(node.authors)) return []
  const skip = new Set(hiddenIndices(node, 'authors'))
  const out: PubAuthor[] = []
  ;(node.authors as unknown[]).forEach((v, i) => {
    if (skip.has(i) || v === HIDDEN_ITEM_MARK) {
      out.push({ name: '', hidden: true })
      return
    }
    const name = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
    if (name) out.push({ name, hidden: false })
  })
  // Collapse runs of hidden authors into one placeholder; drop it when nobody is visible.
  const collapsed = out.filter((a, i) => !(a.hidden && out[i - 1]?.hidden))
  return collapsed.some((a) => !a.hidden) ? collapsed : []
}

/**
 * Link for a publication field: https:// URLs (bare domains become https://)
 * and same-site paths such as /uploads/paper.pdf. http:, mailto:, tel:,
 * javascript:, data: and protocol-relative URLs are refused ('').
 */
export function publicationHref(value: unknown): string {
  const href = safeHref(value)
  if (!href) return ''
  if (/^\/(?!\/)/.test(href)) return href
  return /^https:\/\//i.test(href) ? href : ''
}

/** The normalised publication for one stored entry, or null when it must not render. */
export function toPublication(entry: unknown, index: number): Publication | null {
  if (!isObject(entry) || entry.isVisible === false) return null
  const title = text(entry, 'title')
  const status = isRedacted(entry, 'status') ? '' : text(entry, 'status')
  if (!title || !isPublicationStatus(status)) return null
  const rawDate = text(entry, 'date')
  const date = PUB_DATE_RE.test(rawDate) ? rawDate : ''
  const venueType = text(entry, 'venueType')
  // A manuscript under review is cited without where it was submitted (APA 7):
  // no publication view renders or ships that venue.
  const where = (key: string) => (status === 'under-review' ? '' : text(entry, key))
  return {
    index,
    title,
    authors: authorList(entry),
    venue: where('venue'),
    venueType: isVenueType(venueType) ? venueType : '',
    status,
    date,
    year: date.slice(0, 4),
    volume: where('volume'),
    issue: where('issue'),
    pages: where('pages'),
    publisher: where('publisher'),
    doi: normalizeDoi(text(entry, 'doi')),
    url: publicationHref(text(entry, 'url')),
    pdfUrl: publicationHref(text(entry, 'pdfUrl')),
    codeUrl: publicationHref(text(entry, 'codeUrl')),
    slidesUrl: publicationHref(text(entry, 'slidesUrl')),
    abstract: text(entry, 'abstract', false),
    keywords: stringList(entry, 'keywords'),
    award: text(entry, 'award'),
  }
}

const STATUS_RANK: Record<string, number> = Object.fromEntries(PUBLICATION_STATUSES.map((s, i) => [s, i]))

/** Sortable month value of a YYYY / YYYY-MM date (a bare year sorts after its months); -1 for no date. */
function dateValue(date: string): number {
  const m = date.match(PUB_DATE_RE)
  if (!m) return -1
  return Number(m[1]) * 13 + (m[2] ? Number(m[2]) : 12.5)
}

/**
 * Display order: status (published → in press → accepted → under review →
 * preprint), then newest first; undated entries last within their status.
 * Stable, so ties keep the owner's order from CV Studio.
 */
export function sortPublications<T extends Pick<Publication, 'status' | 'date' | 'index'>>(list: readonly T[]): T[] {
  return [...list].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || dateValue(b.date) - dateValue(a.date) || a.index - b.index,
  )
}

/** The publications section of a language's (public) sections, if present and switched on. */
export function findPublicationsSection(sections: unknown): Record<string, any> | null {
  if (!Array.isArray(sections)) return null
  const s = sections.find((x) => isObject(x) && x.sessionName === PUBLICATIONS_SECTION)
  return isObject(s) ? s : null
}

/**
 * Render-ready, sorted publications of one language's public sections.
 * Pass sections already pruned for the audience the caller renders for
 * ('cv' for the CV pages, 'website' for /publications).
 */
export function publicPublications(sections: unknown): Publication[] {
  const section = findPublicationsSection(sections)
  if (!section || isRedacted(section, PAPERS_KEY) || !Array.isArray(section[PAPERS_KEY])) return []
  const visible = (section[PAPERS_KEY] as unknown[]).filter((e) => isObject(e) && e.isVisible !== false)
  const out: Publication[] = []
  visible.forEach((entry, index) => {
    const pub = toPublication(entry, index)
    if (pub) out.push(pub)
  })
  return sortPublications(out)
}

/** True when the sections hold at least one publication that renders. */
export function hasPublications(sections: unknown): boolean {
  return publicPublications(sections).length > 0
}
