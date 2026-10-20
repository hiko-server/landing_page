/**
 * Proof-strip helpers (pure, client-safe; unit tested).
 *
 *   - suggestHighlights: tiles the Home editor OFFERS, built verbatim from the
 *     public CV (competition awards, patents, published papers, education).
 *     Nothing here is published: the owner accepts a suggestion into the
 *     form, may edit it, and saves. Each suggestion links to the CV entry it
 *     was read from, at the same anchor /cv renders
 *     (`/cv#cv-<section>-<index>`); a paper links to its /publications anchor
 *     (lib/publications publicationTiles, passed in as `papers` so this module
 *     — which the home page loads — stays free of the publications code).
 *   - splitLeadingNumber: the number a tile can roll up ("18th" → 18 + "th").
 */

import { cvEntryAnchor, field, joinParts, list } from '../components/CVViewerPage/fields'
import type { HomeHighlight } from './homeShape'
// Not lib/homeShape's runtime: the home page imports this module.
import { HIGHLIGHT_LIMITS } from './homeSections'

export type HighlightSuggestion = HomeHighlight & {
  /** Where the text was read from, for the editor ("CV · Competitions"). */
  source: string
}

type Section = { sessionName?: unknown; headerName?: unknown; [key: string]: unknown }

/** The entry's anchor on /cv (`/cv#cv-<section>-<index>`), the CV's own record. */
export const cvHref = (sessionName: string, index: number): string => `/cv#${cvEntryAnchor(sessionName, index)}`

const sectionOf = (cv: readonly Section[], name: string): Section | undefined =>
  Array.isArray(cv) ? cv.find((s) => s && s.sessionName === name) : undefined

const sourceLabel = (section: Section | undefined, fallback: string): string => {
  const raw = typeof section?.headerName === 'string' ? section.headerName.trim() : ''
  if (!raw) return `CV · ${fallback}`
  // Header names are usually stored in capitals ("COMPETITIONS").
  const name = raw === raw.toUpperCase() ? raw.charAt(0) + raw.slice(1).toLowerCase() : raw
  return `CV · ${name}`
}

/**
 * A suggestion keeps the CV's words exactly (never shortened or rephrased);
 * one longer than a tile allows is still offered, and the editor's counter
 * asks the owner to shorten it before saving.
 */
function tile(value: string, label: string, href: string, source: string): HighlightSuggestion | null {
  const v = value.trim()
  const l = label.trim()
  if (!v || !l) return null
  return { value: v, label: l, href, source }
}

/** True when a tile's text fits the limits the save enforces. */
export function fitsHighlightLimits(h: Pick<HomeHighlight, 'value' | 'label'>): boolean {
  return h.value.trim().length <= HIGHLIGHT_LIMITS.highlightValueMax && h.label.trim().length <= HIGHLIGHT_LIMITS.highlightLabelMax
}

/**
 * Suggested highlights from the public (website-pruned) English CV, in this
 * order: competition awards, patents, published papers (`opts.papers`, built
 * from the /publications list), education. Hidden sections, entries and
 * fields are already gone from the input; `field` / `list` also respect any
 * `redacted` markers, so a hidden value is never suggested.
 */
export function suggestHighlights(
  cvEn: readonly Section[] | null | undefined,
  opts: { max?: number; hrefFor?: (sessionName: string, index: number) => string; papers?: readonly HighlightSuggestion[] } = {},
): HighlightSuggestion[] {
  const cv = Array.isArray(cvEn) ? cvEn : []
  const max = opts.max ?? 8
  const hrefFor = opts.hrefFor ?? cvHref
  const out: HighlightSuggestion[] = []
  const push = (s: HighlightSuggestion | null) => {
    if (s && out.length < max && !out.some((o) => o.value === s.value && o.label === s.label)) out.push(s)
  }

  const awards = sectionOf(cv, 'competitionAwards')
  list(awards, 'awards').forEach((a, i) => {
    const award = field(a, 'award')
    const contest = field(a, 'contestName')
    const href = hrefFor('competitionAwards', i)
    // "18th Worldwide / 1st in Hong Kong" for "IEEE Xtreme 19.0 – …"; a
    // contest without a stated award reads as the contest itself.
    if (award && contest) push(tile(award, contest, href, sourceLabel(awards, 'Competitions')))
    else if (contest) push(tile(contest, joinParts([field(a, 'organization'), field(a, 'date')], ' · '), href, sourceLabel(awards, 'Competitions')))
  })

  const patents = sectionOf(cv, 'patents')
  list(patents, 'patentExperience').forEach((p, i) => {
    const title = field(p, 'title')
    const label = joinParts([field(p, 'organization'), field(p, 'authority'), field(p, 'status')], ' · ')
    push(tile(title, label, hrefFor('patents', i), sourceLabel(patents, 'Patents')))
  })

  for (const paper of opts.papers || []) push(tile(paper.value, paper.label, paper.href, paper.source))

  const education = sectionOf(cv, 'education')
  list(education, 'educationExperience').forEach((e, i) => {
    const degree = field(e, 'degree')
    const school = field(e, 'schoolName')
    push(tile(degree, school, hrefFor('education', i), sourceLabel(education, 'Education')))
  })

  return out
}

/**
 * The integer a tile can animate: a headline that is a whole number with an
 * optional non-numeric suffix ("8", "1,641", "18th", "3×"). Anything with
 * more digits after it ("18th / 1st", "93.6%") or text before it stays
 * static text (null).
 */
export function splitLeadingNumber(value: string): { number: number; suffix: string } | null {
  const m = /^(\d{1,3}(?:,\d{3})+|\d{1,9})(\D*)$/.exec(value.trim())
  if (!m) return null
  const number = Number(m[1].replace(/,/g, ''))
  if (!Number.isSafeInteger(number)) return null
  return { number, suffix: m[2] }
}

/** True for a link that leaves the site (opens in a new tab). */
export function isExternalHighlight(href: string): boolean {
  return /^https:\/\//i.test(href)
}
