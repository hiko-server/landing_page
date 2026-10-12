import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertIcon,
  Box,
  Button,
  HStack,
  IconButton,
  ListItem,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  Textarea,
  Tooltip,
  UnorderedList,
  useToast,
} from '@chakra-ui/react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import { Markdown } from 'tiptap-markdown'
import {
  FaBold,
  FaItalic,
  FaStrikethrough,
  FaCode,
  FaHeading,
  FaListUl,
  FaListOl,
  FaQuoteRight,
  FaLink,
  FaImage,
  FaMinus,
  FaUndo,
  FaRedo,
} from 'react-icons/fa'
import { detectMdxRisks, type MdxRisk } from './shell/mdxRisk'
import { uploadImageFile } from './shell/http'
import { MONO, outlineButtonProps, primaryButtonProps } from './shell/ui'

/**
 * RichEditor — dual-mode WYSIWYG / raw-MDX editor used by all admin content
 * surfaces (/admin/now, /admin/uses, /admin/blog/edit, /admin/work/edit).
 *
 * Architecture:
 *   - Single source of truth is the markdown string the parent owns (`value`).
 *   - The Visual tab is TipTap with `tiptap-markdown` (md ⇆ ProseMirror).
 *   - The MDX tab is a plain textarea — the escape hatch for JSX / MDX that
 *     TipTap can't model.
 *
 * MDX safety: TipTap re-serialises the whole document on the first edit, so
 * JSX components, import/export lines, {expressions}, GFM tables and
 * footnotes would be dropped or escaped. Whenever content arrives from
 * outside (load, reload) it is scanned first; if any of those constructs are
 * present the editor opens on the MDX tab with a warning that lists what the
 * visual editor would rewrite, and switching to Visual asks first.
 *
 * Image upload: toolbar button, drag-and-drop and clipboard paste all go to
 * /api/admin/upload-image; failures (network, 413, non-JSON) become a toast.
 */

type Props = {
  value: string
  onChange: (next: string) => void
  minH?: string
  placeholder?: string
  /** id of the visible label, wired to both editing surfaces. */
  labelledBy?: string
}

const VISUAL = 0
const RAW = 1

function getMarkdown(ed: Editor): string {
  const storage = ed.storage as unknown as { markdown?: { getMarkdown?: () => string } }
  return storage.markdown?.getMarkdown?.() ?? ed.getHTML()
}

function ToolbarButton({
  label,
  icon,
  onClick,
  isActive,
  isDisabled,
}: {
  label: string
  icon: React.ReactElement
  onClick: () => void
  isActive?: boolean
  isDisabled?: boolean
}) {
  return (
    <Tooltip label={label} openDelay={300} hasArrow placement="top">
      <IconButton
        aria-label={label}
        aria-pressed={isActive === undefined ? undefined : isActive}
        icon={icon}
        size="sm"
        variant="ghost"
        onClick={onClick}
        isDisabled={isDisabled}
        color={isActive ? 'accent.500' : 'page.fg-secondary'}
        bg={isActive ? 'var(--accent-soft)' : undefined}
        _hover={{ bg: 'page.bg-overlay', color: 'page.fg' }}
        borderRadius="md"
      />
    </Tooltip>
  )
}

function Divider() {
  return <Box w="1px" h="20px" bg="page.border" mx={1} aria-hidden />
}

