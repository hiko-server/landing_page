/**
 * Structural validation of a CV document ({ en, zh }) against the section
 * registry (lib/cvSections.ts), run on every CV write before anything is
 * stored. Pure — shared by the API and the editors' error display.
 *
 * Rules:
 *   - each language is an array of objects with a string `sessionName`
 *   - known sections: every registry field is checked by kind — text-like
 *     kinds hold strings, month / endMonth hold `YYYY`, `YYYY-MM`,
 *     `YYYY-MM-DD` or nothing (endMonth also accepts "Present" markers),
 *     bullets / tags hold string arrays; registry lists hold arrays of
 *     objects and are checked recursively
 *   - visibility metadata: `isVisible` / `showOnWebsite` booleans,
 *     `hiddenFields` string[], `hiddenItems` { [field]: non-negative int[] }
 *   - unknown sections and unknown keys pass through untouched, and missing
 *     or null values count as empty (renderers already handle both)
 *
 * At most MAX_ERRORS errors are collected. Paths are arrays starting with the
 * language and the section index: ['en', 2, 'experiences', 0, 'startDate'].
 */

import { isPresent } from './cvFormat'
import { SECTION_BY_NAME, type FieldDef, type ListDef } from './cvSections'

export type CvLangKey = 'en' | 'zh'
export type CvErrorPath = [CvLangKey, number, ...(string | number)[]]
export type CvValidationError = { path: CvErrorPath; message: string }
export type CvDoc = { en: any[]; zh: any[] }
export type CvValidation = { ok: true; doc: CvDoc } | { ok: false; errors: CvValidationError[] }

export const MAX_ERRORS = 50
export const CV_DATE_RE = /^(\d{4})(-\d{2}(-\d{2})?)?$/

const LANGS: CvLangKey[] = ['en', 'zh']
const TEXT_KINDS = new Set(['text', 'textarea', 'url', 'email', 'tel', 'color'])

type Path = (string | number)[]

