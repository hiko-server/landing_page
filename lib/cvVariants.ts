/**
 * Tailored CV variants (E4) — pure, shared by the admin editor, the API and
 * the private share pages.
 *
 * A variant is a named selection over the ONE CV document — "Machine
 * learning", "Embedded", "Full-stack" — never a copy of its text:
 *
 *   { id, name, pageTarget, sections: [{ name, entries? }] }
 *
 *   sections    the sections it prints, in its own order (by sessionName);
 *               a section that is not listed is left out
 *   entries     per top-level list of a section (`experiences`, `papers` …):
 *               the entry uids it prints, in its own order (lib/cvEntryUid).
 *               A list that is not named follows the CV (every entry, the
 *               CV's order, entries added later included).
 *   pageTarget  the length the owner aims for (1–4 A4 pages) or null; the
 *               editor measures the variant's real PDF against it.
 *
 * Everything else is the CV's: a variant renders through the same pruning
 * as every public view, for the 'private' surface (lib/cvVisibility) — so
 * hidden always wins (a hidden entry, field, bullet or section never comes
 * back), and so do the section CV switch and the audiences. Variants live in
 * the content store (kv `cvvariants`, mirrored to R2, in every backup); the
 * share links that open them live in auth.db (lib/cvShare).
 */

import { ENTRY_UID_KEY } from './cvVisibility'
import { isEntryUid } from './cvEntryUid'
import { SECTION_BY_NAME } from './cvSections'

export const VARIANTS_KV_KEY = 'cvvariants'
export const MAX_VARIANTS = 24
export const VARIANT_NAME_MAX = 60
export const PAGE_TARGETS = [1, 2, 3, 4] as const
export const VARIANT_ID_RE = /^v[a-z0-9]{6,24}$/
const SECTION_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/
const LIST_KEY_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/
const MAX_SECTIONS = 32
const MAX_ENTRIES = 300

export type CvVariantSection = {
  /** sessionName of the section. */
  name: string
  /** List key → entry uids in print order. A list that is not named follows the CV. */
  entries?: Record<string, string[]>
}

export type CvVariant = {
  id: string
  name: string
  /** A4 pages the owner aims for (1–4), or null. */
  pageTarget: number | null
  sections: CvVariantSection[]
  createdAt: number
  updatedAt: number
}

export type CvVariantDoc = { variants: CvVariant[] }

export type VariantError = { path: Array<string | number>; message: string }
export type VariantValidation = { ok: true; doc: CvVariantDoc } | { ok: false; errors: VariantError[] }

const isPlainObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)

export const EMPTY_VARIANTS: CvVariantDoc = { variants: [] }

/** A fresh variant id ("v" + 10 base-36 characters). */
export function newVariantId(): string {
  const bytes = new Uint8Array(10)
  globalThis.crypto.getRandomValues(bytes)
  return `v${Array.from(bytes, (b) => (b % 36).toString(36)).join('')}`
}

/** The stored value as a document (a missing or malformed value reads as no variants). */
export function readVariantDoc(value: unknown): CvVariantDoc {
  const checked = validateVariantDoc(value)
  return checked.ok ? checked.doc : EMPTY_VARIANTS
}

/**
 * Check and normalise a variants document (the admin PUT body, or the
 * stored value): unknown keys are dropped, names trimmed. Errors carry a
 * path ['variants', i, …] and a sentence the editor shows.
 */
