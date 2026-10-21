import { useEffect, useId, useRef, useState } from 'react'
import { Box, Button, Flex, Popover, PopoverAnchor, PopoverContent, Portal, Text, Textarea } from '@chakra-ui/react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { describeIsland, readBlockIsland, readInlineIsland, type IslandEdit } from '../markdown/islands'
import { MONO, isMacPlatform, primaryButtonProps } from '../../shell/ui'
import { tabStop, useEditorUi } from './editorUi'

/**
 * MDX islands in the visual editor: source the editor keeps exactly as
 * written (JSX components, notes, expressions, import / export, footnotes,
 * reference links). Each shows its source with a short label; "Edit" (or
 * Enter while it is selected) opens the source in place. ⌘↵ / Ctrl+↵ or
 * "Done" applies — the source is read again, so invalid MDX is reported
 * with its line, and source that became plain Markdown turns into ordinary
 * content. Esc cancels.
 */

type Props = NodeViewProps & { inline?: boolean }

function useIslandEditor({ node, editor, getPos, inline }: Props) {
  const ui = useEditorUi()
  const source = String(node.attrs.source || '')
  // A new, empty block ("/mdx") opens straight into its source.
  const [editing, setEditing] = useState(() => !inline && !source.trim())
  const [draft, setDraft] = useState(source)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!editing) setDraft(source)
  }, [source, editing])

  const open = () => {
    setDraft(source)
    setError('')
    setEditing(true)
  }
  const close = (refocus: boolean, removeIfEmpty = true) => {
    setEditing(false)
    setError('')
    const pos = typeof getPos === 'function' ? getPos() : null
    // Leaving a block that never got any source removes it.
    if (removeIfEmpty && !source.trim() && typeof pos === 'number') {
      const current = editor.state.doc.nodeAt(pos)
      if (current) editor.view.dispatch(editor.state.tr.delete(pos, pos + current.nodeSize))
      if (refocus) requestAnimationFrame(() => editor.commands.focus())
      return
    }
    if (!refocus) return
    requestAnimationFrame(() => {
      if (typeof pos === 'number' && editor.state.doc.nodeAt(pos)) {
        editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)))
      }
      editor.commands.focus()
    })
  }
  const apply = () => {
    const pos = typeof getPos === 'function' ? getPos() : null
    if (typeof pos !== 'number') return close(false)
    const next = draft.replace(/\s+$/, '')
    if (next === source) return close(true)
    const edit: IslandEdit = inline ? readInlineIsland(next) : readBlockIsland(next)
    if (!edit.ok) {
      setError(`${edit.problem.message}${edit.problem.line ? ` (line ${edit.problem.line}${edit.problem.column ? `, column ${edit.problem.column}` : ''})` : ''}`)
      return
    }
    const { state, view } = editor
    const current = state.doc.nodeAt(pos)
    if (!current) return close(false)
    if (edit.keep) {
      view.dispatch(state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, source: next }))
      close(true, false)
      return
    }
    // Ordinary content now: replace the island with it.
    const nodes = edit.content.map((json) => state.schema.nodeFromJSON(json))
    const tr = state.tr.replaceWith(pos, pos + current.nodeSize, nodes)
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(pos + (inline ? 0 : 1), tr.doc.content.size))))
    view.dispatch(tr.scrollIntoView())
    setEditing(false)
    ui.announce(edit.content.length ? 'The source became regular content.' : 'Removed.')
    requestAnimationFrame(() => editor.commands.focus())
  }
  return { source, editing, draft, setDraft, error, open, close, apply }
}

function SourceEditor({
  id,
  label,
  draft,
  setDraft,
  error,
  apply,
  close,
  rows,
}: {
  id: string
  /** The textarea's accessible name, when no <label> names it (the block view). */
  label?: string
  draft: string
  setDraft: (v: string) => void
  error: string
  apply: () => void
  close: (refocus: boolean) => void
  rows: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  // Client-only (node views never render on the server): the platform's own shortcut.
  const [mac] = useState(isMacPlatform)
  useEffect(() => {
    const ta = ref.current
    if (!ta) return
    ta.focus()
    ta.setSelectionRange(ta.value.length, ta.value.length)
  }, [])
  return (
    <Box>
      <Textarea
        ref={ref}
        id={id}
        aria-label={label}
        aria-keyshortcuts={mac ? 'Meta+Enter Escape' : 'Control+Enter Escape'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            close(true)
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            apply()
          }
          e.stopPropagation()
        }}
        rows={rows}
        fontFamily={MONO}
        fontSize="13px"
        lineHeight={1.55}
        spellCheck={false}
        autoComplete="off"
        bg="page.bg"
        focusBorderColor="accent.500"
        isInvalid={!!error}
        aria-describedby={error ? `${id}-err` : `${id}-hint`}
        resize="vertical"
      />
      {error ? (
        <Text id={`${id}-err`} role="alert" fontSize="12px" color="status.error" mt={1.5}>
          {error}
        </Text>
      ) : (
        <Text id={`${id}-hint`} fontSize="11px" fontFamily={MONO} color="page.fg-secondary" mt={1.5}>
          {mac ? '⌘↵' : 'Ctrl+↵'} apply · Esc cancel
        </Text>
      )}
      <Flex justify="flex-end" gap={2} mt={1.5}>
        <Button size="xs" variant="ghost" onClick={() => close(true)}>
          Cancel
        </Button>
        <Button size="xs" {...primaryButtonProps} onClick={apply}>
          Done
        </Button>
      </Flex>
    </Box>
  )
}

