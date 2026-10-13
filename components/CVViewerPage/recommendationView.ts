/**
 * Recommendations (E11) as every renderer shows them — the A4 sheet, the
 * Reading view and /about. Pure (unit-tested).
 *
 * Public data has already lost every entry without the person's permission
 * (lib/cvVisibility CONSENT_LISTS); as defence in depth an entry that still
 * carries a `permission` flag other than `true` is skipped here too. An entry
 * needs a quote and a name to render. Plain figure / blockquote markup — no
 * Review or AggregateRating structured data (self-serving reviews are not
 * eligible and would misrepresent the page).
 */

import type { CvLang } from '../../lib/cvVisibility'
import { formatCvDate, safeHref } from '../../lib/cvFormat'
import { field, indexedList, joinParts } from './fields'

export type RecommendationView = {
  quote: string
  name: string
  role: string
  relation: string
  /** 'YYYY-MM' (or what is stored), '' when not set. */
  date: string
  /** A safe http(s) link to where it was published, or ''. */
  sourceUrl: string
}

/** Visible, permitted, complete recommendations with their anchor index. */
export function recommendationItems(section: unknown): Array<{ item: RecommendationView; index: number }> {
  return indexedList<Record<string, unknown>>(section, 'items')
    .filter(({ item }) => !('permission' in item) || item.permission === true)
    .map(({ item, index }) => {
      const url = safeHref(field(item, 'sourceUrl'))
      return {
        index,
        item: {
          quote: field(item, 'quote'),
          name: field(item, 'name'),
          role: field(item, 'role'),
          relation: field(item, 'relation'),
          date: field(item, 'date'),
          sourceUrl: /^https?:\/\//i.test(url) ? url : '',
        },
      }
    })
    .filter(({ item }) => item.quote && item.name)
}

/** "Engineering manager, Acme · managed me at Acme · Mar 2026" — whatever is set. */
export function recommendationCredit(item: RecommendationView, lang: CvLang): string {
  return joinParts([item.role, item.relation, formatCvDate(item.date, lang)], ' · ')
}

/** The public recommendations section of a language's public sections, if it has anything to show. */
export function recommendationsSection<T extends { sessionName?: unknown }>(sections: readonly T[] | null | undefined): T | null {
  const s = (sections || []).find((x) => x?.sessionName === 'recommendations')
  return s && recommendationItems(s).length ? s : null
}
