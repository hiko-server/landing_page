/**
 * Pure document operations for the CV Studio.
 *
 * A document is `{ en: Section[], zh: Section[] }`. Every edit is a pure
 * function Doc → Doc so it can be recorded in undo history.
 *
 * "Linked" edits (visibility + structure) reach the other language only when
 * the twin position is unambiguous: the section exists there (matched by
 * sessionName) and EVERY array on the way has the same length in both
 * languages, so index N means the same entry on both sides. Otherwise the
 * edit applies to the current language only and the result says so
 * (`reached: false`). Text edits are never linked.
 */

import {
  ENTRY_UID_KEY,
  VISIBILITY_KEYS,
  getAt,
  hiddenIndices,
  remapHiddenItems,
  setAt,
  withFieldAudience,
  withFieldHidden,
  withItemHidden,
  withNodeAudience,
  type CvLang,
  type CvPath,
  type CvSurface,
} from '../../../lib/cvVisibility'
import { newEntryUid, uidListKeys } from '../../../lib/cvEntryUid'
import { itemAudience, remapItemAudiences, withItemAudience } from '../../../lib/cvItemAudience'

/** Keys that are bookkeeping, not typed content: visibility, audiences and the entry uid. */
const isMetaKey = (k: string) => k === ENTRY_UID_KEY || (VISIBILITY_KEYS as readonly string[]).includes(k)

export type Section = { sessionName: string; [k: string]: any }
export type Doc = { en: Section[]; zh: Section[] }

/** Result of an edit that may also apply to the other language. */
export type LinkedResult = { doc: Doc; reached: boolean }

export const otherLang = (l: CvLang): CvLang => (l === 'en' ? 'zh' : 'en')

export const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

const isPlainObject = (v: unknown): v is Record<string | symbol, any> => !!v && typeof v === 'object' && !Array.isArray(v)

// ── Stable in-memory entry keys ───────────────────────────────────────────
//
// Every object inside an array (sections, degrees, roles, highlights…) gets
// a stable key for React keys and drag-and-drop ids. The key is stored under
// a Symbol, so it survives the spread-based immutable updates but is never
// serialised: JSON.stringify (save body, drafts, export, dirty check) and
// Object.keys/entries (public pruning, sync) all ignore symbol properties.

export const ENTRY_KEY: unique symbol = Symbol('cv-studio.entry-key')

let keySeq = 0
const nextKey = () => `e${(++keySeq).toString(36)}`

/** The in-memory key of an entry (undefined for strings / unkeyed values). */
export function entryKey(item: unknown): string | undefined {
  return isPlainObject(item) && typeof item[ENTRY_KEY] === 'string' ? item[ENTRY_KEY] : undefined
}

function keyNode(node: Record<string | symbol, any>, prev: unknown): Record<string | symbol, any> {
  let out = node
  for (const k of Object.keys(node)) {
    const v = node[k]
    const p = isPlainObject(prev) ? prev[k] : undefined
    const next = Array.isArray(v) ? keyArray(v, p) : isPlainObject(v) ? keyNode(v, p) : v
    if (next !== v) {
      if (out === node) out = { ...node }
      out[k] = next
    }
  }
  return out
}

function keyArray(arr: any[], prevArr: unknown): any[] {
  const prevList: any[] = Array.isArray(prevArr) ? prevArr : []
  const present = new Set<string>()
  for (const it of arr) {
    const k = entryKey(it)
    if (k) present.add(k)
  }
  const seen = new Set<string>()
  let out = arr
  arr.forEach((item, i) => {
    if (!isPlainObject(item)) return
    const before = prevList[i]
    let next = item === before ? item : keyNode(item, before)
    let k = entryKey(next)
    if (!k || seen.has(k)) {
      // Inherit the key of the entry that sat here before (e.g. after a
      // reveal-all or sync rebuilt the object) unless another entry has it.
      const inherited = entryKey(before)
      k = inherited && !present.has(inherited) && !seen.has(inherited) ? inherited : nextKey()
      next = next === item ? { ...item } : next
      next[ENTRY_KEY] = k
    }
    seen.add(k)
    if (next !== item) {
      if (out === arr) out = [...arr]
      out[i] = next
    }
  })
  return out
}

