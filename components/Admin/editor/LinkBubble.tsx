import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Box, Button, Flex, IconButton, Input, Text, Tooltip } from '@chakra-ui/react'
import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { NodeSelection } from '@tiptap/pm/state'
import { CellSelection } from '@tiptap/pm/tables'
import { FaBold, FaCode, FaItalic, FaLink } from 'react-icons/fa'
import { normalizeLinkHref } from './slashItems'

/**
 * Selection bubble of the visual editor: Bold / Italic / Code / Link, and an
 * inline link form (no window.prompt). ⌘K / Ctrl+K opens the form (the
 * editor calls `openLink`), Enter applies, Esc cancels, "Remove link"
 * unlinks. Links are validated like the CV's links (http(s), mailto, tel,
 * site paths and #fragments; a bare domain gets https://).
 *
 * With an empty selection (⌘K or the toolbar's Link button) the form opens
 * at the caret and inserts the URL as linked text.
 */

export const LINK_BUBBLE_KEY = 'linkBubble'

export type LinkBubbleHandle = { openLink: () => void }

type Props = {
  editor: Editor
  handleRef: React.MutableRefObject<LinkBubbleHandle | null>
}

const POP_CSS = {
  '@keyframes bubbleIn': { from: { opacity: 0, transform: 'scale(0.98)' }, to: { opacity: 1, transform: 'none' } },
  animation: 'bubbleIn 120ms cubic-bezier(0.22, 1, 0.36, 1)',
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
}

function BubbleButton({ label, icon, active, onClick }: { label: string; icon: React.ReactElement; active?: boolean; onClick: () => void }) {
  return (
    <Tooltip label={label} openDelay={400} placement="top" hasArrow>
      <IconButton
        aria-label={label}
        aria-pressed={active}
        icon={icon}
        size="sm"
        minW="32px"
        h="32px"
        variant="ghost"
        color={active ? 'accent.text' : 'page.fg-secondary'}
        bg={active ? 'var(--accent-soft)' : undefined}
        _hover={{ bg: 'page.bg-overlay', color: 'page.fg' }}
        onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
        onClick={onClick}
      />
    </Tooltip>
  )
}

export default function LinkBubble({ editor, handleRef }: Props) {
  const inputId = useId()
  const [editing, setEditing] = useState(false)
  const [href, setHref] = useState('')
  const [error, setError] = useState('')
  const editingRef = useRef(false)
  editingRef.current = editing
  const inputRef = useRef<HTMLInputElement>(null)

  const openLink = useCallback(() => {
    if (editor.isActive('link')) editor.chain().focus().extendMarkRange('link').run()
    setHref(String(editor.getAttributes('link').href || ''))
    setError('')
    setEditing(true)
    editingRef.current = true
    // Force the bubble to show even for an empty selection.
    editor.view.dispatch(editor.state.tr.setMeta(LINK_BUBBLE_KEY, 'show'))
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [editor])

  useEffect(() => {
    handleRef.current = { openLink }
    return () => {
      handleRef.current = null
    }
  }, [handleRef, openLink])

  const close = useCallback(
    (refocus: boolean) => {
      setEditing(false)
      editingRef.current = false
      setError('')
      if (editor.state.selection.empty) editor.view.dispatch(editor.state.tr.setMeta(LINK_BUBBLE_KEY, 'hide'))
      if (refocus) editor.commands.focus()
    },
    [editor],
  )

  const apply = () => {
    if (!href.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      close(false)
      return
    }
    const safe = normalizeLinkHref(href)
    if (!safe) {
      setError('Use https://…, mailto:, a /path or #section.')
      return
    }
    if (editor.state.selection.empty && !editor.isActive('link')) {
      editor
        .chain()
        .focus()
        .insertContent({ type: 'text', text: safe, marks: [{ type: 'link', attrs: { href: safe } }] })
        .run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: safe }).run()
    }
    close(false)
  }

  const remove = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    close(false)
  }

  return (
    <BubbleMenu
      editor={editor}
      pluginKey={LINK_BUBBLE_KEY}
      updateDelay={120}
      options={{
        placement: 'top',
        offset: 8,
        flip: true,
        shift: { padding: 8 },
        onHide: () => {
          // Hidden by the plugin (blur, selection gone): leave link mode quietly.
          editingRef.current = false
          setEditing(false)
        },
      }}
      shouldShow={({ editor: ed, state, from, to, view }) => {
        if (editingRef.current) return true
        if (!view.hasFocus() || !ed.isEditable) return false
        if (ed.isActive('image') || ed.isActive('codeBlock')) return false
        // A selected block (figure, video, MDX) or a cell selection has its own toolbar.
        if (state.selection instanceof NodeSelection || state.selection instanceof CellSelection) return false
        return from !== to && state.doc.textBetween(from, to).trim().length > 0
      }}
    >
      <Box
        bg="page.bg-elevated"
        border="1px solid"
        borderColor="page.border-strong"
        borderRadius="lg"
        boxShadow="0 10px 28px rgba(0,0,0,0.18)"
        p={1}
        sx={POP_CSS}
      >
        {editing ? (
          <Box as="form" onSubmit={(e: React.FormEvent) => e.preventDefault()} w={{ base: '260px', sm: '320px' }} p={1}>
            <Text as="label" htmlFor={inputId} srOnly>
              Link URL
            </Text>
            <Flex gap={1.5}>
              <Input
                id={inputId}
                ref={inputRef}
                size="sm"
                value={href}
                onChange={(e) => {
                  setHref(e.target.value)
                  setError('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    apply()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    close(true)
                  }
                }}
                placeholder="https://… or /blog/slug"
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                isInvalid={!!error}
                aria-describedby={error ? `${inputId}-err` : undefined}
              />
              <Button size="sm" colorScheme="accent" onClick={apply} flexShrink={0}>
                Apply
              </Button>
            </Flex>
            {error ? (
              <Text id={`${inputId}-err`} role="alert" fontSize="12px" color="red.400" mt={1}>
                {error}
              </Text>
            ) : null}
            {editor.isActive('link') ? (
              <Button size="xs" variant="link" color="page.fg-secondary" mt={1.5} onClick={remove}>
                Remove link
              </Button>
            ) : null}
          </Box>
        ) : (
          <Flex role="toolbar" aria-label="Text formatting" gap={0.5}>
            <BubbleButton label="Bold (⌘B)" icon={<FaBold size={12} />} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
            <BubbleButton label="Italic (⌘I)" icon={<FaItalic size={12} />} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
            <BubbleButton label="Inline code" icon={<FaCode size={12} />} active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} />
            <BubbleButton label="Link (⌘K)" icon={<FaLink size={12} />} active={editor.isActive('link')} onClick={openLink} />
          </Flex>
        )}
      </Box>
    </BubbleMenu>
  )
}
