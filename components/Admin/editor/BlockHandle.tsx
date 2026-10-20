import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Box } from '@chakra-ui/react'
import type { Editor } from '@tiptap/react'
import { Fragment, Slice } from '@tiptap/pm/model'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { TbArrowDown, TbArrowUp, TbCopy, TbGripVertical, TbTrash } from 'react-icons/tb'
import { moveBlockAt } from './nodes/blockMove'
import { sliceMarkdown } from './markdown/bridge'
import PopMenu from './PopMenu'

/**
 * Block handle of the visual editor (⋮⋮ in the left gutter of the block
 * under the pointer, or of the block with the caret on touch screens and
 * while typing):
 *
 *   - drag it to move the block (ProseMirror's own drop: the drop cursor
 *     shows where it lands; Alt / Ctrl while dropping copies);
 *   - click or tap it for Move up / Move down / Duplicate / Delete — the
 *     single-pointer alternative to dragging (WCAG 2.5.7). From the
 *     keyboard: Alt+↑ / Alt+↓ (nodes/blockMove), Delete on a selected block.
 *
 * Only top-level blocks get a handle (a list, a table, a callout moves
 * whole; their items and rows move with Alt+↑ / ↓).
 */

type Target = { pos: number; top: number; left: number; index: number; count: number }

const HANDLE = 24

const isMac = () => typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent)

const fine = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches

export default function BlockHandle({ editor, surface, announce }: { editor: Editor; surface: React.RefObject<HTMLElement>; announce: (m: string) => void }) {
  const [target, setTarget] = useState<Target | null>(null)
  const [visible, setVisible] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const targetRef = useRef<Target | null>(null)
  targetRef.current = target
  const menuRef = useRef(false)
  menuRef.current = menuOpen
  const hideTimer = useRef<number | null>(null)
  const frame = useRef<number | null>(null)

  /** The top-level block at viewport y (or the caret's), positioned in the surface. */
  const locate = useCallback(
    (y: number | null): Target | null => {
      const host = surface.current
      if (!host || editor.isDestroyed) return null
      const { view, state } = editor
      const hostRect = host.getBoundingClientRect()
      let found: Target | null = null
      const count = state.doc.childCount
      let index = 0
      state.doc.forEach((node, offset) => {
        if (found) return
        const dom = view.nodeDOM(offset) as HTMLElement | null
        if (dom && dom.nodeType === 1) {
          const r = dom.getBoundingClientRect()
          const hit = y === null ? state.selection.from >= offset && state.selection.from <= offset + node.nodeSize : y >= r.top - 6 && y <= r.bottom + 6
          if (hit) {
            const style = window.getComputedStyle(dom)
            const lh = Number.parseFloat(style.lineHeight)
            const firstLine = Number.isFinite(lh) && node.isTextblock ? Math.max(0, (lh - HANDLE) / 2) : 2
            // In the gutter left of the block (a full-width figure: at the surface's edge).
            const left = Math.max(2, r.left - hostRect.left - HANDLE - 6)
            found = { pos: offset, top: r.top - hostRect.top + firstLine, left, index, count }
          }
        }
        index++
      })
      return found
    },
    [editor, surface],
  )

  const show = useCallback((t: Target | null) => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = null
    if (t) {
      setTarget(t)
      setVisible(true)
    }
  }, [])

  const scheduleHide = useCallback(() => {
    if (menuRef.current) return
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setVisible(false), 400)
  }, [])

  // Pointer: the block under it.
  useEffect(() => {
    const host = surface.current
    if (!host) return
    const onMove = (e: MouseEvent) => {
      if (menuRef.current || !fine()) return
      if (frame.current) cancelAnimationFrame(frame.current)
      const y = e.clientY
      frame.current = requestAnimationFrame(() => {
        const t = locate(y)
        if (t) show(t)
        else scheduleHide()
      })
    }
    const onLeave = () => scheduleHide()
    host.addEventListener('mousemove', onMove)
    host.addEventListener('mouseleave', onLeave)
    return () => {
      host.removeEventListener('mousemove', onMove)
      host.removeEventListener('mouseleave', onLeave)
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [surface, locate, show, scheduleHide])

  // Caret: on touch screens (no hover) and after typing, the block being edited.
  useEffect(() => {
    const follow = () => {
      if (menuRef.current) return
      if (!editor.isFocused) return
      const t = locate(null)
      if (!t) return
      if (!fine() || !targetRef.current || targetRef.current.pos !== t.pos || targetRef.current.top !== t.top || targetRef.current.left !== t.left) show(t)
    }
    const blur = () => {
      if (!fine()) scheduleHide()
    }
    editor.on('selectionUpdate', follow)
    editor.on('update', follow)
    editor.on('focus', follow)
    editor.on('blur', blur)
    return () => {
      editor.off('selectionUpdate', follow)
      editor.off('update', follow)
      editor.off('focus', follow)
      editor.off('blur', blur)
    }
  }, [editor, locate, show, scheduleHide])

  useEffect(
    () => () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
    },
    [],
  )

  const current = () => {
    const t = targetRef.current
    if (!t) return null
    const node = editor.state.doc.nodeAt(t.pos)
    return node ? { t, node } : null
  }

  const onDragStart = (e: React.DragEvent) => {
    const cur = current()
    if (!cur || !e.dataTransfer) return
    const { view, state } = editor
    const sel = NodeSelection.create(state.doc, cur.t.pos)
    view.dispatch(state.tr.setSelection(sel))
    const slice = new Slice(Fragment.from(cur.node), 0, 0)
    // ProseMirror's own drop handler moves it (and deletes the original through `node`).
    const dragView = view as unknown as { dragging: unknown }
    dragView.dragging = { slice, move: true, node: sel }
    e.dataTransfer.effectAllowed = 'copyMove'
    e.dataTransfer.setData('text/plain', sliceMarkdown(slice.content))
    const dom = view.nodeDOM(cur.t.pos) as HTMLElement | null
    if (dom && dom.nodeType === 1) e.dataTransfer.setDragImage(dom, 0, 0)
  }

  const onDragEnd = () => {
    const view = editor.view as unknown as { dragging: unknown }
    view.dragging = null
    setVisible(false)
  }

  const move = (dir: -1 | 1) => {
    const cur = current()
    if (!cur) return
    const { state, view } = editor
    const block = { pos: cur.t.pos, node: cur.node, depth: 0, index: cur.t.index, count: state.doc.childCount }
    const tr = moveBlockAt(state, block, dir)
    if (!tr) return
    view.dispatch(tr)
    announce(dir < 0 ? 'Block moved up.' : 'Block moved down.')
    editor.commands.focus()
  }

  const duplicate = () => {
    const cur = current()
    if (!cur) return
    const { state, view } = editor
    const after = cur.t.pos + cur.node.nodeSize
    const tr = state.tr.insert(after, cur.node.copy(cur.node.content))
    tr.setSelection(cur.node.isTextblock ? TextSelection.create(tr.doc, after + 1 + cur.node.content.size) : NodeSelection.create(tr.doc, after))
    view.dispatch(tr.scrollIntoView())
    announce('Block duplicated.')
    editor.commands.focus()
  }

  const remove = () => {
    const cur = current()
    if (!cur) return
    const { state, view } = editor
    const tr = state.tr.delete(cur.t.pos, cur.t.pos + cur.node.nodeSize)
    const at = Math.min(cur.t.pos, tr.doc.content.size)
    tr.setSelection(TextSelection.near(tr.doc.resolve(at)))
    view.dispatch(tr.scrollIntoView())
    setVisible(false)
    announce('Block deleted.')
    editor.commands.focus()
  }

  if (!target) return null
  const { top, left } = target
  const shown = visible || menuOpen

  return (
    <PopMenu
      label="Block actions"
      placement="bottom-start"
      onOpenChange={(o) => {
        setMenuOpen(o)
        if (!o) scheduleHide()
      }}
      restoreFocus={() => editor.commands.focus()}
      items={[
        { kind: 'item', key: 'up', label: 'Move up', hint: isMac() ? '⌥↑' : 'Alt+↑', icon: <TbArrowUp size={14} />, disabled: target.index === 0, onSelect: () => move(-1) },
        { kind: 'item', key: 'down', label: 'Move down', hint: isMac() ? '⌥↓' : 'Alt+↓', icon: <TbArrowDown size={14} />, disabled: target.index >= target.count - 1, onSelect: () => move(1) },
        { kind: 'item', key: 'dup', label: 'Duplicate', icon: <TbCopy size={14} />, onSelect: duplicate },
        { kind: 'divider', key: 'sep' },
        { kind: 'item', key: 'del', label: 'Delete', icon: <TbTrash size={14} />, danger: true, onSelect: remove },
      ]}
      trigger={(props) => (
        <Box
          {...props}
          as="button"
          type="button"
          tabIndex={-1}
          className="tt-block-handle"
          aria-label="Block actions — drag to move"
          title="Drag to move · click for actions"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onMouseEnter={() => show(targetRef.current)}
          onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
          position="absolute"
          top={`${top}px`}
          left={`${left}px`}
          w={`${HANDLE}px`}
          h={`${HANDLE}px`}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={0}
          border={0}
          borderRadius="md"
          color="page.fg-secondary"
          cursor="grab"
          opacity={shown ? 1 : 0}
          pointerEvents={shown ? 'auto' : 'none'}
          bg={menuOpen ? 'page.bg-overlay' : 'transparent'}
          _hover={{ bg: 'page.bg-overlay', color: 'page.fg' }}
          _active={{ cursor: 'grabbing' }}
          zIndex={2}
          sx={{
            transition: 'opacity 120ms ease, top 80ms ease',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            '@media (hover: none)': { w: '32px', h: '32px' },
          }}
        >
          <TbGripVertical size={16} aria-hidden />
        </Box>
      )}
    />
  )
}
