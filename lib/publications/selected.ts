/**
 * "Selected publications" on the home page and the publication count on the
 * /about rail — both built from the list /publications shows (the website
 * view: the English papers, else the Chinese ones), so a paper a visitor
 * meets on the home page is the paper its link opens.
 *
 *   selectPublications(view)   the first HOME_PUBLICATIONS_MAX papers in display
 *                              order (published → in press → accepted → under
 *                              review → preprint, newest first), with English
 *                              labels like /publications; null without a paper
 *
 * Each item carries only what the home row prints — the citation key (its
 * /publications anchor), title, authors (the owner flagged, a hidden
 * co-author as a placeholder without a name), venue, year, the status of
 * anything not yet published and the award. Pure and client-safe.
 */

import { citationKeys, formatCitationParts, type AuthorPart } from './citation'
import type { OwnerNames } from './names'
import type { PubLang, Publication } from './types'

/** How many papers the home section lists (the rest are one link away). */
export const HOME_PUBLICATIONS_MAX = 3

export type SelectedPublication = {
  /** Citation key — the paper's anchor on /publications. */
  key: string
  title: string
  authors: AuthorPart[]
  /** '' for a paper under review (it never names its venue). */
  venue: string
  /** Four-digit year, '' when undated. */
  year: string
  /** Status label for anything not yet published ('' when published). */
  status: string
  award: string
}

export type SelectedPublications = {
  items: SelectedPublication[]
  /** Every paper on /publications (the section links to all of them). */
  total: number
  /** Language the papers were entered in (the labels stay English, like /publications). */
  lang: PubLang
}

/** The papers /publications lists, as its reader `readPublicationsView` returns them. */
export type PublicationsSource = { lang: PubLang; publications: readonly Publication[]; owner: OwnerNames }

export function selectPublications(view: PublicationsSource | null | undefined, max: number = HOME_PUBLICATIONS_MAX, labels: PubLang = 'en'): SelectedPublications | null {
  const list = view?.publications || []
  if (!list.length || max < 1) return null
  // Keys over the whole list, exactly as /publications computes its anchors.
  const keys = citationKeys(list)
  const items = list.slice(0, max).map((pub, i) => {
    // The status labels in the page's language (the Chinese home page, F3); /publications stays English.
    const c = formatCitationParts(pub, labels, view!.owner)
    return { key: keys[i], title: c.title, authors: c.authors, venue: c.venue, year: c.year, status: c.status, award: c.award }
  })
  return { items, total: list.length, lang: view!.lang }
}

/** A proof-strip tile the Home editor may offer (lib/highlights HighlightSuggestion). */
export type PublicationTile = { value: string; label: string; href: string; source: string }

/**
 * Proof-strip suggestions for the Home editor: every PUBLISHED paper of the
 * /publications list, verbatim — the title as the headline and "venue · year"
 * as the line under it, linking to the paper's anchor on /publications.
 * Work not yet published is never offered (a tile has no room for its
 * status). Suggestions only: nothing is published until the owner saves.
 */
export function publicationTiles(view: PublicationsSource | null | undefined, source = 'CV · Publications'): PublicationTile[] {
  const list = view?.publications || []
  if (!list.length) return []
  const keys = citationKeys(list)
  const out: PublicationTile[] = []
  list.forEach((pub, i) => {
    if (pub.status !== 'published') return
    const label = [pub.venue, pub.year].filter(Boolean).join(' · ')
    if (pub.title && label) out.push({ value: pub.title, label, href: `/publications#${keys[i]}`, source })
  })
  return out
}