export function validateVariantDoc(input: unknown, now = Date.now()): VariantValidation {
  const errors: VariantError[] = []
  const add = (path: VariantError['path'], message: string) => {
    if (errors.length < 50) errors.push({ path, message })
  }
  if (!isPlainObject(input) || !Array.isArray(input.variants)) {
    return { ok: false, errors: [{ path: ['variants'], message: 'Expected { variants: [...] }.' }] }
  }
  if (input.variants.length > MAX_VARIANTS) add(['variants'], `At most ${MAX_VARIANTS} variants.`)
  const ids = new Set<string>()
  const names = new Set<string>()
  const variants: CvVariant[] = []
  input.variants.slice(0, MAX_VARIANTS).forEach((raw: unknown, i: number) => {
    const at: VariantError['path'] = ['variants', i]
    if (!isPlainObject(raw)) {
      add(at, `Variant #${i + 1} must be an object.`)
      return
    }
    const id = typeof raw.id === 'string' ? raw.id : ''
    if (!VARIANT_ID_RE.test(id)) add([...at, 'id'], `Variant #${i + 1} has a malformed id.`)
    else if (ids.has(id)) add([...at, 'id'], `Variant #${i + 1} repeats the id of another variant.`)
    ids.add(id)
    const name = typeof raw.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim() : ''
    if (!name) add([...at, 'name'], `Variant #${i + 1} needs a name.`)
    else if (name.length > VARIANT_NAME_MAX) add([...at, 'name'], `“${name.slice(0, 24)}…” is longer than ${VARIANT_NAME_MAX} characters.`)
    else if (names.has(name.toLowerCase())) add([...at, 'name'], `Two variants are called “${name}”.`)
    names.add(name.toLowerCase())
    let pageTarget: number | null = null
    if (raw.pageTarget !== undefined && raw.pageTarget !== null) {
      if ((PAGE_TARGETS as readonly number[]).includes(raw.pageTarget)) pageTarget = raw.pageTarget
      else add([...at, 'pageTarget'], `The page target of “${name || `#${i + 1}`}” must be 1 to 4 pages, or none.`)
    }
    const sections: CvVariantSection[] = []
    if (!Array.isArray(raw.sections)) add([...at, 'sections'], `“${name || `#${i + 1}`}” needs a list of sections.`)
    else {
      if (raw.sections.length > MAX_SECTIONS) add([...at, 'sections'], `At most ${MAX_SECTIONS} sections.`)
      const seen = new Set<string>()
      raw.sections.slice(0, MAX_SECTIONS).forEach((rs: unknown, j: number) => {
        const sp = [...at, 'sections', j]
        if (!isPlainObject(rs) || typeof rs.name !== 'string' || !SECTION_NAME_RE.test(rs.name)) {
          add(sp, `Section #${j + 1} of “${name || `#${i + 1}`}” is malformed.`)
          return
        }
        if (seen.has(rs.name)) {
          add(sp, `“${name || `#${i + 1}`}” lists ${rs.name} twice.`)
          return
        }
        seen.add(rs.name)
        const section: CvVariantSection = { name: rs.name }
        if (rs.entries !== undefined && rs.entries !== null) {
          if (!isPlainObject(rs.entries)) add([...sp, 'entries'], `The entries of ${rs.name} must map list names to entry ids.`)
          else {
            const entries: Record<string, string[]> = {}
            for (const [key, list] of Object.entries(rs.entries)) {
              if (!LIST_KEY_RE.test(key) || !Array.isArray(list) || list.length > MAX_ENTRIES || !list.every(isEntryUid) || new Set(list).size !== list.length) {
                add([...sp, 'entries', key], `The ${key} selection of ${rs.name} must be a list of distinct entry ids.`)
                continue
              }
              entries[key] = [...list]
            }
            section.entries = entries
          }
        }
        sections.push(section)
      })
    }
    const createdAt = Number.isSafeInteger(raw.createdAt) && raw.createdAt > 0 ? raw.createdAt : now
    const updatedAt = Number.isSafeInteger(raw.updatedAt) && raw.updatedAt > 0 ? raw.updatedAt : createdAt
    variants.push({ id, name, pageTarget, sections, createdAt, updatedAt })
  })
  return errors.length ? { ok: false, errors } : { ok: true, doc: { variants } }
}

export function findVariant(doc: CvVariantDoc, id: unknown): CvVariant | null {
  return typeof id === 'string' ? doc.variants.find((v) => v.id === id) ?? null : null
}

/**
 * One language's FULL sections (with visibility metadata and uids) as the
 * variant prints them: its sections in its order, each list it names cut
 * down to — and ordered by — its uids. Pure selection: nothing is
 * revealed (the public pruning runs afterwards and removes whatever is
 * hidden or kept from private links).
 */
export function applyVariant<T extends { sessionName?: string; [k: string]: any }>(sections: readonly T[], variant: Pick<CvVariant, 'sections'>): T[] {
  const byName = new Map<string, T>()
  for (const s of sections) if (isPlainObject(s) && typeof s.sessionName === 'string' && !byName.has(s.sessionName)) byName.set(s.sessionName, s)
  const out: T[] = []
  for (const vs of variant.sections) {
    const section = byName.get(vs.name)
    if (!section) continue
    if (!vs.entries) {
      out.push(section)
      continue
    }
    let next: Record<string, any> = section
    for (const [key, uids] of Object.entries(vs.entries)) {
      const list = section[key]
      if (!Array.isArray(list)) continue
      const byUid = new Map<string, unknown>()
      for (const e of list) if (isPlainObject(e) && isEntryUid(e[ENTRY_UID_KEY]) && !byUid.has(e[ENTRY_UID_KEY])) byUid.set(e[ENTRY_UID_KEY], e)
      next = { ...next, [key]: uids.map((u) => byUid.get(u)).filter((e) => e !== undefined) }
    }
    out.push(next as T)
  }
  return out
}

/** The variant as a selection over the full { en, zh } document (lib/cvdata CvSelect). */
export function variantSelect(variant: Pick<CvVariant, 'sections'>) {
  return <D extends { en: any[]; zh: any[] }>(doc: D): D => ({ ...doc, en: applyVariant(doc.en, variant), zh: applyVariant(doc.zh, variant) })
}

/** Top-level registry lists of a section (key + label + how an entry is titled). */
export function variantLists(sessionName: string) {
  return (SECTION_BY_NAME[sessionName]?.lists || []).map((l) => ({ key: l.key, label: l.label, itemNoun: l.itemNoun, titleOf: l.titleOf, subtitleOf: l.subtitleOf }))
}

/**
 * A new variant that prints what the A4 CV prints today: every section on
 * the CV (its CV switch on) in the CV's order, every entry. `cvSections` is
 * the full document of the language the owner edits.
 */
export function variantFromCv(cvSections: readonly any[], name: string, id = newVariantId(), now = Date.now()): CvVariant {
  const sections = cvSections
    .filter((s) => isPlainObject(s) && typeof s.sessionName === 'string' && SECTION_NAME_RE.test(s.sessionName) && s.isVisible !== false)
    .map((s) => ({ name: s.sessionName as string }))
  return { id, name, pageTarget: null, sections: Array.from(new Map(sections.map((s) => [s.name, s])).values()), createdAt: now, updatedAt: now }
}

/** "3 sections · 9 entries chosen" style counts for the list (entries counted only where chosen). */
export function variantCounts(variant: Pick<CvVariant, 'sections'>): { sections: number; chosenLists: number } {
  return {
    sections: variant.sections.length,
    chosenLists: variant.sections.reduce((n, s) => n + (s.entries ? Object.keys(s.entries).length : 0), 0),
  }
}