/**
 * Give every object inside an array a unique, stable key. Unchanged subtrees
 * keep their identity; `prev` (the document before the edit) lets rebuilt
 * objects keep the key of the entry they replace.
 */
export function ensureEntryKeys(doc: Doc, prev?: Doc): Doc {
  const en = doc.en === prev?.en ? doc.en : keyArray(doc.en, prev?.en)
  const zh = doc.zh === prev?.zh ? doc.zh : keyArray(doc.zh, prev?.zh)
  return en === doc.en && zh === doc.zh ? doc : { en, zh }
}

/** JSON of a document without the in-memory keys (they are symbols, so plain stringify drops them). */
export const docJson = (doc: Doc): string => JSON.stringify({ en: doc.en, zh: doc.zh })

// ── Cross-language alignment ──────────────────────────────────────────────

/** Translate a path from one language to the other (sections matched by sessionName). */
export function translatePath(doc: Doc, from: CvLang, path: CvPath): CvPath | null {
  if (!path.length || typeof path[0] !== 'number') return null
  const name = doc[from][path[0]]?.sessionName
  if (!name) return null
  const idx = doc[otherLang(from)].findIndex((s) => s?.sessionName === name)
  if (idx < 0) return null
  return [idx, ...path.slice(1)]
}

/**
 * The twin of `path` in the other language, or null when it is ambiguous:
 * the section is missing there, or an array that `path` indexes into has a
 * different length in the other language.
 */
export function alignedTwin(doc: Doc, lang: CvLang, path: CvPath): CvPath | null {
  const twin = translatePath(doc, lang, path)
  if (!twin) return null
  const o = otherLang(lang)
  for (let i = 1; i < path.length; i++) {
    if (typeof path[i] !== 'number') continue
    const mine = getAt(doc[lang], path.slice(0, i))
    const theirs = getAt(doc[o], twin.slice(0, i))
    if (!Array.isArray(mine) || !Array.isArray(theirs) || mine.length !== theirs.length) return null
  }
  return twin
}

/**
 * Twin list path for a structural edit of the list at `listPath`, or null
 * when the edit cannot be mirrored (ancestors misaligned, or the two lists
 * have different lengths). A list missing on the twin entry counts as empty.
 */
export function listTwin(doc: Doc, lang: CvLang, listPath: CvPath): CvPath | null {
  const twin = alignedTwin(doc, lang, listPath)
  if (!twin) return null
  const mine = getAt(doc[lang], listPath)
  const theirs = getAt(doc[otherLang(lang)], twin)
  const theirParent = getAt(doc[otherLang(lang)], twin.slice(0, -1))
  if (!isPlainObject(theirParent)) return null
  const myLen = Array.isArray(mine) ? mine.length : 0
  const theirLen = Array.isArray(theirs) ? theirs.length : 0
  return myLen === theirLen ? twin : null
}

/** Length of the twin list (null when the twin position is ambiguous). */
export function twinListLength(doc: Doc, lang: CvLang, listPath: CvPath): number | null {
  const twin = alignedTwin(doc, lang, listPath)
  if (!twin) return null
  const o = otherLang(lang)
  if (!isPlainObject(getAt(doc[o], twin.slice(0, -1)))) return null
  const theirs = getAt(doc[o], twin)
  return Array.isArray(theirs) ? theirs.length : 0
}

/** True when a value carries content a person typed (visibility metadata ignored). */
export function hasContent(v: unknown): boolean {
  if (typeof v === 'string') return v.trim().length > 0
  if (typeof v === 'number' || typeof v === 'boolean') return true
  if (Array.isArray(v)) return v.some(hasContent)
  if (isPlainObject(v)) {
    return Object.keys(v).some((k) => !isMetaKey(k) && hasContent(v[k]))
  }
  return false
}

/** The other language's item that a linked remove at `index` would delete (undefined when it would not reach). */
export function twinListItem(doc: Doc, lang: CvLang, listPath: CvPath, index: number): unknown {
  const twin = listTwin(doc, lang, listPath)
  if (!twin) return undefined
  const theirs = getAt(doc[otherLang(lang)], twin)
  return Array.isArray(theirs) ? theirs[index] : undefined
}

export type Misalignment = { path: CvPath; mine: number; theirs: number }

