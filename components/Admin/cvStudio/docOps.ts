/**
 * Pure document operations for the CV Studio.
 *
 * A document is `{ en: Section[], zh: Section[] }`. Every edit is a pure
 * function Doc → Doc so it can be recorded in undo history. "Linked" edits
 * (visibility + structure) are applied to the other language at the same
 * position when that position exists there with the same shape; text edits
 * are never linked.
 */

import {
  getAt,
  hiddenIndices,
  remapHiddenItems,
  setAt,
  withFieldHidden,
  withItemHidden,
  type CvLang,
  type CvPath,
} from '../../../lib/cvVisibility'

export type Section = { sessionName: string; [k: string]: any }
export type Doc = { en: Section[]; zh: Section[] }

export const otherLang = (l: CvLang): CvLang => (l === 'en' ? 'zh' : 'en')

export const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

/** Translate a path from one language to the other (sections matched by sessionName). */
export function translatePath(doc: Doc, from: CvLang, path: CvPath): CvPath | null {
  if (!path.length || typeof path[0] !== 'number') return null
  const name = doc[from][path[0]]?.sessionName
  if (!name) return null
  const idx = doc[otherLang(from)].findIndex((s) => s?.sessionName === name)
  if (idx < 0) return null
  return [idx, ...path.slice(1)]
}

type NodeFn = (node: any) => any

/** Apply `fn` to the node at `path` in `lang` (and, when linked, at the twin path). */
export function updateNode(doc: Doc, lang: CvLang, path: CvPath, fn: NodeFn, linked: boolean): Doc {
  let next: Doc = { ...doc, [lang]: setAt(doc[lang], path, fn(getAt(doc[lang], path))) }
  if (linked) {
    const twin = translatePath(doc, lang, path)
    if (twin) {
      const o = otherLang(lang)
      const node = getAt(doc[o], twin)
      if (node && typeof node === 'object') next = { ...next, [o]: setAt(doc[o], twin, fn(node)) }
    }
  }
  return next
}

export function setValue(doc: Doc, lang: CvLang, path: CvPath, value: any): Doc {
  return { ...doc, [lang]: setAt(doc[lang], path, value) }
}

// ── Visibility ────────────────────────────────────────────────────────────

export function toggleFieldHidden(doc: Doc, lang: CvLang, nodePath: CvPath, field: string, linked: boolean): Doc {
  const node = getAt(doc[lang], nodePath) || {}
  const hide = !(Array.isArray(node.hiddenFields) && node.hiddenFields.includes(field))
  return updateNode(doc, lang, nodePath, (n) => withFieldHidden(n || {}, field, hide), linked)
}

export function toggleEntryHidden(doc: Doc, lang: CvLang, entryPath: CvPath, linked: boolean): Doc {
  const node = getAt(doc[lang], entryPath) || {}
  const hide = node.isVisible !== false
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

export function toggleItemHidden(doc: Doc, lang: CvLang, parentPath: CvPath, field: string, index: number, linked: boolean): Doc {
  const node = getAt(doc[lang], parentPath) || {}
  const hide = !hiddenIndices(node, field).includes(index)
  return updateNode(doc, lang, parentPath, (n) => withItemHidden(n || {}, field, index, hide), linked)
}

/** Section-level switch (isVisible = CV, showOnWebsite = website). `true` removes the key (default). */
export function setSectionFlag(doc: Doc, lang: CvLang, sectionIdx: number, key: 'isVisible' | 'showOnWebsite', on: boolean, linked: boolean): Doc {
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
      const copy = clone(next[op.index])
      if (copy && typeof copy === 'object') delete copy.isVisible
      next.splice(op.index + 1, 0, copy)
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
  if (hiddenIndices(parent, field).length) nextParent = remapHiddenItems(nextParent, field, mappingFor(op, arr.length))
  return setAt(sections, parentPath, nextParent)
}

/**
 * Structural list edit. Linked only when the twin list exists with the same
 * length (so indices line up); otherwise the twin is left untouched and the
 * return value reports `linkedApplied: false`.
 */
export function listOp(doc: Doc, lang: CvLang, listPath: CvPath, op: ListOp, linked: boolean): { doc: Doc; linkedApplied: boolean } {
  let next: Doc = { ...doc, [lang]: listOpOnSections(doc[lang], listPath, op, false) }
  let linkedApplied = false
  if (linked) {
    const twin = translatePath(doc, lang, listPath)
    const o = otherLang(lang)
    if (twin) {
      const mine = getAt(doc[lang], listPath)
      const theirs = getAt(doc[o], twin)
      const myLen = Array.isArray(mine) ? mine.length : 0
      const theirParent = getAt(doc[o], twin.slice(0, -1))
      const theirLen = Array.isArray(theirs) ? theirs.length : theirParent ? 0 : -1
      if (theirLen === myLen) {
        next = { ...next, [o]: listOpOnSections(doc[o], twin, op, true) }
        linkedApplied = true
      }
    }
  }
  return { doc: next, linkedApplied }
}

/** Would a linked list edit reach the other language? (for UI hints) */
export function canLinkList(doc: Doc, lang: CvLang, listPath: CvPath): boolean {
  const twin = translatePath(doc, lang, listPath)
  if (!twin) return false
  const mine = getAt(doc[lang], listPath)
  const theirs = getAt(doc[otherLang(lang)], twin)
  const myLen = Array.isArray(mine) ? mine.length : 0
  const theirLen = Array.isArray(theirs) ? theirs.length : 0
  return myLen === theirLen
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
      .map((x) => x.s)
    next = { ...next, [o]: theirs }
  }
  return next
}

export function addSection(doc: Doc, lang: CvLang, make: (l: CvLang) => Section | null, linked: boolean): Doc {
  const mine = make(lang)
  if (!mine) return doc
  let next: Doc = doc
  if (!doc[lang].some((s) => s.sessionName === mine.sessionName)) next = { ...next, [lang]: [...doc[lang], mine] }
  if (linked) {
    const o = otherLang(lang)
    const theirs = make(o)
    if (theirs && !doc[o].some((s) => s.sessionName === theirs.sessionName)) next = { ...next, [o]: [...doc[o], theirs] }
  }
  return next
}

export function removeSection(doc: Doc, lang: CvLang, sessionName: string, linked: boolean): Doc {
  let next: Doc = { ...doc, [lang]: doc[lang].filter((s) => s.sessionName !== sessionName) }
  if (linked) {
    const o = otherLang(lang)
    next = { ...next, [o]: doc[o].filter((s) => s.sessionName !== sessionName) }
  }
  return next
}