function Toolbar({ editor, onPickImage }: { editor: Editor | null; onPickImage: () => void }) {
  if (!editor) return null

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link URL (leave empty to remove)', prev || 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <HStack
      role="toolbar"
      aria-label="Formatting"
      spacing={1}
      p={1.5}
      borderBottom="1px solid"
      borderColor="page.border"
      bg="page.bg-elevated"
      borderTopRadius="lg"
      flexWrap="wrap"
      position="sticky"
      top={0}
      zIndex={1}
    >
      <ToolbarButton
        label="Heading 2"
        icon={<FaHeading size={12} />}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive('heading', { level: 2 })}
      />
      <ToolbarButton
        label="Bold (⌘B)"
        icon={<FaBold size={12} />}
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
      />
      <ToolbarButton
        label="Italic (⌘I)"
        icon={<FaItalic size={12} />}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
      />
      <ToolbarButton
        label="Strikethrough"
        icon={<FaStrikethrough size={12} />}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
      />
      <ToolbarButton
        label="Inline code"
        icon={<FaCode size={12} />}
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive('code')}
      />
      <Divider />
      <ToolbarButton
        label="Bullet list"
        icon={<FaListUl size={12} />}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
      />
      <ToolbarButton
        label="Numbered list"
        icon={<FaListOl size={12} />}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
      />
      <ToolbarButton
        label="Quote"
        icon={<FaQuoteRight size={12} />}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
      />
      <ToolbarButton
        label="Code block"
        icon={<FaCode size={12} />}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive('codeBlock')}
      />
      <ToolbarButton
        label="Horizontal rule"
        icon={<FaMinus size={12} />}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      />
      <Divider />
      <ToolbarButton
        label="Link"
        icon={<FaLink size={12} />}
        onClick={setLink}
        isActive={editor.isActive('link')}
      />
      <ToolbarButton label="Insert image" icon={<FaImage size={12} />} onClick={onPickImage} />
      <Divider />
      <ToolbarButton
        label="Undo (⌘Z)"
        icon={<FaUndo size={12} />}
        onClick={() => editor.chain().focus().undo().run()}
        isDisabled={!editor.can().undo()}
      />
      <ToolbarButton
        label="Redo (⌘⇧Z)"
        icon={<FaRedo size={12} />}
        onClick={() => editor.chain().focus().redo().run()}
        isDisabled={!editor.can().redo()}
      />
    </HStack>
  )
}

function RiskList({ risks }: { risks: MdxRisk[] }) {
  return (
    <UnorderedList spacing={1} mt={1.5} ml={4} fontSize="xs">
      {risks.map((r) => (
        <ListItem key={r.kind}>
          <Text as="span" fontWeight={600}>
            {r.label}
          </Text>{' '}
          ({r.count}) — {r.effect}.{' '}
          <Text as="span" fontFamily={MONO} color="page.fg-secondary">
            line{r.lines.length > 1 ? 's' : ''} {r.lines.join(', ')}
            {r.count > r.lines.length ? ', …' : ''}
          </Text>
        </ListItem>
      ))}
    </UnorderedList>
  )
}

const tabStyle = {
  fontSize: '12px',
  fontFamily: MONO,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  px: 3,
  py: 1.5,
  borderRadius: 'md',
  color: 'page.fg-secondary',
  _selected: {
    color: 'page.fg',
    bg: 'page.bg',
    boxShadow: '0 0 0 1px var(--chakra-colors-page-border-strong)',
  },
  _focusVisible: { boxShadow: '0 0 0 2px var(--accent-ring)' },
}

