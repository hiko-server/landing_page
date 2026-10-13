/**
 * Publications (论文): the one API every surface uses — the CV pages, the A4
 * sheet, /publications, and (next) the PDF CV, the JSON Resume / text export,
 * the home section and the search index.
 *
 *   publicPublications(sections)        render-ready, sorted publications of one
 *                                       language's PUBLIC sections
 *   formatCitationParts(pub, lang, me)  display parts (owner emphasised, status label)
 *   toBibtex / toBibtexAll / toApa      citations
 *   scholarlyArticleNode                schema.org JSON-LD
 *   toJsonResume                        JSON Resume `publications`
 *   ownerNamesFromSections              the owner's name forms from public Personal Info
 *
 * Pure functions over plain data (no DOM, no Node APIs, no components), shared
 * by server and client; the server-side readers live in lib/publicationsData.ts.
 */

export * from './types'
export * from './doi'
export * from './names'
export * from './normalize'
export * from './citation'
export * from './bibtex'
export * from './apa'
export * from './jsonld'
export * from './jsonResume'
export * from './summary'