export function MdxBlockView(props: NodeViewProps) {
  const id = useId()
  const { selected } = props
  const { source, editing, draft, setDraft, error, open, close, apply } = useIslandEditor(props)
  const info = describeIsland(source)
  const lines = Math.min(16, Math.max(2, source.split('\n').length + 1))

  // Enter on the selected island opens its source.
  useEffect(() => {
    if (!selected || editing) return
    const dom = props.editor.view.dom
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        open()
      }
    }
    dom.addEventListener('keydown', onKey, true)
    return () => dom.removeEventListener('keydown', onKey, true)
    // open is recreated per render; the listener only needs the latest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, editing, props.editor])

  return (
    <NodeViewWrapper className="tt-mdx-block" data-selected={selected || undefined} data-kind={info.kind}>
      <Flex contentEditable={false} suppressContentEditableWarning align="center" justify="space-between" gap={2} px={3} py={1.5} borderBottom="1px solid" borderColor="page.border" userSelect="none">
        <Flex align="center" gap={2} minW={0}>
          <Text as="span" fontFamily={MONO} fontSize="10px" letterSpacing="0.08em" textTransform="uppercase" color="page.fg-secondary" border="1px solid" borderColor="page.border-strong" borderRadius="sm" px={1.5} lineHeight="16px" flexShrink={0}>
            MDX
          </Text>
          <Text as="span" fontSize="12px" color="page.fg-secondary" noOfLines={1}>
            {info.label}
          </Text>
        </Flex>
        {editing ? null : (
          <Button size="xs" variant="ghost" h="24px" color="page.fg-secondary" onClick={open} tabIndex={tabStop(selected)} aria-label={`Edit the source of ${info.label}`}>
            Edit
          </Button>
        )}
      </Flex>
      <Box contentEditable={false} suppressContentEditableWarning px={3} py={2}>
        {editing ? (
          <SourceEditor
            id={id}
            label={info.label === 'MDX' ? 'MDX source' : `MDX source: ${info.label}`}
            draft={draft}
            setDraft={setDraft}
            error={error}
            apply={apply}
            close={close}
            rows={lines}
          />
        ) : (
          <Box as="pre" className="tt-mdx-source" onDoubleClick={open} m={0} fontFamily={MONO} fontSize="12.5px" lineHeight={1.55} whiteSpace="pre-wrap" overflowWrap="anywhere" color="page.fg-secondary">
            {source}
          </Box>
        )}
      </Box>
    </NodeViewWrapper>
  )
}

export function MdxInlineView(props: NodeViewProps) {
  const id = useId()
  const { selected } = props
  const { source, editing, draft, setDraft, error, open, close, apply } = useIslandEditor({ ...props, inline: true })
  const info = describeIsland(source)
  const short = source.length > 48 ? `${source.slice(0, 47)}…` : source

  useEffect(() => {
    if (!selected || editing) return
    const dom = props.editor.view.dom
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        open()
      }
    }
    dom.addEventListener('keydown', onKey, true)
    return () => dom.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, editing, props.editor])

  return (
    <NodeViewWrapper as="span" className="tt-mdx-inline" data-selected={selected || undefined} data-kind={info.kind}>
      <Popover isOpen={editing} onClose={() => close(false)} placement="bottom-start" isLazy closeOnBlur={false} returnFocusOnClose={false}>
        <PopoverAnchor>
          <Box
            as="code"
            contentEditable={false}
            suppressContentEditableWarning
            title={`${info.label} — double-click, or select it and press Enter, to edit`}
            onDoubleClick={open}
            fontFamily={MONO}
            fontSize="0.85em"
            whiteSpace="pre-wrap"
          >
            {short}
          </Box>
        </PopoverAnchor>
        <Portal>
          <PopoverContent w={{ base: 'calc(100vw - 32px)', sm: '420px' }} maxW="420px" p={2} bg="page.bg-elevated" borderColor="page.border-strong" boxShadow="0 10px 28px rgba(0,0,0,0.18)" _focusVisible={{ outline: 'none' }}>
            <Text as="label" htmlFor={id} display="block" fontSize="12px" color="page.fg-secondary" mb={1.5}>
              {info.label}
            </Text>
            <SourceEditor id={id} draft={draft} setDraft={setDraft} error={error} apply={apply} close={close} rows={Math.min(6, Math.max(2, source.split('\n').length))} />
          </PopoverContent>
        </Portal>
      </Popover>
    </NodeViewWrapper>
  )
}
