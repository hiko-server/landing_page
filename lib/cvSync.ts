/**
 * EN → ZH structure mirroring. Pure, so it runs both in the API route and in
 * the Studio (where it is an undoable edit you can review before saving).
 */

import { CV_SURFACES, ENTRY_UID_KEY, EDITOR_META_KEYS, PRIVATE_SECTION_FIELDS, VISIBILITY_KEYS } from './cvVisibility'
import { ITEM_POSITION_RE } from './cvItemAudience'

const isPlainObject = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

const isVisibilityKey = (key: string) => (VISIBILITY_KEYS as readonly string[]).includes(key)

/**
 * Keys that belong to one language and are never mirrored: dismissed
 * readiness checks, and the per-output PDF photo and its switch (each
 * language's PDF decides on its own; off by default).
 */
const PER_LANGUAGE_KEYS = new Set<string>([...EDITOR_META_KEYS, ...Object.values(PRIVATE_SECTION_FIELDS).flat()])

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function indexList(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n) && n >= 0) : []
}

/** An audience list's surfaces (null = unrestricted; anything malformed = none). */
function surfaces(v: unknown): string[] | null {
  if (v === undefined || v === null) return null
  return Array.isArray(v) ? CV_SURFACES.filter((s) => v.includes(s)) : []
}

/** Two audience restrictions combined: what both allow (an absent side restricts nothing). */
function intersectAudience(a: unknown, b: unknown): string[] | undefined {
  const x = surfaces(a)
  const y = surfaces(b)
  if (x === null && y === null) return undefined
  if (x === null) return y as string[]
  if (y === null) return x
  return x.filter((s) => y.includes(s))
}

/**
 * Merge one visibility key of a node. A hide set on *either* side survives:
 *   isVisible / showOnWebsite → false when either language says false
 *   hiddenFields              → union of both lists
 *   hiddenItems               → per-field union of indices that still exist
 *                               in the synced list (lists follow EN's length)
 *   onlyIn                    → the surfaces both sides allow
 *   fieldsOnlyIn              → per field, the surfaces both sides allow
 *   itemsOnlyIn               → per field and position, the surfaces both
 *                               sides allow, for positions that still exist
 *                               in the synced list
 * Returns undefined when neither side carries the key.
 */
function mergeVisibility(
  key: (typeof VISIBILITY_KEYS)[number],
  en: any,
  zh: any,
  synced: Record<string, any>,
): unknown {
  if (key === 'isVisible' || key === 'showOnWebsite') {
    if (en === false || zh === false) return false
    if (en !== undefined) return en
    return zh
  }
  if (key === 'onlyIn') return intersectAudience(en, zh)
  if (key === 'fieldsOnlyIn') {
    if (!isPlainObject(en) && !isPlainObject(zh)) return undefined
    const out: Record<string, string[]> = {}
    const a = isPlainObject(en) ? en : {}
    const b = isPlainObject(zh) ? zh : {}
    for (const field of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const merged = intersectAudience(a[field], b[field])
      if (merged) out[field] = merged
    }
    return Object.keys(out).length ? out : undefined
  }
  if (key === 'itemsOnlyIn') {
    if (!isPlainObject(en) && !isPlainObject(zh)) return undefined
    const a = isPlainObject(en) ? en : {}
    const b = isPlainObject(zh) ? zh : {}
    const out: Record<string, Record<string, string[]>> = {}
    for (const field of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const list = synced[field]
      const limit = Array.isArray(list) ? list.length : Infinity
      const pa = isPlainObject(a[field]) ? a[field] : {}
      const pb = isPlainObject(b[field]) ? b[field] : {}
      const perItem: Record<string, string[]> = {}
      for (const position of new Set([...Object.keys(pa), ...Object.keys(pb)])) {
        if (!ITEM_POSITION_RE.test(position) || Number(position) >= limit) continue
        const merged = intersectAudience(pa[position], pb[position])
        if (merged) perItem[position] = merged
      }
      if (Object.keys(perItem).length) out[field] = perItem
    }
    return Object.keys(out).length ? out : undefined
  }
  if (key === 'hiddenFields') {
    if (en === undefined && zh === undefined) return undefined
    const merged = Array.from(new Set([...stringList(en), ...stringList(zh)]))
    return merged.length || Array.isArray(en) ? merged : undefined
  }
  // hiddenItems
  if (!isPlainObject(en) && !isPlainObject(zh)) return undefined
  const out: Record<string, number[]> = {}
  const fields = new Set([...Object.keys(isPlainObject(en) ? en : {}), ...Object.keys(isPlainObject(zh) ? zh : {})])
  fields.forEach((field) => {
    const list = synced[field]
    const limit = Array.isArray(list) ? list.length : Infinity
    const merged = Array.from(new Set([...indexList(en?.[field]), ...indexList(zh?.[field])]))
      .filter((i) => i < limit)
      .sort((a, b) => a - b)
    if (merged.length) out[field] = merged
  })
  return Object.keys(out).length || isPlainObject(en) ? out : undefined
}

const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

/**
 * Keys / array lengths follow `template`; text already in `target` is kept.
 * Visibility metadata is merged rather than copied: a hide set in EN reaches
 * ZH (hiding GPA in EN and syncing hides it in ZH too), and a hide that only
 * exists on the ZH side is preserved instead of being wiped.
 */
export function syncStructure(template: any, target: any): any {
  if (Array.isArray(template)) {
    const tArr = Array.isArray(target) ? target : []
    return template.map((item, idx) => syncStructure(item, tArr[idx]))
  }
  if (isPlainObject(template)) {
    const result: any = {}
    const tObj = isPlainObject(target) ? target : {}
    for (const key of Object.keys(template)) {
      if (isVisibilityKey(key) || PER_LANGUAGE_KEYS.has(key)) continue
      // An entry's uid is structure, not text: the twin takes EN's, so one CV variant selects both.
      if (key === ENTRY_UID_KEY && typeof template[key] === 'string') {
        result[key] = template[key]
        continue
      }
      result[key] = syncStructure(template[key], tObj[key])
    }
    for (const key of PER_LANGUAGE_KEYS) if (key in tObj) result[key] = clone(tObj[key])
    for (const key of VISIBILITY_KEYS) {
      if (!(key in template) && !(key in tObj)) continue
      const merged = mergeVisibility(key, template[key], tObj[key], result)
      if (merged !== undefined) result[key] = clone(merged)
    }
    return result
  }
  // primitive: prefer target if defined, otherwise copy template
  if (target === undefined || target === null) return template
  return target
}

/**
 * Mirror a whole language. Sections are matched by `sessionName` (not by
 * position), so a differently-ordered ZH document can never get two
 * unrelated sections merged together. Output order follows EN.
 */
export function syncLanguage(en: any[], zh: any[]): any[] {
  const source = Array.isArray(en) ? en : []
  const target = Array.isArray(zh) ? zh : []
  return source.map((section) => {
    const match = target.find((z) => z && z.sessionName === section?.sessionName)
    return syncStructure(section, match)
  })
}
