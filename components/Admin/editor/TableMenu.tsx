import React, { useCallback, useEffect, useRef } from 'react'
import { Box, Flex, IconButton, Tooltip } from '@chakra-ui/react'
import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { isInTable, selectedRect } from '@tiptap/pm/tables'
import {
  TbAlignCenter,
  TbAlignLeft,
  TbAlignRight,
  TbColumnInsertLeft,
  TbColumnInsertRight,
  TbColumnRemove,
  TbRowInsertBottom,
  TbRowInsertTop,
  TbRowRemove,
  TbTableOff,
  TbTableRow,
} from 'react-icons/tb'
import type { ColumnAlign } from './nodes/table'

/**
 * The table toolbar of the visual editor: shown above the table while the
 * selection is in it. Rows (above / below / delete),
 * columns (left / right / delete), the column's alignment (written to the
 * GFM delimiter row), the header row on / off, delete the table.
 *
 * Keyboard: Alt+F10 moves focus into the toolbar, ← / → move between its
 * buttons, Esc returns to the cell (the cell keys themselves are in
 * nodes/table.ts).
 */

export const TABLE_MENU_KEY = 'tableMenu'

type TableState = {
  inHeaderRow: boolean
  headerRow: boolean
  align: ColumnAlign
  rows: number
  cols: number
}

/** What the toolbar shows for the current selection (null outside a table). */
export function tableState(editor: Editor): TableState | null {
  const { state } = editor
  if (!isInTable(state)) return null
  const rect = selectedRect(state)
  const first = rect.table.firstChild
  const headerRow = first?.firstChild?.type.name === 'tableHeader'
  const cell = rect.table.nodeAt(rect.map.map[rect.left])
  const align = (cell?.attrs.align as ColumnAlign) ?? null
  return { inHeaderRow: rect.top === 0 && headerRow, headerRow, align, rows: rect.map.height, cols: rect.map.width }
}

function ToolButton({ label, icon, onClick, active, disabled }: { label: string; icon: React.ReactElement; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <Tooltip label={label} openDelay={350} placement="top" hasArrow>
      <IconButton
        aria-label={label}
        aria-pressed={active}
        icon={icon}
        size="sm"
        minW="30px"
        h="30px"
        variant="ghost"
        isDisabled={disabled}
        color={active ? 'accent.text' : 'page.fg-secondary'}
        bg={active ? 'var(--accent-soft)' : undefined}
        _hover={{ bg: 'page.bg-overlay', color: 'page.fg' }}
        onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
        onClick={onClick}
        tabIndex={-1}
      />
    </Tooltip>
  )
}

const Sep = () => <Box w="1px" alignSelf="stretch" my={1} bg="page.border" aria-hidden />

