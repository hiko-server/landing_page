import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { expandReplacement, findAll, MAX_MATCHES, type FindOptions, type Match } from './findReplace'

/**
 * Find & replace inside the visual editor (H3), built in-house on
 * ProseMirror decorations (no extra package):
 *
 *   - matches are searched per text block (a paragraph, heading, list
 *     item…); inline nodes that are not text (an image, a hard break)
 *     count as one object-replacement character, so a match never spans
 *     them and string offsets map 1:1 onto document positions;
 *   - every match gets the `tt-find-match` class, the current one
 *     `tt-find-current`;
 *   - replacing goes through one transaction (one undo step), keeping the
 *     marks at the start of each match.
 *
 * The panel (FindReplacePanel) drives it through setFindQuery /
 * setFindCurrent and reads findState().
 */

export type FindPluginState = { re: RegExp | null; opts: FindOptions; matches: Match[]; current: number }

export const findKey = new PluginKey<FindPluginState>('findReplace')

const OBJECT = '￼'

/** Every match of `re` in the document, as document positions. */
export function findMatchesInDoc(doc: PMNode, re: RegExp | null, limit = MAX_MATCHES): Match[] {
  if (!re) return []
  const out: Match[] = []
  doc.descendants((node, pos) => {
    if (out.length >= limit) return false
    if (!node.isTextblock) return true
    let text = ''
    node.forEach((child) => {
      text += child.isText ? child.text || '' : OBJECT.repeat(child.nodeSize)
    })
    for (const m of findAll(text, re, limit - out.length)) {
      const slice = text.slice(m.from, m.to)
      if (slice.includes(OBJECT)) continue
      out.push({ from: pos + 1 + m.from, to: pos + 1 + m.to })
    }
    return false
  })
  return out
}

function decorations(doc: PMNode, s: FindPluginState): DecorationSet {
  if (!s.matches.length) return DecorationSet.empty
  return DecorationSet.create(
    doc,
    s.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === s.current ? 'tt-find-match tt-find-current' : 'tt-find-match' })),
  )
}

type Meta = { re: RegExp | null; opts: FindOptions; current?: number } | { current: number }

const EMPTY: FindPluginState = { re: null, opts: { caseSensitive: false, wholeWord: false, regex: false }, matches: [], current: -1 }

/** The ProseMirror plugin (state + decorations); exported for tests. */
export function findReplacePlugin(): Plugin<FindPluginState> {
  return new Plugin<FindPluginState>({
    key: findKey,
    state: {
      init: () => EMPTY,
      apply(tr: Transaction, prev: FindPluginState): FindPluginState {
        const meta = tr.getMeta(findKey) as Meta | undefined
        if (meta && 're' in meta) {
          const matches = findMatchesInDoc(tr.doc, meta.re)
          const current = matches.length ? Math.min(Math.max(meta.current ?? 0, 0), matches.length - 1) : -1
          return { re: meta.re, opts: meta.opts, matches, current }
        }
        if (meta && 'current' in meta) {
          return { ...prev, current: prev.matches.length ? ((meta.current % prev.matches.length) + prev.matches.length) % prev.matches.length : -1 }
        }
        if (tr.docChanged && prev.re) {
          const matches = findMatchesInDoc(tr.doc, prev.re)
          return { ...prev, matches, current: matches.length ? Math.min(Math.max(prev.current, 0), matches.length - 1) : -1 }
        }
        return prev
      },
    },
    props: {
      decorations(state: EditorState) {
        const s = findKey.getState(state)
        return s ? decorations(state.doc, s) : DecorationSet.empty
      },
    },
  })
}

export const FindReplace = Extension.create({
  name: 'findReplace',
  addProseMirrorPlugins() {
    return [findReplacePlugin()]
  },
})

export function findState(state: EditorState): FindPluginState {
  return findKey.getState(state) ?? EMPTY
}

/** Transaction that sets the query (current: the match index to select). */
export function setFindQuery(state: EditorState, re: RegExp | null, opts: FindOptions, current = 0): Transaction {
  return state.tr.setMeta(findKey, { re, opts, current }).setMeta('addToHistory', false)
}

export function setFindCurrent(state: EditorState, current: number): Transaction {
  return state.tr.setMeta(findKey, { current }).setMeta('addToHistory', false)
}

/** Transaction replacing match `index` (null when there is none). */
export function replaceMatch(state: EditorState, index: number, replacement: string): Transaction | null {
  const s = findState(state)
  const m = s.matches[index]
  if (!m || !s.re) return null
  const text = expandReplacement(state.doc.textBetween(m.from, m.to, '\n', OBJECT), s.re, replacement, s.opts)
  const tr = state.tr
  if (text) tr.insertText(text, m.from, m.to)
  else tr.delete(m.from, m.to)
  return tr
}

/** Transaction replacing every match (last to first, one undo step), with the count. */
export function replaceAllMatches(state: EditorState, replacement: string): { tr: Transaction; count: number } | null {
  const s = findState(state)
  if (!s.re || !s.matches.length) return null
  const tr = state.tr
  for (let i = s.matches.length - 1; i >= 0; i--) {
    const m = s.matches[i]
    const text = expandReplacement(state.doc.textBetween(m.from, m.to, '\n', OBJECT), s.re, replacement, s.opts)
    if (text) tr.insertText(text, m.from, m.to)
    else tr.delete(m.from, m.to)
  }
  return { tr, count: s.matches.length }
}
