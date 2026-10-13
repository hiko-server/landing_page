/**
 * Plain-language summaries of a publication list for the /publications page
 * (lede, meta description, OG subtitle, filters). Only counts and statuses
 * that exist are named — nothing is claimed that the list does not show.
 */

import { PUBLICATION_STATUSES, STATUS_LABELS, type PublicationStatus, type Publication } from './types'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Statuses present in the list, in display order, with their counts. */
export function statusCounts(list: readonly Pick<Publication, 'status'>[]): Array<{ status: PublicationStatus; count: number }> {
  return PUBLICATION_STATUSES.map((status) => ({ status, count: list.filter((p) => p.status === status).length })).filter((s) => s.count > 0)
}

/**
 * "3 papers: 2 published, 1 under review" · "2 published papers" · "1 paper, under review".
 */
export function summarizePublications(list: readonly Pick<Publication, 'status'>[]): string {
  const counts = statusCounts(list)
  const total = list.length
  if (!total) return ''
  if (counts.length === 1) {
    const only = counts[0].status
    if (only === 'published') return plural(total, 'published paper', 'published papers')
    if (only === 'preprint') return plural(total, 'preprint', 'preprints')
    return `${plural(total, 'paper', 'papers')}, ${STATUS_LABELS[only].en.toLowerCase()}`
  }
  return `${plural(total, 'paper', 'papers')}: ${counts.map((c) => `${c.count} ${STATUS_LABELS[c.status].en.toLowerCase()}`).join(', ')}`
}

/** Meta description (70–160 characters for any list). */
export function publicationsDescription(list: readonly Pick<Publication, 'status'>[], owner: string): string {
  return `Publications by ${owner} — ${summarizePublications(list)}. Every entry can be copied as a BibTeX or APA citation.`
}

/** Distinct years, newest first ('' — undated — last when present). */
export function publicationYears(list: readonly Pick<Publication, 'year'>[]): string[] {
  const years = Array.from(new Set(list.map((p) => p.year)))
  return years.sort((a, b) => (a === '' ? 1 : b === '' ? -1 : b.localeCompare(a)))
}

/** Lists this long get year / status filters on /publications. */
export const FILTER_THRESHOLD = 6

export type PublicationFilter = { year: string | null; status: PublicationStatus | null }

export function applyPublicationFilter<T extends Pick<Publication, 'year' | 'status'>>(list: readonly T[], f: PublicationFilter): T[] {
  return list.filter((p) => (f.year === null || p.year === f.year) && (f.status === null || p.status === f.status))
}