/**
 * Every list inside a section whose length differs between the languages
 * (outermost difference only; aligned lists are compared entry by entry).
 * Paths are relative to the section.
 */
export function sectionMisalignments(doc: Doc, lang: CvLang, sessionName: string): Misalignment[] {
  const mine = doc[lang].find((s) => s?.sessionName === sessionName)
  const theirs = doc[otherLang(lang)].find((s) => s?.sessionName === sessionName)
  if (!mine || !theirs) return []
  const out: Misalignment[] = []
  const walk = (a: any, b: any, path: CvPath) => {
    if (Array.isArray(a) || Array.isArray(b)) {
      const la = Array.isArray(a) ? a.length : 0
      const lb = Array.isArray(b) ? b.length : 0
      if (la !== lb) {
        out.push({ path, mine: la, theirs: lb })
        return
      }
      for (let i = 0; i < la; i++) walk(a[i], b[i], [...path, i])
      return
    }
    if (!isPlainObject(a) || !isPlainObject(b)) return
    for (const k of Object.keys(a)) {
      if ((VISIBILITY_KEYS as readonly string[]).includes(k)) continue
      if (Array.isArray(a[k]) || Array.isArray(b[k])) walk(a[k], b[k], [...path, k])
      else if (isPlainObject(a[k])) walk(a[k], b[k], [...path, k])
    }
  }
  walk(mine, theirs, [])
  return out
}

// ── Node edits ────────────────────────────────────────────────────────────

type NodeFn = (node: any) => any

/** Apply `fn` to the node at `path` in `lang` (and, when linked and aligned, at the twin path). */
export function updateNode(doc: Doc, lang: CvLang, path: CvPath, fn: NodeFn, linked: boolean): LinkedResult {
  let next: Doc = { ...doc, [lang]: setAt(doc[lang], path, fn(getAt(doc[lang], path))) }
  let reached = false
  if (linked) {
    const twin = alignedTwin(doc, lang, path)
    if (twin) {
      const o = otherLang(lang)
      const node = getAt(doc[o], twin)
      if (isPlainObject(node)) {
        next = { ...next, [o]: setAt(doc[o], twin, fn(node)) }
        reached = true
      }
    }
  }
  return { doc: next, reached }
}

export function setValue(doc: Doc, lang: CvLang, path: CvPath, value: any): Doc {
  return { ...doc, [lang]: setAt(doc[lang], path, value) }
}

/**
 * Set a language-neutral value (a registry field marked `shared`: a status,
 * a DOI, a date, a link) in `lang` and — when linked and the entry lines up
 * in the other language — on the twin too. The twin's parent must already
 * exist; nothing is created there.
 */
export function setSharedValue(doc: Doc, lang: CvLang, path: CvPath, value: any, linked: boolean): LinkedResult {
  const mine = setValue(doc, lang, path, value)
  if (!linked) return { doc: mine, reached: false }
  const twin = alignedTwin(doc, lang, path)
  const o = otherLang(lang)
  if (!twin || !isPlainObject(getAt(doc[o], twin.slice(0, -1)))) return { doc: mine, reached: false }
  return { doc: { ...mine, [o]: setAt(doc[o], twin, value) }, reached: true }
}

// ── Visibility ────────────────────────────────────────────────────────────

export function toggleFieldHidden(doc: Doc, lang: CvLang, nodePath: CvPath, field: string, linked: boolean): LinkedResult {
  const node = getAt(doc[lang], nodePath) || {}
  const hide = !(Array.isArray(node.hiddenFields) && node.hiddenFields.includes(field))
  return setFieldHidden(doc, lang, nodePath, field, hide, linked)
}

export function setFieldHidden(doc: Doc, lang: CvLang, nodePath: CvPath, field: string, hide: boolean, linked: boolean): LinkedResult {
  return updateNode(doc, lang, nodePath, (n) => withFieldHidden(n || {}, field, hide), linked)
}

export function toggleEntryHidden(doc: Doc, lang: CvLang, entryPath: CvPath, linked: boolean): LinkedResult {
  const node = getAt(doc[lang], entryPath) || {}
  return setEntryHidden(doc, lang, entryPath, node.isVisible !== false, linked)
}