class Collector {
  errors: CvValidationError[] = []
  get full() {
    return this.errors.length >= MAX_ERRORS
  }
  add(path: Path, message: string) {
    if (!this.full) this.errors.push({ path: path as CvErrorPath, message })
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const absent = (v: unknown) => v === undefined || v === null

function checkField(f: FieldDef, value: unknown, path: Path, out: Collector) {
  if (absent(value)) return
  if (TEXT_KINDS.has(f.kind)) {
    if (typeof value !== 'string') out.add(path, `${f.label} must be text.`)
    return
  }
  if (f.kind === 'month' || f.kind === 'endMonth') {
    if (typeof value !== 'string') {
      out.add(path, `${f.label} must be a date like 2024-09.`)
      return
    }
    const v = value.trim()
    if (v === '' || CV_DATE_RE.test(v)) return
    if (f.kind === 'endMonth' && isPresent(v)) return
    out.add(path, f.kind === 'endMonth' ? `${f.label} must be a date like 2024-09, or Present.` : `${f.label} must be a date like 2024-09.`)
    return
  }
  // bullets / tags
  if (!Array.isArray(value)) {
    out.add(path, `${f.label} must be a list of text items.`)
    return
  }
  value.forEach((item, i) => {
    if (typeof item !== 'string') out.add([...path, i], `${f.label} item ${i + 1} must be text.`)
  })
}

function checkVisibility(node: Record<string, unknown>, path: Path, out: Collector) {
  for (const key of ['isVisible', 'showOnWebsite'] as const) {
    if (!absent(node[key]) && typeof node[key] !== 'boolean') out.add([...path, key], `${key} must be true or false.`)
  }
  const hf = node.hiddenFields
  if (!absent(hf) && (!Array.isArray(hf) || hf.some((x) => typeof x !== 'string'))) {
    out.add([...path, 'hiddenFields'], 'hiddenFields must be a list of field names.')
  }
  const hi = node.hiddenItems
  if (absent(hi)) return
  if (!isObject(hi)) {
    out.add([...path, 'hiddenItems'], 'hiddenItems must map field names to index lists.')
    return
  }
  for (const [field, list] of Object.entries(hi)) {
    if (!Array.isArray(list) || list.some((n) => typeof n !== 'number' || !Number.isInteger(n) || n < 0)) {
      out.add([...path, 'hiddenItems', field], `hiddenItems.${field} must be a list of item positions.`)
    }
  }
}

/** Check a node (section or list entry) whose shape is described by `fields` / `lists`. */
function checkNode(node: Record<string, unknown>, fields: FieldDef[] | undefined, lists: ListDef[] | undefined, path: Path, out: Collector) {
  checkVisibility(node, path, out)
  for (const f of fields || []) {
    if (out.full) return
    checkField(f, node[f.key], [...path, f.key], out)
  }
  for (const l of lists || []) {
    if (out.full) return
    const value = node[l.key]
    if (absent(value)) continue
    if (!Array.isArray(value)) {
      out.add([...path, l.key], `${l.label} must be a list.`)
      continue
    }
    value.forEach((entry, i) => {
      if (out.full) return
      const entryPath = [...path, l.key, i]
      if (!isObject(entry)) {
        out.add(entryPath, `${l.label} #${i + 1} must be an object.`)
        return
      }
      checkNode(entry, l.fields, l.lists, entryPath, out)
    })
  }
}

/**
 * Validate a CV document. A language that is absent from `input` validates as
 * an empty list, so callers can check a partial write ({ en } only).
 */
export function validateCvDoc(input: unknown): CvValidation {
  const out = new Collector()
  if (!isObject(input)) {
    return { ok: false, errors: [{ path: ['en', 0], message: 'The CV must be an object with "en" and "zh" section lists.' }] }
  }
  const doc: CvDoc = { en: [], zh: [] }
  for (const lang of LANGS) {
    const sections = input[lang]
    if (absent(sections)) continue
    if (!Array.isArray(sections)) {
      out.add([lang, 0], `The ${lang === 'en' ? 'English' : 'Chinese'} CV must be a list of sections.`)
      continue
    }
    doc[lang] = sections
    sections.forEach((section, i) => {
      if (out.full) return
      if (!isObject(section) || typeof section.sessionName !== 'string') {
        out.add([lang, i], `Section #${i + 1} needs a string "sessionName".`)
        return
      }
      const def = SECTION_BY_NAME[section.sessionName]
      if (!def) return // unknown section types pass through
      if (!absent(section.headerName) && typeof section.headerName !== 'string') {
        out.add([lang, i, 'headerName'], 'The section heading must be text.')
      }
      checkNode(section, def.fields, def.lists, [lang, i], out)
    })
  }
  return out.errors.length ? { ok: false, errors: out.errors } : { ok: true, doc }
}

const VISIBILITY_SEGMENTS = new Set(['isVisible', 'showOnWebsite', 'hiddenFields', 'hiddenItems', 'headerName'])

/**
 * Where an editor should jump for an error: the language, the section index
 * and the deepest editable path inside the section (visibility metadata
 * maps to the entry or section it belongs to).
 */
export function errorFocusPath(path: CvErrorPath): { lang: CvLangKey; sectionIdx: number; path: (string | number)[] } {
  const [lang, sectionIdx, ...rest] = path
  const cut = rest.findIndex((seg) => typeof seg === 'string' && VISIBILITY_SEGMENTS.has(seg))
  const inner = cut >= 0 ? rest.slice(0, cut) : rest
  return { lang, sectionIdx, path: [sectionIdx, ...inner] }
}

/** Parse the `errors` array of a 422 INVALID_CV response defensively. */
export function readCvErrors(body: unknown): CvValidationError[] {
  const list = isObject(body) && Array.isArray(body.errors) ? body.errors : []
  return list
    .filter(
      (e): e is CvValidationError =>
        isObject(e) &&
        typeof e.message === 'string' &&
        Array.isArray(e.path) &&
        (e.path[0] === 'en' || e.path[0] === 'zh') &&
        typeof e.path[1] === 'number' &&
        e.path.every((seg: unknown) => typeof seg === 'string' || typeof seg === 'number'),
    )
    .slice(0, MAX_ERRORS)
}
