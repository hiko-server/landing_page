/**
 * Stable identity of CV entries (E4) — pure, shared by the server (every
 * read of the stored CV, every save) and the CV Studio.
 *
 * Every object in a section's TOP-LEVEL registry list (a degree, a role, a
 * project, a paper, a skill group …) carries `uid`: CV variants select and
 * order entries by it (lib/cvVariants), so a variant keeps pointing at the
 * same role after the owner reorders, inserts or deletes others. Nested
 * lists (a role's highlights) have none: variants choose whole entries.
 *
 *   - New entries get a random uid (newEntryUid) in the Studio; a linked
 *     insert, duplicate or import gives the EN entry and its 中文 twin the
 *     SAME uid, so one variant selects both languages.
 *   - An entry stored without one (a CV saved before variants existed, a
 *     raw-JSON edit, an imported file) gets a DETERMINISTIC uid on every
 *     read until the next save stores it — the same stored document always
 *     yields the same uids. The two languages are filled together, with the
 *     CV Studio's twin rule (components/Admin/cvStudio/docOps listTwin):
 *     only when a list has the same length in EN and 中文 (sections matched
 *     by sessionName) are entries at the same position twins — they share
 *     a uid (`experiences-2`, or the stored uid of the one that has it).
 *     When the lengths differ nothing is paired by position: a 中文 entry
 *     without a uid gets one of its own (`zh-experiences-1`), so a variant
 *     selects nothing there rather than the wrong entry, and no new uid
 *     ever repeats one an entry of either language already holds. Once
 *     stored, a uid travels with its entry wherever it moves.
 *   - Duplicates inside one list (an import of a hand-edited file) are
 *     repaired deterministically too: the first keeps the uid, a later one
 *     gets `<uid>-<position>`.
 *
 * The public views never carry it (lib/cvVisibility strips ENTRY_UID_KEY).
 */

import { ENTRY_UID_KEY } from './cvVisibility'
import { SECTION_BY_NAME } from './cvSections'

export const ENTRY_UID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

const isPlainObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)

/** True for a well-formed uid. */
export function isEntryUid(v: unknown): v is string {
  return typeof v === 'string' && ENTRY_UID_RE.test(v)
}

/** A fresh random uid ("u" + 12 base-36 characters, ~62 bits). */
export function newEntryUid(): string {
  const bytes = new Uint8Array(12)
  globalThis.crypto.getRandomValues(bytes)
  return `u${Array.from(bytes, (b) => (b % 36).toString(36)).join('')}`
}

/** The top-level registry list keys of a section ([] for unknown sections). */
export function uidListKeys(sessionName: unknown): string[] {
  const def = typeof sessionName === 'string' ? SECTION_BY_NAME[sessionName] : undefined
  return (def?.lists || []).map((l) => l.key)
}

/**
 * Give every entry of one list a unique, well-formed uid (see the module
 * comment). Returns the same array when nothing changed.
 */
