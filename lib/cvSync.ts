/**
 * EN → ZH structure mirroring. Pure, so it runs both in the API route and in
 * the Studio (where it is an undoable edit you can review before saving).
 */

import { VISIBILITY_KEYS } from './cvVisibility'

const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

/**
 * Keys / array lengths follow `template`; text already in `target` is kept.
 * Visibility metadata is structure, not text, so it is copied from the
 * template verbatim — hiding GPA in EN and syncing hides it in ZH too.
 */
export function syncStructure(template: any, target: any): any {
  if (Array.isArray(template)) {
    const tArr = Array.isArray(target) ? target : []
    return template.map((item, idx) => syncStructure(item, tArr[idx]))
  }
  if (template && typeof template === 'object') {
    const result: any = {}
    const tObj = target && typeof target === 'object' && !Array.isArray(target) ? target : {}
    for (const key of Object.keys(template)) {
      result[key] = (VISIBILITY_KEYS as readonly string[]).includes(key)
        ? clone(template[key])
        : syncStructure(template[key], tObj[key])
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
