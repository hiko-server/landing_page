/**
 * The read side of the CV visibility model (lib/cvVisibility): the few
 * checks the public pages make while rendering CV data the server already
 * pruned — was a field hidden (the redaction marker), which bullets are
 * hidden or left as a placeholder, is a section on the website, which case
 * study an entry names.
 *
 * Kept apart so a public page's JavaScript carries only these. The pruning
 * itself (server) and the CV Studio's editing and audience helpers (admin)
 * stay in lib/cvVisibility, which re-exports everything here: server and
 * admin code keep importing from there, public renderers import from here
 * (tests/cv-visibility-read.test.ts holds the public pages to it).
 *
 * Pure and dependency-free.
 */

export type CvSectionLike = { sessionName?: string; [k: string]: any }
export type CvDoc = { en: CvSectionLike[]; zh: CvSectionLike[] }
export type CvLang = 'en' | 'zh'

/** Key added by pruning to public nodes; lists the names of hidden fields. */
export const REDACTED_KEY = 'redacted' as const

/**
 * What a hidden item of an ordered list (publication authors,
 * lib/cvVisibility POSITIONAL_ITEM_FIELDS) becomes in public data: the
 * item keeps its place, its value is gone.
 */
export const HIDDEN_ITEM_MARK = '…'

/**
 * True when `field` was hidden by the owner and blanked during pruning.
 * Works on public (pruned) nodes; on full editor documents it falls back to
 * the hiddenFields metadata, so the Studio preview behaves the same way.
 */
export function isRedacted(node: any, field: string): boolean {
  if (Array.isArray(node?.[REDACTED_KEY]) && node[REDACTED_KEY].includes(field)) return true
  return Array.isArray(node?.hiddenFields) && node.hiddenFields.includes(field)
}

/** Positions of the hidden items of a string list (`hiddenItems[field]`), integers only. */
export function hiddenIndices(node: any, field: string): number[] {
  const list = node?.hiddenItems?.[field]
  return Array.isArray(list) ? list.filter((n: unknown) => Number.isInteger(n)) : []
}

/** A section is on the A4 CV unless explicitly switched off. */
export function isSectionOnCv(section: any): boolean {
  return section?.isVisible !== false
}

/** A section is on the website unless explicitly switched off (independent of the CV switch). */
export function isSectionOnWebsite(section: any): boolean {
  return section?.showOnWebsite !== false
}

/** The slug part of an owner-entered case-study reference ("raku", "/work/raku", "/work/raku/"). */
export function caseStudySlug(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .trim()
    .toLowerCase()
    .replace(/^\/?work\//, '')
    .replace(/\/+$/, '')
}