export function setEntryHidden(doc: Doc, lang: CvLang, entryPath: CvPath, hide: boolean, linked: boolean): LinkedResult {
  return updateNode(
    doc,
    lang,
    entryPath,
    (n) => {
      const out = { ...(n || {}) }
      if (hide) out.isVisible = false
      else delete out.isVisible
      return out
    },
    linked,
  )
}

export function toggleItemHidden(doc: Doc, lang: CvLang, parentPath: CvPath, field: string, index: number, linked: boolean): LinkedResult {
  const node = getAt(doc[lang], parentPath) || {}
  return setItemHidden(doc, lang, parentPath, field, index, !hiddenIndices(node, field).includes(index), linked)
}

export function setItemHidden(
  doc: Doc,
  lang: CvLang,
  parentPath: CvPath,
  field: string,
  index: number,
  hide: boolean,
  linked: boolean,
): LinkedResult {
  const mine = { ...doc, [lang]: setAt(doc[lang], parentPath, withItemHidden(getAt(doc[lang], parentPath) || {}, field, index, hide)) }
  if (!linked) return { doc: mine, reached: false }
  // The bullet list itself must line up too, or index N is a different bullet.
  const twin = alignedTwin(doc, lang, [...parentPath, field, index])
  const o = otherLang(lang)
  const theirNode = twin ? getAt(doc[o], twin.slice(0, -2)) : undefined
  if (!twin || !isPlainObject(theirNode)) return { doc: mine, reached: false }
  return { doc: { ...mine, [o]: setAt(doc[o], twin.slice(0, -2), withItemHidden(theirNode, field, index, hide)) }, reached: true }
}

/** Section-level switch (isVisible = CV, showOnWebsite = website). `true` removes the website key (default). */
export function setSectionFlag(
  doc: Doc,
  lang: CvLang,
  sectionIdx: number,
  key: 'isVisible' | 'showOnWebsite',
  on: boolean,
  linked: boolean,
): LinkedResult {
  return updateNode(
    doc,
    lang,
    [sectionIdx],
    (n) => {
      const out = { ...n }
      if (key === 'isVisible') out.isVisible = on
      else if (on) delete out.showOnWebsite
      else out.showOnWebsite = false
      return out
    },
    linked,
  )
}

// ── Audiences (E4) ────────────────────────────────────────────────────────

/** Set the audience of `field` on the node at `nodePath` (null = every surface); linked like a hide. */
export function setFieldAudience(
  doc: Doc,
  lang: CvLang,
  nodePath: CvPath,
  field: string,
  list: readonly CvSurface[] | null,
  linked: boolean,
): LinkedResult {
  return updateNode(doc, lang, nodePath, (n) => withFieldAudience(n || {}, field, list), linked)
}

/** Set the audience of the section or entry at `path` (null = every surface); linked like a hide. */
export function setNodeAudience(doc: Doc, lang: CvLang, path: CvPath, list: readonly CvSurface[] | null, linked: boolean): LinkedResult {
  return updateNode(doc, lang, path, (n) => withNodeAudience(n || {}, list), linked)
}

/**
 * Set the audience of one item of a string list (a bullet; null = every
 * surface); linked like a bullet's hide — only when the list lines up in the
 * other language, so position N is the same bullet there.
 */
export function setItemAudience(
  doc: Doc,
  lang: CvLang,
  parentPath: CvPath,
  field: string,
  index: number,
  list: readonly CvSurface[] | null,
  linked: boolean,
): LinkedResult {
  const mine = { ...doc, [lang]: setAt(doc[lang], parentPath, withItemAudience(getAt(doc[lang], parentPath) || {}, field, index, list)) }
  if (!linked) return { doc: mine, reached: false }
  const twin = alignedTwin(doc, lang, [...parentPath, field, index])
  const o = otherLang(lang)
  const theirNode = twin ? getAt(doc[o], twin.slice(0, -2)) : undefined
  if (!twin || !isPlainObject(theirNode)) return { doc: mine, reached: false }
  return { doc: { ...mine, [o]: setAt(doc[o], twin.slice(0, -2), withItemAudience(theirNode, field, index, list)) }, reached: true }
}

// ── Lists (object entries and string bullets) ─────────────────────────────

