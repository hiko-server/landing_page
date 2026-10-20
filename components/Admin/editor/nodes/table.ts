import { Extension, Node, mergeAttributes, type CommandProps } from '@tiptap/core'
import type { Node as PMNode, NodeType, Schema } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import {
  addColumnAfter,
  cellAround,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  CellSelection,
  deleteColumn,
  deleteRow,
  deleteTable,
  goToNextCell,
  isInTable,
  moveTableRow,
  selectedRect,
  tableEditing,
  TableMap,
} from '@tiptap/pm/tables'

/**
 * GFM tables in the visual editor, built directly on prosemirror-tables
 * (shipped inside @tiptap/pm — no extra package):
 *
 *   - cells hold inline content only (text, marks, links, inline code):
 *     exactly what a GFM cell can hold, so nothing typed in a cell is lost
 *     when the table is written as Markdown;
 *   - the first row is the header row (`tableHeader` cells) or, with the
 *     header row turned off, a normal row (written under an empty header);
 *     no other row can hold header cells and cells never span (GFM has
 *     neither) — a normaliser enforces both after every change;
 *   - each column has one alignment (left / center / right / none), kept on
 *     every cell of the column and written to the delimiter row.
 *
 * Keys: Tab / Shift+Tab next / previous cell (Tab in the last cell adds a
 * row), Enter the cell below (a new row at the end — a GFM cell has no line
 * breaks), arrows move between cells (prosemirror-tables), Alt+↑ / Alt+↓
 * move the row (./blockMove), Backspace with every cell selected deletes
 * the table.
 */

export type ColumnAlign = 'left' | 'center' | 'right' | null

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    gfmTable: {
      /** A table of `rows` × `cols` (the first row the header row) at the selection. */
      insertTable: (options?: { rows?: number; cols?: number }) => ReturnType
      addRowBefore: () => ReturnType
      addRowAfter: () => ReturnType
      addColumnBefore: () => ReturnType
      addColumnAfter: () => ReturnType
      deleteRow: () => ReturnType
      deleteColumn: () => ReturnType
      deleteTable: () => ReturnType
      /** Header row on / off (the first row). */
      toggleHeaderRow: () => ReturnType
      /** Alignment of the column(s) holding the selection. */
      setColumnAlign: (align: ColumnAlign) => ReturnType
      goToNextCell: () => ReturnType
      goToPreviousCell: () => ReturnType
    }
  }
}

const ROLES: Record<string, string> = { table: 'table', tableRow: 'row', tableCell: 'cell', tableHeader: 'header_cell' }

const alignAttr = {
  default: null,
  parseHTML: (el: HTMLElement) => {
    const v = (el.getAttribute('align') || el.style.textAlign || '').toLowerCase()
    return v === 'left' || v === 'center' || v === 'right' ? v : null
  },
  renderHTML: (attrs: { align?: ColumnAlign }) => (attrs.align ? { 'data-align': attrs.align, style: `text-align: ${attrs.align}` } : {}),
}

/** prosemirror-tables reads these; GFM cells never span, so they are always 1 / null. */
const spanAttrs = {
  colspan: { default: 1, parseHTML: () => 1, renderHTML: () => ({}) },
  rowspan: { default: 1, parseHTML: () => 1, renderHTML: () => ({}) },
  colwidth: { default: null, parseHTML: () => null, renderHTML: () => ({}) },
}