export default function TableMenu({ editor, announce }: { editor: Editor; announce: (message: string) => void }) {
  const barRef = useRef<HTMLDivElement>(null)
  const s = tableState(editor)

  const run = (fn: () => boolean, message: string) => {
    if (fn()) announce(message)
  }

  // The table's visible box: the toolbar sits just above the table (below it when there is no room).
  const anchor = useCallback(() => {
    const { state, view } = editor
    if (!isInTable(state)) return null
    try {
      const rect = selectedRect(state)
      const wrap = view.nodeDOM(rect.tableStart - 1) as HTMLElement | null
      const t = wrap?.getBoundingClientRect()
      if (!t) return null
      const box = { x: t.left, y: t.top, width: t.width, height: t.height }
      return {
        getBoundingClientRect: () => ({ ...box, top: box.y, left: box.x, right: box.x + box.width, bottom: box.y + box.height, toJSON: () => box }),
        getClientRects: () => [] as unknown as DOMRectList,
      }
    } catch {
      return null
    }
  }, [editor])

  // Alt+F10 from a cell focuses the toolbar.
  useEffect(() => {
    const dom = editor.view.dom
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F10' && e.altKey && isInTable(editor.state)) {
        const first = barRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')
        if (first) {
          e.preventDefault()
          // A keyboard move: show the ring even when the caret got into the
          // cell by mouse (Chrome does not count Alt+F10 as keyboard use).
          first.focus({ focusVisible: true } as FocusOptions)
        }
      }
    }
    dom.addEventListener('keydown', onKey)
    return () => dom.removeEventListener('keydown', onKey)
  }, [editor])

  const onBarKey = (e: React.KeyboardEvent) => {
    const buttons = Array.from(barRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') || [])
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const next = buttons[(i + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length]
      next?.focus()
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      ;(e.key === 'Home' ? buttons[0] : buttons[buttons.length - 1])?.focus()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      editor.commands.focus()
    }
  }

  const c = editor.commands
  const align = (a: ColumnAlign, label: string) =>
    run(() => editor.chain().focus().setColumnAlign(a).run(), label)

  return (
    <BubbleMenu
      editor={editor}
      pluginKey={TABLE_MENU_KEY}
      updateDelay={60}
      getReferencedVirtualElement={anchor}
      options={{ placement: 'top-start', offset: 6, flip: true, shift: { padding: 8 } }}
      shouldShow={({ editor: ed, view, state, element }) => {
        if (!ed.isEditable || !isInTable(state)) return false
        return view.hasFocus() || element.contains(document.activeElement)
      }}
    >
      <Flex
        ref={barRef}
        role="toolbar"
        aria-label="Table (Alt+F10)"
        onKeyDown={onBarKey}
        align="center"
        gap={0.5}
        p={1}
        bg="page.bg-elevated"
        border="1px solid"
        borderColor="page.border-strong"
        borderRadius="lg"
        boxShadow="0 10px 28px rgba(0,0,0,0.18)"
        // On a phone the eleven buttons wrap onto a second row: a sideways
        // scroller would clip "Delete table" and be a scroll region with no
        // tab stop of its own (its buttons are reached with ← →).
        maxW="calc(100vw - 16px)"
        flexWrap="wrap"
        rowGap={0.5}
        sx={{
          '@keyframes tableMenuIn': { from: { opacity: 0, transform: 'translateY(2px)' }, to: { opacity: 1, transform: 'none' } },
          animation: 'tableMenuIn 120ms cubic-bezier(0.22, 1, 0.36, 1)',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          // The buttons never take focus from a pointer (tabIndex -1, mousedown
          // prevented): any focus is the keyboard's (Alt+F10, ← →, Home, End),
          // so the site's ring shows on :focus, not only :focus-visible.
          '& button:focus, & button:focus-visible': { outline: '2px solid var(--accent)', outlineOffset: '2px', boxShadow: '0 0 0 2px var(--accent-ring)' },
        }}
      >
        <ToolButton label="Row above" icon={<TbRowInsertTop size={16} />} disabled={!s || s.inHeaderRow} onClick={() => run(() => c.addRowBefore(), 'Row added above.')} />
        <ToolButton label="Row below (Enter in the last row)" icon={<TbRowInsertBottom size={16} />} onClick={() => run(() => c.addRowAfter(), 'Row added below.')} />
        <ToolButton label="Delete row" icon={<TbRowRemove size={16} />} disabled={!s || s.rows < 2} onClick={() => run(() => c.deleteRow(), 'Row deleted.')} />
        <Sep />
        <ToolButton label="Column left" icon={<TbColumnInsertLeft size={16} />} onClick={() => run(() => c.addColumnBefore(), 'Column added on the left.')} />
        <ToolButton label="Column right" icon={<TbColumnInsertRight size={16} />} onClick={() => run(() => c.addColumnAfter(), 'Column added on the right.')} />
        <ToolButton label="Delete column" icon={<TbColumnRemove size={16} />} disabled={!s || s.cols < 2} onClick={() => run(() => c.deleteColumn(), 'Column deleted.')} />
        <Sep />
        <ToolButton label="Align column left" icon={<TbAlignLeft size={16} />} active={s?.align === 'left'} onClick={() => align(s?.align === 'left' ? null : 'left', s?.align === 'left' ? 'Column alignment cleared.' : 'Column aligned left.')} />
        <ToolButton label="Center column" icon={<TbAlignCenter size={16} />} active={s?.align === 'center'} onClick={() => align(s?.align === 'center' ? null : 'center', s?.align === 'center' ? 'Column alignment cleared.' : 'Column centered.')} />
        <ToolButton label="Align column right" icon={<TbAlignRight size={16} />} active={s?.align === 'right'} onClick={() => align(s?.align === 'right' ? null : 'right', s?.align === 'right' ? 'Column alignment cleared.' : 'Column aligned right.')} />
        <Sep />
        <ToolButton
          label={s?.headerRow ? 'Header row: on' : 'Header row: off'}
          icon={<TbTableRow size={16} />}
          active={!!s?.headerRow}
          onClick={() => run(() => c.toggleHeaderRow(), s?.headerRow ? 'Header row off.' : 'Header row on.')}
        />
        <ToolButton label="Delete table" icon={<TbTableOff size={16} />} onClick={() => run(() => editor.chain().focus().deleteTable().run(), 'Table deleted.')} />
      </Flex>
    </BubbleMenu>
  )
}