export type ListOp =
  | { type: 'insert'; index: number; item: any; twinItem?: any }
  | { type: 'remove'; index: number }
  | { type: 'move'; from: number; to: number }
  | { type: 'duplicate'; index: number }

/** Old-index → new-index mapping (-1 = removed) for remapping hidden bullet indices. */
export function mappingFor(op: ListOp, len: number): number[] {
  const m = Array.from({ length: len }, (_, i) => i)
  switch (op.type) {
    case 'insert':
      return m.map((j) => (j < op.index ? j : j + 1))
    case 'duplicate':
      return m.map((j) => (j <= op.index ? j : j + 1))
    case 'remove':
      return m.map((j) => (j < op.index ? j : j === op.index ? -1 : j - 1))
    case 'move': {
      const order = [...m]
      const [x] = order.splice(op.from, 1)
      order.splice(op.to, 0, x)
      const out = new Array(len).fill(-1)
      order.forEach((oldIdx, newIdx) => (out[oldIdx] = newIdx))
      return out
    }
  }
}

function applyToList(list: any[], op: ListOp, forTwin: boolean): any[] {
  const next = [...list]
  switch (op.type) {
    case 'insert':
      next.splice(Math.min(op.index, next.length), 0, clone(forTwin && op.twinItem !== undefined ? op.twinItem : op.item))
      return next
    case 'duplicate': {
      if (op.index < 0 || op.index >= next.length) return next
      // JSON clone drops the in-memory key, so the copy gets a fresh one. It
      // keeps every hide of its source — isVisible:false on the entry as well
      // as hiddenFields / hiddenItems — and its audiences, so duplicating
      // never publishes anything the owner hid. In a top-level list the copy
      // gets its own uid (withCreatedUids).
      const copy = clone(next[op.index])
      const copyUid = (op as { copyUid?: string }).copyUid
      next.splice(op.index + 1, 0, copyUid && isPlainObject(copy) ? { ...copy, [ENTRY_UID_KEY]: copyUid } : copy)
      return next
    }
    case 'remove':
      if (op.index >= 0 && op.index < next.length) next.splice(op.index, 1)
      return next
    case 'move': {
      if (op.from === op.to || op.from < 0 || op.to < 0 || op.from >= next.length || op.to >= next.length) return next
      const [x] = next.splice(op.from, 1)
      next.splice(op.to, 0, x)
      return next
    }
  }
}

function listOpOnSections(sections: Section[], listPath: CvPath, op: ListOp, forTwin: boolean): Section[] {
  const list = getAt(sections, listPath)
  const arr = Array.isArray(list) ? list : []
  const nextList = applyToList(arr, op, forTwin)
  const parentPath = listPath.slice(0, -1)
  const field = String(listPath[listPath.length - 1])
  const parent = getAt(sections, parentPath) || {}
  let nextParent = { ...parent, [field]: nextList }
  const hidden = hiddenIndices(parent, field)
  if (hidden.length) {
    nextParent = remapHiddenItems(nextParent, field, mappingFor(op, arr.length))
    // A copy of a hidden bullet stays hidden, like a copy of a hidden entry.
    if (op.type === 'duplicate' && nextList.length > arr.length && hidden.includes(op.index)) {
      nextParent = withItemHidden(nextParent, field, op.index + 1, true)
    }
  }
  // Item audiences are keyed by position too: they follow their bullets, and a copy keeps its source's.
  nextParent = remapItemAudiences(nextParent, field, mappingFor(op, arr.length))
  if (op.type === 'duplicate' && nextList.length > arr.length) {
    const copied = itemAudience(parent, field, op.index)
    if (copied) nextParent = withItemAudience(nextParent, field, op.index + 1, copied)
  }
  return setAt(sections, parentPath, nextParent)
}

/** True when duplicating `index` of the list at `listPath` copies something hidden (entry or bullet). */
export function duplicatesHidden(doc: Doc, lang: CvLang, listPath: CvPath, index: number): boolean {
  const list = getAt(doc[lang], listPath)
  if (!Array.isArray(list) || index < 0 || index >= list.length) return false
  const item = list[index]
  if (item && typeof item === 'object') return item.isVisible === false
  const parent = getAt(doc[lang], listPath.slice(0, -1))
  return hiddenIndices(parent, String(listPath[listPath.length - 1])).includes(index)
}

