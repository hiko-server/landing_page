/**
 * EN → ZH structure mirroring. Pure, so it runs both in the API route and in
 * the Studio (where it is an undoable edit you can review before saving).
 */

import { EDITOR_META_KEYS, PRIVATE_SECTION_FIELDS, VISIBILITY_KEYS } from './cvVisibility'

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

/**
 * Merge one visibility key of a node. A hide set on *either* side survives:
 *   isVisible / showOnWebsite → false when either language says false
 *   hiddenFields              → union of both lists
 *   hiddenItems               → per-field union of indices that still exist
 *                               in the synced list (lists follow EN's length)
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
