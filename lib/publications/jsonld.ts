/**
 * schema.org JSON-LD for publications.
 *
 * Each paper is a ScholarlyArticle (a Thesis for theses) whose `author`
 * list keeps the paper's order, with the owner as the site's one Person
 * entity (lib/schema PERSON_ID) and co-authors as plain Persons. Where it
 * appeared:
 *   journal                      isPartOf PublicationIssue → PublicationVolume → Periodical
 *                                (as far as issue / volume are given)
 *   conference, workshop, chapter isPartOf Book (the proceedings / edited volume)
 *   preprint, other              isPartOf CreativeWork (the repository / venue)
 *   thesis                       sourceOrganization (the school)
 * A paper under review names no venue and has no datePublished, nor does
 * forthcoming work; every paper states creativeWorkStatus. The DOI is an
 * identifier PropertyValue and `sameAs` https://doi.org/… (plus the paper's
 * page); a PDF is its `encoding`.
 *
 * Only public values reach this (lib/publications/normalize), so hidden
 * fields and authors never appear in structured data.
 */

import { formatPages, showsVenue } from './citation'
import { doiUrl } from './doi'
import { isOwnerName, type OwnerNames } from './names'
import { statusLabel, type Publication } from './types'

export type ScholarlyNodeOptions = {
  /** Absolute URL of the paper's anchor on /publications ("https://…/publications#li2025deep"). */
  id: string
  /** The site Person as an author node ({ '@type': 'Person', '@id', name, url }). */
  person: Record<string, unknown>
  owner: OwnerNames
  /** Origin for same-site links. */
  origin: string
  /** BCP-47 language of the paper's text, when known ("zh-Hans"). */
  inLanguage?: string
}

const abs = (href: string, origin: string) => (href.startsWith('/') ? `${origin.replace(/\/$/, '')}${href}` : href)

function pagination(pages: string): Record<string, string> {
  const p = formatPages(pages)
  const m = p.match(/^([^–]+)–([^–]+)$/)
  return m ? { pageStart: m[1].trim(), pageEnd: m[2].trim(), pagination: p } : { pagination: p }
}

function journalChain(p: Publication): Record<string, unknown> {
  const periodical: Record<string, unknown> = { '@type': 'Periodical', name: p.venue }
  if (p.publisher) periodical.publisher = { '@type': 'Organization', name: p.publisher }
  let node: Record<string, unknown> = periodical
  if (p.volume) node = { '@type': 'PublicationVolume', volumeNumber: p.volume, isPartOf: node }
  if (p.issue) node = { '@type': 'PublicationIssue', issueNumber: p.issue, isPartOf: node }
  return node
}

export function scholarlyArticleNode(p: Publication, o: ScholarlyNodeOptions): Record<string, unknown> {
  const doi = doiUrl(p.doi)
  const published = p.status === 'published' || p.status === 'preprint'
  const venue = showsVenue(p) ? p.venue : ''
  const node: Record<string, unknown> = {
    '@type': p.venueType === 'thesis' ? 'Thesis' : 'ScholarlyArticle',
    '@id': o.id,
    headline: p.title,
    name: p.title,
  }
  const authors = p.authors
    .filter((a) => !a.hidden)
    .map((a) => (isOwnerName(a.name, o.owner) ? o.person : { '@type': 'Person', name: a.name }))
  node.author = authors.length ? authors : [o.person]
  if (published && p.date) node.datePublished = p.date
  node.creativeWorkStatus = statusLabel(p.status, 'en')
  if (o.inLanguage) node.inLanguage = o.inLanguage

  if (venue) {
    if (p.venueType === 'journal') node.isPartOf = journalChain(p)
    else if (p.venueType === 'conference' || p.venueType === 'workshop' || p.venueType === 'book-chapter') {
      node.isPartOf = { '@type': 'Book', name: venue, ...(p.publisher ? { publisher: { '@type': 'Organization', name: p.publisher } } : {}) }
    } else if (p.venueType === 'thesis') node.sourceOrganization = { '@type': 'Organization', name: venue }
    else node.isPartOf = { '@type': 'CreativeWork', name: venue }
  } else if (p.venueType === 'thesis' && p.publisher) {
    node.sourceOrganization = { '@type': 'Organization', name: p.publisher }
  }
  if (showsVenue(p) && p.pages && p.status === 'published') Object.assign(node, pagination(p.pages))
  if (p.doi) node.identifier = { '@type': 'PropertyValue', propertyID: 'DOI', value: p.doi }
  const page = p.url ? abs(p.url, o.origin) : ''
  node.url = doi || page || o.id
  const sameAs = Array.from(new Set([doi, page].filter(Boolean)))
  if (sameAs.length) node.sameAs = sameAs.length === 1 ? sameAs[0] : sameAs
  if (p.pdfUrl) node.encoding = { '@type': 'MediaObject', contentUrl: abs(p.pdfUrl, o.origin), encodingFormat: 'application/pdf' }
  if (p.abstract) node.abstract = p.abstract
  if (p.keywords.length) node.keywords = p.keywords.join(', ')
  if (p.award) node.award = p.award
  return node
}
