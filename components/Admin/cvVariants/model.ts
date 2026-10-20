/**
 * The CV variants editor's model (E4) — pure, unit-tested.
 *
 * Turns the FULL CV document and one variant into the rows the editor
 * shows (every section and top-level entry of the CV, the variant's ones
 * first, in its order) and applies the editor's actions to the variant.
 * What a variant may print is what the CV lets private links print: a
 * section switched off the CV, an entry hidden with the eye, or anything
 * kept off private links is listed as unavailable — never selectable, and
 * never printed even if a stored variant still names it (the public
 * pruning removes it, lib/cvVisibility).
 */

import { ENTRY_UID_KEY, fieldShownIn, isFieldHidden, isSectionOnCv, nodeShownIn, type CvLang } from '../../../lib/cvVisibility'
import { isEntryUid } from '../../../lib/cvEntryUid'
import { SECTION_BY_NAME } from '../../../lib/cvSections'
import type { CvVariant, CvVariantSection } from '../../../lib/cvVariants'

export type Doc = { en: any[]; zh: any[] }

export type Unavailable = 'off-cv' | 'not-private' | 'hidden'

export const UNAVAILABLE_LABEL: Record<Unavailable, string> = {
  'off-cv': 'Off the CV',
  'not-private': 'Kept off private links',
  hidden: 'Hidden',
}

export type EntryRow = { uid: string; title: string; subtitle: string; chosen: boolean; unavailable: Unavailable | null }

export type ListRow = {
  key: string
  label: string
  itemNoun: string
  /** 'all': the list follows the CV; 'chosen': the variant names its entries. */
  mode: 'all' | 'chosen'
  /** Chosen entries first in the variant's order, then the rest in the CV's order. */
  entries: EntryRow[]
  /** The whole list is hidden or kept off private links. */
  unavailable: Unavailable | null
}

export type SectionRow = {
  name: string
  label: string
  heading: string
  included: boolean
  unavailable: Unavailable | null
  lists: ListRow[]
}

const isPlainObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)

function sectionOf(doc: Doc, lang: CvLang, name: string): Record<string, any> | null {
  const mine = (doc[lang] || []).find((s) => isPlainObject(s) && s.sessionName === name)
  if (mine) return mine
  const other = (doc[lang === 'en' ? 'zh' : 'en'] || []).find((s) => isPlainObject(s) && s.sessionName === name)
  return other ?? null
}

/** Every section name of the CV (this language's order, then any only the other language has). */
export function cvSectionNames(doc: Doc, lang: CvLang): string[] {
  const names: string[] = []
  for (const l of [lang, lang === 'en' ? 'zh' : 'en'] as const) {
    for (const s of doc[l] || []) if (isPlainObject(s) && typeof s.sessionName === 'string' && !names.includes(s.sessionName)) names.push(s.sessionName)
  }
  return names
}

function sectionUnavailable(section: Record<string, any> | null): Unavailable | null {
  if (!section) return 'off-cv'
  if (!isSectionOnCv(section)) return 'off-cv'
  if (!nodeShownIn(section, 'private')) return 'not-private'
  return null
}

function entryUnavailable(entry: Record<string, any>): Unavailable | null {
  if (entry.isVisible === false) return 'hidden'
  if (!nodeShownIn(entry, 'private')) return 'not-private'
  return null
}

/** The rows of the editor for `variant` over the full CV, in `lang`. */
export function sectionRows(doc: Doc, lang: CvLang, variant: Pick<CvVariant, 'sections'>): SectionRow[] {
  const all = cvSectionNames(doc, lang)
  const included = variant.sections.map((s) => s.name).filter((n) => all.includes(n))
  const order = [...included, ...all.filter((n) => !included.includes(n))]
  return order.map((name) => {
    const section = sectionOf(doc, lang, name)
    const def = SECTION_BY_NAME[name]
    const vs = variant.sections.find((s) => s.name === name)
    const lists: ListRow[] = (def?.lists || []).map((l) => {
      const list: any[] = Array.isArray(section?.[l.key]) ? section![l.key] : []
      const chosen = vs?.entries?.[l.key]
      const rows: EntryRow[] = list
        .filter((e) => isPlainObject(e) && isEntryUid(e[ENTRY_UID_KEY]))
        .map((e) => ({
          uid: e[ENTRY_UID_KEY] as string,
          title: (l.titleOf(e) || '').trim() || `Untitled ${l.itemNoun}`,
          subtitle: (l.subtitleOf?.(e) || '').trim(),
          chosen: chosen ? chosen.includes(e[ENTRY_UID_KEY]) : true,
          unavailable: entryUnavailable(e),
        }))
      const ordered = chosen
        ? [...chosen.map((u) => rows.find((r) => r.uid === u)).filter((r): r is EntryRow => !!r), ...rows.filter((r) => !chosen.includes(r.uid))]
        : rows
      const listOff: Unavailable | null = section && isFieldHidden(section, l.key) ? 'hidden' : section && !fieldShownIn(section, l.key, 'private') ? 'not-private' : null
      return { key: l.key, label: l.label, itemNoun: l.itemNoun, mode: chosen ? 'chosen' : 'all', entries: ordered, unavailable: listOff }
    })
    return {
      name,
      label: def?.label || name,
      heading: (typeof section?.headerName === 'string' && section.headerName.trim()) || def?.label || name,
      included: !!vs,
      unavailable: sectionUnavailable(section),
      lists,
    }
  })
}