/**
 * True when `listPath` is a section's top-level registry list ([section,
 * key]) — whose entries carry a stable uid (lib/cvEntryUid).
 */
export function isUidList(sections: Section[], listPath: CvPath): boolean {
  if (listPath.length !== 2 || typeof listPath[0] !== 'number' || typeof listPath[1] !== 'string') return false
  return uidListKeys(sections[listPath[0]]?.sessionName).includes(listPath[1])
}

/**
 * The op with fresh uids for the entries it creates in a top-level list: an
 * inserted entry, and the copy a duplicate makes (a copy is a new entry, not
 * the old one twice). One uid per created entry, given to both languages, so
 * a CV variant selects the EN entry and its 中文 twin together.
 */
function withCreatedUids(sections: Section[], listPath: CvPath, op: ListOp): ListOp & { copyUid?: string } {
  if (!isUidList(sections, listPath)) return op
  if (op.type === 'insert' && isPlainObject(op.item)) {
    const uid = newEntryUid()
    return {
      ...op,
      item: { ...op.item, [ENTRY_UID_KEY]: uid },
      ...(isPlainObject(op.twinItem) ? { twinItem: { ...op.twinItem, [ENTRY_UID_KEY]: uid } } : {}),
    }
  }
  if (op.type === 'duplicate') return { ...op, copyUid: newEntryUid() }
  return op
}

/**
 * Structural list edit. Mirrored to the other language only when the twin
 * list is unambiguous (see listTwin); otherwise `reached` is false.
 */
export function listOp(doc: Doc, lang: CvLang, listPath: CvPath, rawOp: ListOp, linked: boolean): LinkedResult {
  const op = withCreatedUids(doc[lang], listPath, rawOp)
  let next: Doc = { ...doc, [lang]: listOpOnSections(doc[lang], listPath, op, false) }
  let reached = false
  if (linked) {
    const twin = listTwin(doc, lang, listPath)
    if (twin) {
      const o = otherLang(lang)
      next = { ...next, [o]: listOpOnSections(doc[o], twin, op, true) }
      reached = true
    }
  }
  return { doc: next, reached }
}

/**
 * Insert several string items (multi-line paste) as one edit. With
 * `replaceAtIndex` the first value replaces the (empty) item at `index`.
 * `reached` is true only when every insert was mirrored.
 */
export function insertMany(
  doc: Doc,
  lang: CvLang,
  listPath: CvPath,
  index: number,
  values: string[],
  replaceAtIndex: boolean,
  linked: boolean,
): LinkedResult {
  let next = doc
  let at = index
  let rest = values
  if (replaceAtIndex && values.length) {
    next = setValue(next, lang, [...listPath, index], values[0])
    rest = values.slice(1)
    at = index + 1
  } else if (!replaceAtIndex) {
    const cur = getAt(next[lang], listPath)
    const len = Array.isArray(cur) ? cur.length : 0
    at = Math.min(index + (len > index ? 1 : 0), len)
  }
  let reached = linked && rest.length > 0
  rest.forEach((v, k) => {
    const r = listOp(next, lang, listPath, { type: 'insert', index: at + k, item: v, twinItem: '' }, linked)
    next = r.doc
    if (!r.reached) reached = false
  })
  return { doc: next, reached }
}

/**
 * Append several object entries (the ORCID import's papers) to the list at
 * `listPath` as ONE edit. Each entry is inserted at the end; when linked and
 * the twin list lines up, the other language receives a copy of the same
 * entry (a paper's title, venue and ids read the same in both CVs until the
 * owner translates them). `reached` is true only when every insert was
 * mirrored.
 */
export function appendEntries(doc: Doc, lang: CvLang, listPath: CvPath, entries: readonly Record<string, any>[], linked: boolean): LinkedResult {
  let next = doc
  let reached = linked && entries.length > 0
  for (const entry of entries) {
    const cur = getAt(next[lang], listPath)
    const at = Array.isArray(cur) ? cur.length : 0
    const r = listOp(next, lang, listPath, { type: 'insert', index: at, item: clone(entry), twinItem: clone(entry) }, linked)
    next = r.doc
    if (!r.reached) reached = false
  }
  return { doc: next, reached }
}

