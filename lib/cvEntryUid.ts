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
 *     raw-JSON edit) gets a DETERMINISTIC uid from its list and position
 *     (`experiences-2`) on every read until the next save stores it: the
 *     same stored document always yields the same uids, and EN / 中文
 *     entries at the same position share theirs. Once stored, a uid travels
 *     with its entry wherever it moves.
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

/** Both languages with uids filled. */
export function withEntryUids<D extends { en: any[]; zh: any[] }>(doc: D): D {
  const en = withSectionUids(doc.en)
  const zh = withSectionUids(doc.zh)
  return en === doc.en && zh === doc.zh ? doc : { ...doc, en, zh }
}
