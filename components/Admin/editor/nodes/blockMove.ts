import { Extension } from '@tiptap/core'
import { Fragment, type Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { isInTable } from '@tiptap/pm/tables'
import { moveRowCommand } from './table'

/**
 * Reordering blocks from the keyboard (Alt+↑ / Alt+↓) and from the block
 * handle's menu (views/BlockHandle):
 *
 *   - in a table, the row moves (the header row stays first);
 *   - in a list, the list item moves among its siblings;
 *   - anywhere else, the top-level block moves (a callout or quote moves
 *     whole, with everything in it).
 *
 * The selection moves with the block. At the first / last position the
 * command does nothing (and the key keeps its usual meaning).
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockMove: {
      moveBlockUp: () => ReturnType
      moveBlockDown: () => ReturnType
    }
  }
}

export type MovableBlock = {
  /** Position before the block. */
  pos: number
  node: PMNode
  /** Depth of the block's parent. */
  depth: number
  index: number
  /** Siblings in the parent. */
  count: number
}

/** The block Alt+↑ / Alt+↓ would move for the current selection (rows are handled by the table). */
export function movableBlock(state: EditorState): MovableBlock | null {
  const sel = state.selection
  if (sel instanceof NodeSelection && sel.$from.depth === 0) {
    const $pos = sel.$from
    return { pos: sel.from, node: sel.node, depth: 0, index: $pos.index(0), count: state.doc.childCount }
  }
  const $from = sel.$from
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === 'listItem') {
      return { pos: $from.before(d), node, depth: d - 1, index: $from.index(d - 1), count: $from.node(d - 1).childCount }
    }
  }
  if ($from.depth < 1) return null
  return { pos: $from.before(1), node: $from.node(1), depth: 0, index: $from.index(0), count: state.doc.childCount }
}

/** Move the block at `pos` (a child of the document, or a list item) one place up or down. */
export function moveBlockAt(state: EditorState, block: MovableBlock, dir: -1 | 1): Transaction | null {
  const target = block.index + dir
  if (target < 0 || target >= block.count) return null
  const $pos = state.doc.resolve(block.pos)
  const parent = $pos.node(block.depth)
  const sibling = parent.child(target)
  const tr = state.tr
  const sel = state.selection
  const end = block.pos + block.node.nodeSize
  const inside = sel.from >= block.pos && sel.to <= end
  const offsetInBlock = sel.from - block.pos
  const nodeSel = sel instanceof NodeSelection && sel.from === block.pos
  let newPos: number
  if (dir === -1) {
    const from = block.pos - sibling.nodeSize
    tr.replaceWith(from, end, Fragment.from([block.node, sibling]))
    newPos = from
  } else {
    tr.replaceWith(block.pos, end + sibling.nodeSize, Fragment.from([sibling, block.node]))
    newPos = block.pos + sibling.nodeSize
  }
  if (nodeSel || (!inside && NodeSelection.isSelectable(block.node) && block.node.isAtom)) tr.setSelection(NodeSelection.create(tr.doc, newPos))
  else if (!inside) tr.setSelection(TextSelection.near(tr.doc.resolve(newPos + 1)))
  else {
    const at = Math.min(newPos + offsetInBlock, tr.doc.content.size)
    const head = Math.min(at + Math.max(0, sel.to - sel.from), newPos + block.node.nodeSize - 1)
    tr.setSelection(TextSelection.between(tr.doc.resolve(at), tr.doc.resolve(head)))
  }
  return tr.scrollIntoView()
}

function moveCommand(dir: -1 | 1) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
    // In a table the row moves, and only within the table.
    if (isInTable(state)) return moveRowCommand(dir)(state, dispatch)
    const block = movableBlock(state)
    if (!block) return false
    const tr = moveBlockAt(state, block, dir)
    if (!tr) return false
    if (dispatch) dispatch(tr)
    return true
  }
}

export type BlockMoveOptions = {
  /** Told what moved (RichEditor: its polite live region). */
  onMove: ((message: string) => void) | null
}

export const BlockMove = Extension.create<BlockMoveOptions>({
  name: 'blockMove',

  addOptions() {
    return { onMove: null }
  },

  addCommands() {
    const announced = (dir: -1 | 1) => (state: EditorState, dispatch?: (tr: Transaction) => void) => {
      const what = isInTable(state) ? 'Row' : movableBlock(state)?.node.type.name === 'listItem' ? 'Item' : 'Block'
      const ok = moveCommand(dir)(state, dispatch)
      if (ok && dispatch) this.options.onMove?.(`${what} moved ${dir < 0 ? 'up' : 'down'}.`)
      return ok
    }
    return {
      moveBlockUp:
        () =>
        ({ state, dispatch }) =>
          announced(-1)(state, dispatch),
      moveBlockDown:
        () =>
        ({ state, dispatch }) =>
          announced(1)(state, dispatch),
    }
  },

  addKeyboardShortcuts() {
    return {
      'Alt-ArrowUp': () => this.editor.commands.moveBlockUp(),
      'Alt-ArrowDown': () => this.editor.commands.moveBlockDown(),
    }
  },
})
