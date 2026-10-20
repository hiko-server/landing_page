/**
 * Case-study links in the CV Studio, resolved the way the public CV resolves
 * them (lib/cvLinks withEvidenceLinks: a PUBLISHED case study's slug, else
 * none) — pure, for the browser.
 *
 *   publishedCaseStudies  the index the readiness context ships (drafts
 *                         flagged) narrowed to what /work publishes, in the
 *                         shape withEvidenceLinks takes; null while unknown
 *   caseStudyFieldNote    the project editor's note when the slug typed in
 *                         "Case study slug" names no published case study
 */

import { caseStudySlug } from '../components/LandingPage/projectMatch'
import type { CvWork } from './cvLinks'

export type CaseStudyIndexEntry = { slug: string; title: string; draft?: boolean }

export function publishedCaseStudies(index: readonly CaseStudyIndexEntry[] | null | undefined): CvWork[] | null {
  if (!Array.isArray(index)) return null
  return index.filter((w) => w && typeof w.slug === 'string' && !w.draft).map((w) => ({ slug: w.slug, title: String(w.title || w.slug) }))
}

/** '' when the value is empty, the index unknown or the slug a published case study; else what is wrong. */
export function caseStudyFieldNote(value: unknown, index: readonly CaseStudyIndexEntry[] | null | undefined): string {
  const slug = caseStudySlug(value)
  if (!slug || !Array.isArray(index)) return ''
  const known = index.find((w) => w?.slug === slug)
  if (known && !known.draft) return ''
  return known
    ? `No published case study at /work/${slug}: it is still a draft, so the CV shows no link until it is published.`
    : `No published case study at /work/${slug}, so the CV shows no link. Check the slug, or publish the case study.`
}