export const TableCell = Node.create({
  name: 'tableCell',
  content: 'inline*',
  isolating: true,
  addAttributes() {
    return { align: alignAttr, ...spanAttrs }
  },
  parseHTML() {
    return [{ tag: 'td' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['td', mergeAttributes(HTMLAttributes), 0]
  },
})

export const TableHeader = Node.create({
  name: 'tableHeader',
  content: 'inline*',
  isolating: true,
  addAttributes() {
    return { align: alignAttr, ...spanAttrs }
  },
  parseHTML() {
    return [{ tag: 'th' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['th', mergeAttributes({ scope: 'col' }, HTMLAttributes), 0]
  },
})

export const TableRow = Node.create({
  name: 'tableRow',
  content: '(tableCell | tableHeader)*',
  parseHTML() {
    return [{ tag: 'tr' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['tr', mergeAttributes(HTMLAttributes), 0]
  },
})

function cellTypes(schema: Schema): { cell: NodeType; header: NodeType; row: NodeType; table: NodeType } {
  return { cell: schema.nodes.tableCell, header: schema.nodes.tableHeader, row: schema.nodes.tableRow, table: schema.nodes.table }
}

/** A rows × cols table, the first row the header row. */
export function createTable(schema: Schema, rows = 3, cols = 3): PMNode {
  const t = cellTypes(schema)
  const r = Math.max(1, Math.min(rows, 50))
  const c = Math.max(1, Math.min(cols, 20))
  const rowNodes: PMNode[] = []
  for (let i = 0; i < r; i++) {
    const type = i === 0 ? t.header : t.cell
    rowNodes.push(t.row.create(null, Array.from({ length: c }, () => type.create())))
  }
  return t.table.create(null, rowNodes)
}

/**
 * GFM shape after any change: header cells only in the first row (all or
 * none of it), no spans, one alignment per column (the first row's).
 */
export function normalizeTables(state: EditorState): Transaction | null {
  const t = cellTypes(state.schema)
  if (!t.table) return null
  let tr: Transaction | null = null
  state.doc.descendants((table, tablePos) => {
    if (table.type !== t.table) return true
    let firstHeader = false
    let pos = tablePos + 1
    table.forEach((row, _o, r) => {
      let cellPos = pos + 1
      if (r === 0) firstHeader = row.childCount > 0 && row.firstChild?.type === t.header
      row.forEach((cell, _co, c) => {
        const wantType = r === 0 && firstHeader ? t.header : t.cell
        const align = (table.firstChild?.maybeChild(c)?.attrs.align as ColumnAlign) ?? null
        const attrs = { ...cell.attrs, colspan: 1, rowspan: 1, colwidth: null, align: r === 0 ? (cell.attrs.align ?? null) : align }
        const changed =
          cell.type !== wantType || cell.attrs.colspan !== 1 || cell.attrs.rowspan !== 1 || cell.attrs.colwidth !== null || (cell.attrs.align ?? null) !== attrs.align
        if (changed) {
          tr = tr || state.tr
          tr.setNodeMarkup(tr.mapping.map(cellPos), wantType, attrs)
        }
        cellPos += cell.nodeSize
      })
      pos += row.nodeSize
    })
    return false
  })
  return tr
}

const normalizeKey = new PluginKey('gfmTableNormalize')

/** Columns covered by the selection, as indexes into the table map. */
function selectedColumns(state: EditorState): { table: PMNode; tableStart: number; map: TableMap; left: number; right: number } | null {
  if (!isInTable(state)) return null
  const rect = selectedRect(state)
  return { table: rect.table, tableStart: rect.tableStart, map: rect.map, left: rect.left, right: rect.right }
}

/** The command props' state and dispatch, run through a prosemirror command. */
function pm(command: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean) {
  return () =>
    ({ state, dispatch }: CommandProps) =>
      command(state, dispatch)
}

export const Table = Node.create({
  name: 'table',
  group: 'block',
  content: 'tableRow+',
  isolating: true,
  draggable: true,
  parseHTML() {
    return [{ tag: 'table' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { class: 'tt-table-wrap' }, ['table', mergeAttributes({ class: 'tt-table' }, HTMLAttributes), ['tbody', 0]]]
  },

  addCommands() {
    return {
      insertTable:
        ({ rows = 3, cols = 3 } = {}) =>
        ({ tr, dispatch, state }) => {
          const node = createTable(state.schema, rows, cols)
          if (dispatch) {
            // As @tiptap/extension-table: the caret lands in the first header cell.
            const offset = tr.selection.from + 1
            tr.replaceSelectionWith(node).scrollIntoView().setSelection(TextSelection.near(tr.doc.resolve(offset)))
          }
          return true
        },
      // The header row stays the first row: nothing goes above it.
      addRowBefore:
        () =>
        ({ state, dispatch }) => {
          if (!isInTable(state)) return false
          const rect = selectedRect(state)
          if (rect.top === 0 && rect.table.firstChild?.firstChild?.type === state.schema.nodes.tableHeader) return false
          return addRowBefore(state, dispatch)
        },
      addRowAfter: pm(addRowAfter),
      addColumnBefore: pm(addColumnBefore),
      addColumnAfter: pm(addColumnAfter),
      deleteRow: pm(deleteRow),
      deleteColumn: pm(deleteColumn),
      deleteTable: pm(deleteTable),
      toggleHeaderRow:
        () =>
        ({ state, dispatch }) => {
          if (!isInTable(state)) return false
          if (dispatch) {
            const { table, tableStart } = selectedRect(state)
            const t = cellTypes(state.schema)
            const first = table.firstChild
            if (!first) return false
            const toHeader = first.firstChild?.type !== t.header
            const tr = state.tr
            let pos = tableStart + 1
            first.forEach((cell) => {
              tr.setNodeMarkup(pos, toHeader ? t.header : t.cell, cell.attrs)
              pos += cell.nodeSize
            })
            dispatch(tr)
          }
          return true
        },
      setColumnAlign:
        (align: ColumnAlign) =>
        ({ state, dispatch }) => {
          const sel = selectedColumns(state)
          if (!sel) return false
          if (dispatch) {
            const tr = state.tr
            const seen = new Set<number>()
            for (let row = 0; row < sel.map.height; row++) {
              for (let col = sel.left; col < sel.right; col++) {
                const at = sel.map.map[row * sel.map.width + col]
                if (seen.has(at)) continue
                seen.add(at)
                const cell = sel.table.nodeAt(at)
                if (cell) tr.setNodeMarkup(sel.tableStart + at, undefined, { ...cell.attrs, align })
              }
            }
            dispatch(tr)
          }
          return true
        },
      goToNextCell: pm(goToNextCell(1)),
      goToPreviousCell: pm(goToNextCell(-1)),
    }
  },

  addKeyboardShortcuts() {
    // Backspace / Delete with the whole table selected removes it.
    const deleteAll = () => {
      const { selection } = this.editor.state
      if (!(selection instanceof CellSelection) || !selection.isRowSelection() || !selection.isColSelection()) return false
      return this.editor.commands.deleteTable()
    }
    return {
      Tab: () => {
        if (!isInTable(this.editor.state)) return false
        if (this.editor.commands.goToNextCell()) return true
        return this.editor.chain().addRowAfter().goToNextCell().run()
      },
      'Shift-Tab': () => (isInTable(this.editor.state) ? this.editor.commands.goToPreviousCell() : false),
      Enter: () => {
        const { state } = this.editor
        if (!isInTable(state) || state.selection instanceof CellSelection) return false
        const rect = selectedRect(state)
        const below = rect.top + 1
        if (below >= rect.map.height) {
          if (!this.editor.commands.addRowAfter()) return false
        }
        const next = this.editor.state
        const r2 = selectedRect(next)
        const cellOffset = r2.map.map[Math.min(below, r2.map.height - 1) * r2.map.width + r2.left]
        const cellPos = r2.tableStart + cellOffset
        const cell = next.doc.nodeAt(cellPos)
        if (!cell) return true
        this.editor.view.dispatch(next.tr.setSelection(TextSelection.create(next.doc, cellPos + 1 + cell.content.size)).scrollIntoView())
        return true
      },
      // A GFM cell cannot hold a line break.
      'Shift-Enter': () => isInTable(this.editor.state),
      'Mod-Enter': () => isInTable(this.editor.state),
      Backspace: deleteAll,
      'Mod-Backspace': deleteAll,
      Delete: deleteAll,
      'Mod-Delete': deleteAll,
    }
  },

  addProseMirrorPlugins() {
    return [
      tableEditing({ allowTableNodeSelection: false }),
      new Plugin({
        key: normalizeKey,
        appendTransaction: (trs, _old, state) => (trs.some((tr) => tr.docChanged) ? normalizeTables(state) : null),
      }),
    ]
  },
})

/** Tells prosemirror-tables which node plays which part. */
export const TableRoles = Extension.create({
  name: 'tableRoles',
  extendNodeSchema(extension) {
    const role = ROLES[extension.name]
    return role ? { tableRole: role } : {}
  },
})

/** Move the row holding the selection up (-1) or down (+1); the header row stays first. The caret moves with the row. */
export function moveRowCommand(dir: -1 | 1) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
    if (!isInTable(state)) return false
    const rect = selectedRect(state)
    const from = rect.top
    const to = from + dir
    const headerRow = rect.table.firstChild?.firstChild?.type === state.schema.nodes.tableHeader
    const min = headerRow ? 1 : 0
    if (from < min || to < min || to >= rect.map.height) return false
    if (state.selection instanceof CellSelection) return moveTableRow({ from, to, select: true })(state, dispatch)
    const $cell = cellAround(state.selection.$from)
    const offset = $cell ? state.selection.from - ($cell.pos + 1) : 0
    const col = rect.left
    return moveTableRow({ from, to, select: false })(
      state,
      dispatch &&
        ((tr: Transaction) => {
          const table = tr.doc.nodeAt(rect.tableStart - 1)
          if (table) {
            const map = TableMap.get(table)
            const cellPos = rect.tableStart + map.positionAt(to, col, table)
            const cell = tr.doc.nodeAt(cellPos)
            if (cell) tr.setSelection(TextSelection.create(tr.doc, cellPos + 1 + Math.max(0, Math.min(offset, cell.content.size))))
          }
          dispatch(tr.scrollIntoView())
        }),
    )
  }
}

export { CellSelection }
