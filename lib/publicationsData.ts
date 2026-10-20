/**
 * Server-side readers for publications (content store → PUBLIC views only).
 *
 *   /publications   the website view (Website switch): the English list, or
 *                   the Chinese one when the English CV has no public paper;
 *                   the home section, the /about rail's count and the search
 *                   index read the same list, so their links land on it
 *   CV pages        the CV view (CV switch), through the normal section loaders
 *   the chrome      `chromePublications`: whether /publications exists, shipped
 *                   by page loaders so the header, footer, drawer and ⌘K
 *                   palette render the link in the server HTML (no request,
 *                   no layout shift)
 *
 * SERVER-ONLY (SQLite): import it from getStaticProps / getServerSideProps
 * (Next removes those imports from the client bundle) or API routes.
 * Every reader is best effort: a failing store means "no publications".
 */

import { readPublicCvSections } from './cvdata'
import {
  NO_OWNER_NAMES,
  citationKeys,
  formatCitationParts,
  ownerNamesFromSections,
  publicPublications,
  publicationsDescription,
  scholarlyArticleNode,
  selectPublications,
  summarizePublications,
  textLang,
  toApa,
  toBibtex,
  type CitationParts,
  type OwnerNames,
  type PubLang,
  type Publication,
  type SelectedPublications,
} from './publications'
import { PERSON_NAME, SITE_URL, WEBSITE_ID, absUrl, breadcrumb, personAuthor, personRef } from './schema'

export type PublicationsView = {
  /** Language of the list (and of its section heading). */
  lang: PubLang
  publications: Publication[]
  /** The owner's name forms from the same audience's Personal Info. */
  owner: OwnerNames
}

/** The /publications list (website audience). Empty when nothing is public. */
export function readPublicationsView(): PublicationsView {
  try {
    const cv = readPublicCvSections('website', ['publications', 'personalInformation'], ['en', 'zh'])
    const owner = ownerNamesFromSections(cv.en, cv.zh)
    const en = publicPublications(cv.en)
    if (en.length) return { lang: 'en', publications: en, owner }
    const zh = publicPublications(cv.zh)
    return { lang: zh.length ? 'zh' : 'en', publications: zh, owner }
  } catch {
    return { lang: 'en', publications: [], owner: NO_OWNER_NAMES }
  }
}

/** The home page's "Selected publications" (lib/publications selectPublications); null without a public paper. */
export function readHomePublications(): SelectedPublications | null {
  return selectPublications(readPublicationsView())
}

/** How many papers /publications lists (0: no page) — the count on the /about rail's link. */
export function publicationCount(): number {
  return readPublicationsView().publications.length
}

/** True when /publications has at least one public paper (the page answers 404 otherwise). */
export function hasPublicationsPage(): boolean {
  return readPublicationsView().publications.length > 0
}

/**
 * Page prop for the chrome's nav link (header, footer, drawer, ⌘K):
 * `{ chromePublications }`, or nothing when the store could not be read
 * (the chrome then keeps what it last knew, else no link).
 */
export function chromePublicationsProp(): { chromePublications?: boolean } {
  try {
    return { chromePublications: hasPublicationsPage() }
  } catch {
    return {}
  }
}

/** The owner's name forms for the CV pages (CV audience Personal Info, both languages). */
export function readCvOwnerNames(): OwnerNames {
  try {
    const cv = readPublicCvSections('cv', ['personalInformation'], ['en', 'zh'])
    return ownerNamesFromSections(cv.en, cv.zh)
  } catch {
    return NO_OWNER_NAMES
  }
}

// ── /publications page data ──────────────────────────────────────────────

export const PUBLICATIONS_PATH = '/publications'

export type PublicationsPageItem = {
  /** Citation key — also the paper's anchor id on the page. */
  key: string
  pub: Publication
  parts: CitationParts
  bibtex: string
  apa: string
}

export type PublicationsPageData = {
  items: PublicationsPageItem[]
  /** Language the entries were entered in (the English list, else the Chinese one). */
  lang: PubLang
  jsonLd: Array<Record<string, unknown>>
  description: string
  /** "3 papers: 2 published, 1 under review". */
  summary: string
}

/**
 * Everything /publications renders, built on the server from the public
 * website view: display parts (English labels), BibTeX and APA, and the
 * JSON-LD (a CollectionPage whose ItemList holds one ScholarlyArticle per
 * paper). null when there is no public paper — the page then answers 404.
 */
export function buildPublicationsPage(view: PublicationsView = readPublicationsView()): PublicationsPageData | null {
  if (!view.publications.length) return null
  const keys = citationKeys(view.publications)
  const items: PublicationsPageItem[] = view.publications.map((pub, i) => ({
    key: keys[i],
    pub,
    parts: formatCitationParts(pub, 'en', view.owner),
    bibtex: toBibtex(pub, { key: keys[i], origin: SITE_URL }),
    apa: toApa(pub, { origin: SITE_URL }),
  }))
  const summary = summarizePublications(view.publications)
  const description = publicationsDescription(view.publications, PERSON_NAME)
  const url = absUrl(PUBLICATIONS_PATH)
  const jsonLd: PublicationsPageData['jsonLd'] = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${url}#page`,
      url,
      name: `Publications — ${PERSON_NAME}`,
      description,
      inLanguage: 'en',
      isPartOf: { '@id': WEBSITE_ID },
      about: personRef,
      author: personAuthor,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: items.length,
        itemListElement: items.map((it, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: scholarlyArticleNode(it.pub, {
            id: `${url}#${it.key}`,
            person: personAuthor,
            owner: view.owner,
            origin: SITE_URL,
            inLanguage: textLang(it.pub.title, 'en'),
          }),
        })),
      },
    },
    breadcrumb([
      { name: 'Home', path: '/' },
      { name: 'Publications', path: PUBLICATIONS_PATH },
    ]),
  ]
  return { items, lang: view.lang, jsonLd, description, summary }
}
