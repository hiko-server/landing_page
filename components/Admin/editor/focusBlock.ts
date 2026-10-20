import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * Marks the top-level block that holds the caret with `tt-focus-block`
 * (H3). Focus mode dims every other block with CSS (RichEditor), so the
 * paragraph being written stands out; outside focus mode the class has no
 * style. In-house rather than @tiptap/extensions Focus, which is not a
 * direct dependency, and only the outermost block is wanted.
 */

const key = new PluginKey('focusBlock')

/** [from, to) of the top-level node around `pos`, or null in an empty document. */
export function topLevelRange(state: EditorState): { from: number; to: number } | null {
  const { doc, selection } = state
  if (!doc.childCount) return null
  const $pos = doc.resolve(Math.min(Math.max(selection.head, 0), doc.content.size))
  if ($pos.depth === 0) {
    // Between blocks (a node selection of a block, gap cursor): the node after.
    const index = Math.min($pos.index(0), doc.childCount - 1)
    let from = 0
    for (let i = 0; i < index; i++) from += doc.child(i).nodeSize
    return { from, to: from + doc.child(index).nodeSize }
  }
  return { from: $pos.before(1), to: $pos.after(1) }
}

/** The decoration plugin; exported for tests. */
export function focusBlockPlugin(): Plugin {
  return new Plugin({
    key,
    props: {
      decorations(state) {
        const r = topLevelRange(state)
        return r ? DecorationSet.create(state.doc, [Decoration.node(r.from, r.to, { class: 'tt-focus-block' })]) : DecorationSet.empty
      },
    },
  })
}

export const FocusBlock = Extension.create({
  name: 'focusBlock',
  addProseMirrorPlugins() {
    return [focusBlockPlugin()]
  },
})
