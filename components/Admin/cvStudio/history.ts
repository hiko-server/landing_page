/**
 * Pure undo / redo history for the Studio document (both languages in one
 * timeline). Typing is coalesced into one step per field: consecutive edits
 * with the same `key` within COALESCE_MS replace the present instead of
 * pushing a new step, so ⌘Z undoes a word rather than a keystroke.
 */

import { ensureEntryKeys, type Doc } from './docOps'

export const HISTORY_LIMIT = 200
export const COALESCE_MS = 1200

export type History = {
  past: Doc[]
  present: Doc
  future: Doc[]
  lastKey: string | null
  lastAt: number
}

export const EMPTY_DOC: Doc = { en: [], zh: [] }

export function historyInit(doc: Doc = EMPTY_DOC): History {
  return { past: [], present: ensureEntryKeys(doc), future: [], lastKey: null, lastAt: 0 }
}

/** Record an edit. Returns the same history object when the edit changed nothing. */
export function historyApply(h: History, fn: (d: Doc) => Doc, key: string | undefined, at: number): History {
  const raw = fn(h.present)
  if (raw === h.present) return h
  const next = ensureEntryKeys(raw, h.present)
  const coalesce = !!key && key === h.lastKey && at - h.lastAt < COALESCE_MS
  const past = coalesce ? h.past : [...h.past, h.present].slice(-HISTORY_LIMIT)
  return { past, present: next, future: [], lastKey: key || null, lastAt: at }
}

export function historyUndo(h: History): History {
  if (!h.past.length) return h
  const prev = h.past[h.past.length - 1]
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future], lastKey: null, lastAt: 0 }
}

export function historyRedo(h: History): History {
  if (!h.future.length) return h
  const [next, ...rest] = h.future
  return { past: [...h.past, h.present], present: next, future: rest, lastKey: null, lastAt: 0 }
}