// ── Sections ──────────────────────────────────────────────────────────────

export function moveSection(doc: Doc, lang: CvLang, from: number, to: number, linked: boolean): Doc {
  const list = [...doc[lang]]
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return doc
  const [x] = list.splice(from, 1)
  list.splice(to, 0, x)
  let next: Doc = { ...doc, [lang]: list }
  if (linked) {
    const o = otherLang(lang)
    const rank = new Map(list.map((s, i) => [s.sessionName, i]))
    const theirs = doc[o]
      .map((s, i) => ({ s, i }))
      .sort((a, b) => (rank.get(a.s.sessionName) ?? 1000 + a.i) - (rank.get(b.s.sessionName) ?? 1000 + b.i))
      .map((y) => y.s)
    next = { ...next, [o]: theirs }
  }
  return next
}

export function addSection(doc: Doc, lang: CvLang, make: (l: CvLang) => Section | null, linked: boolean): LinkedResult {
  const mine = make(lang)
  if (!mine) return { doc, reached: false }
  let next: Doc = doc
  let reached = false
  if (!doc[lang].some((s) => s.sessionName === mine.sessionName)) next = { ...next, [lang]: [...doc[lang], mine] }
  if (linked) {
    const o = otherLang(lang)
    const theirs = make(o)
    if (theirs && !doc[o].some((s) => s.sessionName === theirs.sessionName)) {
      next = { ...next, [o]: [...doc[o], theirs] }
      reached = true
    }
  }
  return { doc: next, reached }
}

export function removeSection(doc: Doc, lang: CvLang, sessionName: string, linked: boolean): LinkedResult {
  let next: Doc = { ...doc, [lang]: doc[lang].filter((s) => s.sessionName !== sessionName) }
  let reached = false
  if (linked) {
    const o = otherLang(lang)
    if (doc[o].some((s) => s.sessionName === sessionName)) {
      next = { ...next, [o]: doc[o].filter((s) => s.sessionName !== sessionName) }
      reached = true
    }
  }
  return { doc: next, reached }
}

/** Short human preview of a value (first text found), for confirmation dialogs. */
export function previewText(v: unknown, max = 80): string {
  const find = (x: unknown): string => {
    if (typeof x === 'string') return x.trim()
    if (Array.isArray(x)) {
      for (const y of x) {
        const t = find(y)
        if (t) return t
      }
      return ''
    }
    if (isPlainObject(x)) {
      for (const k of Object.keys(x)) {
        if (isMetaKey(k)) continue
        const t = find(x[k])
        if (t) return t
      }
    }
    return ''
  }
  const t = find(v).replace(/\s+/g, ' ')
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

// ── Keyboard shortcut scope ───────────────────────────────────────────────

/**
 * Overlays that keep the browser's own undo: dialogs, drawers, popovers and
 * anything rendered through a Chakra portal (command palette, Hidden-items
 * drawer, confirmation dialogs).
 */
const NATIVE_UNDO_SELECTOR = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], .chakra-portal'

type ShortcutDocument = Pick<Document, 'body' | 'documentElement' | 'querySelector'>

/**
 * Whether the Studio's ⌘Z / ⌘⇧Z (Ctrl+Z / Ctrl+Y) may handle a keydown with
 * this target. True when the target is inside the Studio root but not inside
 * an overlay there, or when nothing is focused (the target is <body>) and no
 * modal is open — e.g. after clicking a non-focusable part of the preview.
 * Everything else — the command palette, dialogs, drawers and editable
 * elements anywhere outside the Studio — keeps native undo.
 */
export function studioOwnsUndo(target: EventTarget | null, root: Element | null, doc: ShortcutDocument): boolean {
  if (!root || !target) return false
  const node = target as Node
  if (typeof node.nodeType !== 'number') return false
  if (node === doc.body || node === doc.documentElement) return !doc.querySelector('[aria-modal="true"]')
  if (!root.contains(node)) return false
  const el = node.nodeType === 1 ? (node as Element) : node.parentElement
  const overlay = el?.closest(NATIVE_UNDO_SELECTOR)
  // An overlay that wraps the whole Studio does not count; only one inside it.
  return !overlay || overlay === root || !root.contains(overlay)
}
