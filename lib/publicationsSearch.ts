/**
 * Search documents for publications (⌘K, GET /api/search-index). Pure.
 *
 * One document per public paper, pointing where a visitor can read it:
 *
 *   - the /publications list (website view: the English papers, else the
 *     Chinese ones) → `/publications#<citation key>`, the anchors that page
 *     sets (lib/publications citationKeys over the same sorted list);
 *   - when the section is on the CV only (no /publications page), the CV's
 *     own papers → `/cv#cv-publications-<index>`, the A4 sheet's anchors.
 *
 * Only what those pages show is indexed: the title, the status of anything
 * not yet published, the venue (never for a paper under review), the year,
 * the visible authors (a hidden co-author contributes nothing), the abstract,
 * the award and the keywords. The documents use the frozen `cv` kind of the
 * search-index contract (components/Article/fuzzyMatch SearchDocLike).
 */

import type { SearchDoc } from './searchIndex'
import { citationKeys, textLang } from './publications/citation'
import { publicPublications } from './publications/normalize'
import { PUBLICATIONS_SECTION, isPublishedStatus, statusLabel, type Publication } from './publications/types'
import { cvEntryAnchor } from '../components/CVViewerPage/fields'

const BODY_MAX_CHARS = 4000

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

function clampChars(s: string, max: number): string {
  const chars = Array.from(s)
  return chars.length <= max ? s : chars.slice(0, max).join('').trimEnd()
}

function paperDoc(p: Publication, href: string): SearchDoc {
  const doc: SearchDoc = { kind: 'cv', title: p.title, href, lang: textLang(p.title, 'en') || 'en' }
  const description = [isPublishedStatus(p.status) ? '' : statusLabel(p.status, 'en'), p.venue, p.year].filter(Boolean).join(' · ')
  if (description) doc.description = description
  const authors = p.authors.filter((a) => !a.hidden).map((a) => a.name)
  const body = clampChars(squash([authors.join(', '), p.abstract, p.award].filter(Boolean).join(' ')), BODY_MAX_CHARS)
  if (body) doc.body = body
  if (p.keywords.length) doc.tags = p.keywords.map(squash)
  return doc
}

/**
 * @param website  the /publications list (lib/publicationsData readPublicationsView)
 * @param cvEn     the PUBLIC 'cv'-audience English sections (readPublicCvData('cv').en)
 */
export function publicationDocs(website: { publications: readonly Publication[] } | null | undefined, cvEn: unknown): SearchDoc[] {
  const listed = website?.publications || []
  if (listed.length) {
    const keys = citationKeys(listed)
    return listed.map((p, i) => paperDoc(p, `/publications#${keys[i]}`))
  }
  return publicPublications(cvEn).map((p) => paperDoc(p, `/cv#${cvEntryAnchor(PUBLICATIONS_SECTION, p.index)}`))
}