export default function RichEditor({
  value,
  onChange,
  minH = '520px',
  placeholder,
  labelledBy,
}: Props) {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mdxRef = useRef<HTMLTextAreaElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  const risks = useMemo(() => detectMdxRisks(value), [value])
  // Content with constructs the visual editor would destroy opens on MDX.
  const [tabIndex, setTabIndex] = useState(() => (detectMdxRisks(value).length ? RAW : VISUAL))
  const [confirmVisual, setConfirmVisual] = useState(false)
  // The last markdown string this component produced (either surface).
  // Anything else arriving through `value` came from outside (load, reload).
  const lastEmitted = useRef<string>(value)
  // What TipTap currently holds, to avoid re-applying identical content.
  const lastApplied = useRef<string>(value)

  const emit = useCallback(
    (md: string) => {
      lastEmitted.current = md
      onChange(md)
    },
    [onChange]
  )
  const emitRef = useRef(emit)
  emitRef.current = emit

  const notifyUploadError = useCallback(
    (err: unknown) =>
      toast({
        status: 'error',
        title: 'Image upload failed',
        description: err instanceof Error ? err.message : String(err),
        position: 'bottom-right',
      }),
    [toast]
  )
  const notifyRef = useRef(notifyUploadError)
  notifyRef.current = notifyUploadError

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: { HTMLAttributes: { class: 'tt-codeblock' } } }),
      Image.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'tt-image' } }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Placeholder.configure({ placeholder: placeholder || 'Write something…' }),
      Typography,
      Markdown.configure({
        html: true,
        linkify: true,
        breaks: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: value,
    // Pages-router SSR: render on the client only (avoids hydration mismatch),
    // and re-render on every transaction so toolbar active / undo states stay live.
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: ed }) => {
      const md = getMarkdown(ed)
      lastApplied.current = md
      emitRef.current(md)
    },
    editorProps: {
      attributes: {
        class: 'tt-prose',
        role: 'textbox',
        'aria-multiline': 'true',
        ...(labelledBy ? { 'aria-labelledby': labelledBy } : {}),
      },
      handleDrop(view, event) {
        const files = event.dataTransfer?.files
        if (!files || files.length === 0) return false
        const imageFile = Array.from(files).find((f) => f.type.startsWith('image/'))
        if (!imageFile) return false
        event.preventDefault()
        uploadImageFile(imageFile)
          .then(({ url }) => {
            const node = view.state.schema.nodes.image.create({
              src: url,
              alt: imageFile.name.replace(/\.[^.]+$/, ''),
            })
            view.dispatch(view.state.tr.replaceSelectionWith(node))
          })
          .catch((e) => notifyRef.current(e))
        return true
      },
      handlePaste(view, event) {
        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of Array.from(items)) {
          if (!item.type.startsWith('image/')) continue
          const file = item.getAsFile()
          if (!file) continue
          event.preventDefault()
          uploadImageFile(file)
            .then(({ url }) => {
              const node = view.state.schema.nodes.image.create({ src: url, alt: '' })
              view.dispatch(view.state.tr.replaceSelectionWith(node))
            })
            .catch((e) => notifyRef.current(e))
          return true
        }
        return false
      },
    },
  })

  // External value changes (load / reload): re-check for MDX constructs and
  // sync TipTap without emitting an update.
  useEffect(() => {
    if (value === lastEmitted.current) return
    lastEmitted.current = value
    if (detectMdxRisks(value).length) setTabIndex(RAW)
    if (editor && value !== lastApplied.current) {
      lastApplied.current = value
      editor.commands.setContent(value || '', { emitUpdate: false })
    }
  }, [value, editor])

  // Entering the visual tab: load the latest raw text typed in the MDX tab.
  useEffect(() => {
    if (!editor || tabIndex !== VISUAL || value === lastApplied.current) return
    lastApplied.current = value
    editor.commands.setContent(value || '', { emitUpdate: false })
    // Only on tab change: typing in the visual editor updates lastApplied itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabIndex, editor])

  const onTabChange = (i: number) => {
    if (i === VISUAL && risks.length) {
      setConfirmVisual(true)
      return
    }
    setTabIndex(i)
  }

  const onPickImage = useCallback(() => fileInputRef.current?.click(), [])

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    try {
      const { url, warning } = await uploadImageFile(file)
      if (warning)
        toast({
          status: 'warning',
          title: 'Image uploaded',
          description: warning,
          position: 'bottom-right',
        })
      const alt = file.name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '')
      if (tabIndex === RAW) {
        // Raw tab: insert Markdown at the caret instead of routing through
        // the (hidden) visual editor, which would re-serialise the MDX.
        const ta = mdxRef.current
        const snippet = `![${alt}](${url})`
        const start = ta ? ta.selectionStart : value.length
        const end = ta ? ta.selectionEnd : value.length
        const before = value.slice(0, start)
        const glue = before && !before.endsWith('\n') ? '\n\n' : ''
        emit(`${before}${glue}${snippet}\n${value.slice(end)}`)
        requestAnimationFrame(() => {
          if (!ta) return
          const pos = before.length + glue.length + snippet.length + 1
          ta.focus()
          ta.setSelectionRange(pos, pos)
        })
      } else if (editor) {
        editor.chain().focus().setImage({ src: url, alt }).run()
      }
    } catch (err) {
      notifyUploadError(err)
    }
  }

  return (
    <Box>
      <Tabs index={tabIndex} onChange={onTabChange} variant="unstyled" size="sm">
        <TabList
          display="inline-flex"
          gap={1}
          p={1}
          mb={3}
          border="1px solid"
          borderColor="page.border"
          borderRadius="lg"
          bg="page.bg-elevated"
          aria-label="Editor mode"
        >
          <Tab {...tabStyle}>Visual</Tab>
          <Tab {...tabStyle}>MDX</Tab>
        </TabList>

        {risks.length ? (
          <Alert
            status="warning"
            variant="left-accent"
            borderRadius="md"
            mb={3}
            alignItems="flex-start"
            bg="page.bg-elevated"
            fontSize="sm"
          >
            <AlertIcon mt={0.5} />
            <AlertDescription>
              {tabIndex === RAW
                ? 'This body uses MDX the visual editor can’t represent — keep editing it here. Editing it visually would rewrite:'
                : 'Typing in the visual editor will re-save the whole body and rewrite:'}
              <RiskList risks={risks} />
            </AlertDescription>
          </Alert>
        ) : null}

        <TabPanels>
          <TabPanel p={0}>
            <Box border="1px solid" borderColor="page.border-strong" borderRadius="lg" bg="page.bg">
              <Toolbar editor={editor} onPickImage={onPickImage} />
              <Box
                px={4}
                py={3}
                minH={minH}
                onClick={() => editor?.commands.focus()}
                sx={{
                  '.tt-prose': { minHeight: minH, outline: 'none' },
                  '.tt-prose p.is-editor-empty:first-of-type::before': {
                    content: 'attr(data-placeholder)',
                    color: 'page.muted',
                    float: 'left',
                    height: 0,
                    pointerEvents: 'none',
                  },
                  '.tt-prose h1': {
                    fontSize: '28px',
                    fontWeight: 600,
                    mt: 4,
                    mb: 2,
                    letterSpacing: '-0.02em',
                  },
                  '.tt-prose h2': {
                    fontSize: '22px',
                    fontWeight: 600,
                    mt: 4,
                    mb: 2,
                    letterSpacing: '-0.015em',
                  },
                  '.tt-prose h3': { fontSize: '18px', fontWeight: 600, mt: 3, mb: 2 },
                  '.tt-prose p': { my: 2, lineHeight: 1.7 },
                  '.tt-prose ul, .tt-prose ol': { pl: 6, my: 2 },
                  '.tt-prose ul': { listStyleType: 'disc' },
                  '.tt-prose ol': { listStyleType: 'decimal' },
                  '.tt-prose blockquote': {
                    borderLeft: '2px solid',
                    borderColor: 'page.border-strong',
                    pl: 4,
                    color: 'page.fg-secondary',
                    my: 3,
                  },
                  '.tt-prose code': {
                    fontFamily: MONO,
                    fontSize: '0.9em',
                    bg: 'page.bg-overlay',
                    px: 1,
                    borderRadius: 'sm',
                  },
                  '.tt-prose pre.tt-codeblock': {
                    fontFamily: MONO,
                    fontSize: '13px',
                    bg: 'page.bg-elevated',
                    border: '1px solid',
                    borderColor: 'page.border',
                    p: 3,
                    borderRadius: 'md',
                    overflow: 'auto',
                    my: 3,
                  },
                  '.tt-prose pre.tt-codeblock code': { bg: 'transparent', px: 0 },
                  '.tt-prose img.tt-image': { maxWidth: '100%', borderRadius: 'md', my: 3 },
                  '.tt-prose a': {
                    color: 'accent.500',
                    textDecoration: 'underline',
                    textUnderlineOffset: '2px',
                  },
                  '.tt-prose hr': { my: 4, borderColor: 'page.border' },
                }}
              >
                <EditorContent editor={editor} />
              </Box>
            </Box>
          </TabPanel>
          <TabPanel p={0}>
            <Textarea
              ref={mdxRef}
              value={value}
              onChange={(e) => emit(e.target.value)}
              minH={minH}
              spellCheck={false}
              fontFamily={MONO}
              fontSize="14px"
              lineHeight={1.6}
              placeholder={placeholder}
              aria-labelledby={labelledBy}
              borderColor="page.border-strong"
              focusBorderColor="accent.500"
              bg="page.bg"
            />
            <HStack mt={2} spacing={3} flexWrap="wrap">
              <Button size="xs" {...outlineButtonProps} onClick={onPickImage}>
                Upload image → insert ![]()
              </Button>
              <Text fontSize="11px" color="page.fg-secondary" fontFamily={MONO}>
                Raw MDX — JSX components, tables and footnotes are safe here.
              </Text>
            </HStack>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onFileSelected}
        aria-hidden
        tabIndex={-1}
      />

      <AlertDialog
        isOpen={confirmVisual}
        leastDestructiveRef={cancelRef}
        onClose={() => setConfirmVisual(false)}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent
            bg="page.bg-elevated"
            border="1px solid"
            borderColor="page.border"
            mx={4}
          >
            <AlertDialogHeader fontSize="md">Open the visual editor?</AlertDialogHeader>
            <AlertDialogBody fontSize="sm">
              The first edit there re-saves the whole body in plain Markdown, which rewrites:
              <RiskList risks={risks} />
              <Text mt={3} color="page.fg-secondary">
                Viewing is harmless; nothing changes until you type.
              </Text>
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button
                ref={cancelRef}
                size="sm"
                {...outlineButtonProps}
                onClick={() => setConfirmVisual(false)}
              >
                Stay in MDX
              </Button>
              <Button
                size="sm"
                {...primaryButtonProps}
                onClick={() => {
                  setConfirmVisual(false)
                  setTabIndex(VISUAL)
                }}
              >
                Open visual editor
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  )
}