export function withListUids(list: unknown[], listKey: string): unknown[] {
  const taken = new Set<string>()
  for (const item of list) if (isPlainObject(item) && isEntryUid(item[ENTRY_UID_KEY])) taken.add(item[ENTRY_UID_KEY])
  const used = new Set<string>()
  // A new or repaired uid never takes one another entry of the list holds.
  const unique = (base: string): string => {
    let candidate = base
    for (let n = 2; used.has(candidate) || taken.has(candidate); n++) candidate = `${base}-${n}`
    return candidate
  }
  let out: unknown[] | null = null
  list.forEach((item, i) => {
    if (!isPlainObject(item)) return
    const own = item[ENTRY_UID_KEY]
    let uid: string
    if (isEntryUid(own) && !used.has(own)) uid = own
    else if (isEntryUid(own)) uid = unique(`${own.slice(0, 52)}-${i}`)
    else uid = unique(`${listKey}-${i}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 56) || `entry-${i}`)
    used.add(uid)
    if (uid !== own) {
      if (!out) out = [...list]
      out[i] = { ...item, [ENTRY_UID_KEY]: uid }
    }
  })
  return out ?? list
}

/** One language's sections with every top-level entry uid filled (same array when nothing changed). */
export function withSectionUids<T>(sections: T[]): T[] {
  if (!Array.isArray(sections)) return sections
  let out: T[] | null = null
  sections.forEach((section, i) => {
    if (!isPlainObject(section)) return
    let next: Record<string, any> = section
    for (const key of uidListKeys(section.sessionName)) {
      const list = next[key]
      if (!Array.isArray(list)) continue
      const filled = withListUids(list, key)
      if (filled !== list) next = { ...next, [key]: filled }
    }
    if (next !== section) {
      if (!out) out = [...sections]
      out[i] = next as T
    }
  })
  return out ?? sections
}

const uidOf = (item: unknown): string | null => (isPlainObject(item) && isEntryUid(item[ENTRY_UID_KEY]) ? item[ENTRY_UID_KEY] : null)

/**
 * One list in both languages (either may be absent), filled together — see
 * the module comment. Returns the same arrays when nothing changed.
 */
export function withPairedListUids(en: unknown[] | null, zh: unknown[] | null, listKey: string): [unknown[] | null, unknown[] | null] {
  const E = en ? en.map(uidOf) : []
  const Z = zh ? zh.map(uidOf) : []
  const aligned = !!en && !!zh && en.length === zh.length
  if (aligned) {
    // A stored uid passes to its twin when the twin has none.
    for (let i = 0; i < E.length; i++) {
      const e = E[i]
      const z = Z[i]
      if (!e && z && isPlainObject(en![i]) && !E.includes(z)) E[i] = z
      else if (!z && e && isPlainObject(zh![i]) && !Z.includes(e)) Z[i] = e
    }
  }
  const taken = new Set<string>([...E, ...Z].filter((u): u is string => !!u))
  const unique = (base: string): string => {
    let candidate = base
    for (let n = 2; taken.has(candidate); n++) candidate = `${base}-${n}`
    taken.add(candidate)
    return candidate
  }
  const positional = (prefix: string, i: number) => `${prefix}${listKey}-${i}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 56) || `${prefix}entry-${i}`
  en?.forEach((item, i) => {
    if (!isPlainObject(item) || E[i]) return
    E[i] = unique(positional('', i))
    if (aligned && isPlainObject(zh![i]) && !Z[i]) Z[i] = E[i]
  })
  zh?.forEach((item, i) => {
    if (!isPlainObject(item) || Z[i]) return
    Z[i] = unique(positional(aligned ? '' : 'zh-', i))
  })
  const apply = (list: unknown[] | null, uids: Array<string | null>): unknown[] | null => {
    if (!list) return list
    let out: unknown[] | null = null
    list.forEach((item, i) => {
      if (!isPlainObject(item) || !uids[i] || item[ENTRY_UID_KEY] === uids[i]) return
      if (!out) out = [...list]
      out[i] = { ...item, [ENTRY_UID_KEY]: uids[i] }
    })
    // Duplicates inside one list (a hand-edited import) are repaired as before.
    return withListUids(out ?? list, listKey)
  }
  return [apply(en, E), apply(zh, Z)]
}

/** Both languages with uids filled, together (see the module comment). */
export function withEntryUids<D extends { en: any[]; zh: any[] }>(doc: D): D {
  if (!Array.isArray(doc.en) || !Array.isArray(doc.zh)) {
    const en = withSectionUids(doc.en)
    const zh = withSectionUids(doc.zh)
    return en === doc.en && zh === doc.zh ? doc : { ...doc, en, zh }
  }
  let en: any[] | null = null
  let zh: any[] | null = null
  const paired = new Set<number>()
  const setSection = (lang: 'en' | 'zh', i: number, key: string, list: unknown[] | null, before: unknown) => {
    if (!list || list === before) return
    if (lang === 'en') {
      en = en ?? [...doc.en]
      en[i] = { ...en[i], [key]: list }
    } else {
      zh = zh ?? [...doc.zh]
      zh[i] = { ...zh[i], [key]: list }
    }
  }
  doc.en.forEach((section, si) => {
    if (!isPlainObject(section)) return
    // Its 中文 twin: the first section of the same name not paired yet.
    const zi = doc.zh.findIndex((z, i) => !paired.has(i) && isPlainObject(z) && z.sessionName === section.sessionName)
    if (zi >= 0) paired.add(zi)
    const twin = zi >= 0 ? (doc.zh[zi] as Record<string, any>) : null
    for (const key of uidListKeys(section.sessionName)) {
      const enList = Array.isArray(section[key]) ? (section[key] as unknown[]) : null
      const zhList = twin && Array.isArray(twin[key]) ? (twin[key] as unknown[]) : null
      if (!enList && !zhList) continue
      const [e, z] = withPairedListUids(enList, zhList, key)
      setSection('en', si, key, e, enList)
      if (zi >= 0) setSection('zh', zi, key, z, zhList)
    }
  })
  doc.zh.forEach((section, zi) => {
    if (paired.has(zi) || !isPlainObject(section)) return
    for (const key of uidListKeys(section.sessionName)) {
      const zhList = Array.isArray(section[key]) ? (section[key] as unknown[]) : null
      if (!zhList) continue
      const [, z] = withPairedListUids(null, zhList, key)
      setSection('zh', zi, key, z, zhList)
    }
  })
  return en || zh ? { ...doc, en: en ?? doc.en, zh: zh ?? doc.zh } : doc
}

/**
 * One language's sections with uids filled against the other language as it
 * is now — an import of one language keeps the pairing with the other (same
 * rule as withEntryUids; the other language is not changed).
 */
export function withSectionUidsBeside<T>(sections: T[], lang: 'en' | 'zh', other: unknown[]): T[] {
  if (!Array.isArray(sections)) return sections
  const otherSections = Array.isArray(other) ? (other as any[]) : []
  const doc = lang === 'en' ? withEntryUids({ en: sections as any[], zh: otherSections }) : withEntryUids({ en: otherSections, zh: sections as any[] })
  return (lang === 'en' ? doc.en : doc.zh) as T[]
}