const replaceSection = (variant: CvVariant, name: string, fn: (s: CvVariantSection) => CvVariantSection): CvVariant => ({
  ...variant,
  sections: variant.sections.map((s) => (s.name === name ? fn(s) : s)),
})

/**
 * Include or leave out a section. An included section goes where the rows
 * show it: after the included sections above it.
 */
export function toggleSection(variant: CvVariant, name: string, on: boolean, rowOrder: readonly string[]): CvVariant {
  const has = variant.sections.some((s) => s.name === name)
  if (on === has) return variant
  if (!on) return { ...variant, sections: variant.sections.filter((s) => s.name !== name) }
  const at = rowOrder.indexOf(name)
  const before = new Set(rowOrder.slice(0, Math.max(0, at)))
  let insertAt = 0
  variant.sections.forEach((s, i) => {
    if (before.has(s.name)) insertAt = i + 1
  })
  const sections = [...variant.sections]
  sections.splice(insertAt, 0, { name })
  return { ...variant, sections }
}

/** Move an included section to the position of another included one. */
export function moveSection(variant: CvVariant, from: string, to: string): CvVariant {
  const a = variant.sections.findIndex((s) => s.name === from)
  const b = variant.sections.findIndex((s) => s.name === to)
  if (a < 0 || b < 0 || a === b) return variant
  const sections = [...variant.sections]
  const [x] = sections.splice(a, 1)
  sections.splice(b, 0, x)
  return { ...variant, sections }
}

/**
 * A list follows the CV ('all') or names its entries ('chosen': starting
 * from every entry a private link may print, in the CV's order).
 */
export function setListMode(variant: CvVariant, section: string, key: string, mode: 'all' | 'chosen', row?: ListRow): CvVariant {
  return replaceSection(variant, section, (s) => {
    const entries = { ...(s.entries || {}) }
    if (mode === 'all') delete entries[key]
    else entries[key] = (row?.entries || []).filter((e) => !e.unavailable).map((e) => e.uid)
    return Object.keys(entries).length ? { ...s, entries } : { name: s.name }
  })
}

export function toggleEntry(variant: CvVariant, section: string, key: string, uid: string, on: boolean, row: ListRow): CvVariant {
  return replaceSection(variant, section, (s) => {
    const current = s.entries?.[key] ?? row.entries.filter((e) => !e.unavailable).map((e) => e.uid)
    let next = current.filter((u) => u !== uid)
    if (on) {
      // Back in the place the rows show it.
      const order = row.entries.map((e) => e.uid)
      const at = order.indexOf(uid)
      const before = new Set(order.slice(0, at))
      let insertAt = 0
      next.forEach((u, i) => {
        if (before.has(u)) insertAt = i + 1
      })
      next = [...next.slice(0, insertAt), uid, ...next.slice(insertAt)]
    }
    return { ...s, entries: { ...(s.entries || {}), [key]: next } }
  })
}

export function moveEntry(variant: CvVariant, section: string, key: string, from: string, to: string, row: ListRow): CvVariant {
  return replaceSection(variant, section, (s) => {
    const current = [...(s.entries?.[key] ?? row.entries.filter((e) => !e.unavailable).map((e) => e.uid))]
    const a = current.indexOf(from)
    const b = current.indexOf(to)
    if (a < 0 || b < 0 || a === b) return s
    const [x] = current.splice(a, 1)
    current.splice(b, 0, x)
    return { ...s, entries: { ...(s.entries || {}), [key]: current } }
  })
}

/** "4 sections · 6 of 9 entries" for the variants list. */
export function variantSummary(doc: Doc, lang: CvLang, variant: CvVariant): string {
  const rows = sectionRows(doc, lang, variant).filter((r) => r.included && !r.unavailable)
  const lists = rows.flatMap((r) => r.lists.filter((l) => !l.unavailable))
  const total = lists.reduce((n, l) => n + l.entries.filter((e) => !e.unavailable).length, 0)
  const chosen = lists.reduce((n, l) => n + l.entries.filter((e) => !e.unavailable && e.chosen).length, 0)
  const s = `${rows.length} section${rows.length === 1 ? '' : 's'}`
  return total ? `${s} · ${chosen} of ${total} entries` : s
}

/** Pages over (or under) the target, for the measurement line: "on target", "0.4 page over". */
export function targetStatus(pages: number, lastPageFill: number, target: number | null): { tone: 'ok' | 'over' | 'none'; text: string } {
  if (!target) return { tone: 'none', text: `${pages} page${pages === 1 ? '' : 's'}` }
  if (pages <= target) return { tone: 'ok', text: `${pages} page${pages === 1 ? '' : 's'} · on target` }
  const over = Math.round((pages - target - 1 + lastPageFill) * 10) / 10
  return { tone: 'over', text: `${pages} pages · ${over > 0 ? over : 0.1} page${over === 1 ? '' : 's'} over` }
}
