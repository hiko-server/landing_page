import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
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
  usePrefersReducedMotion,
  useToast,
} from '@chakra-ui/react'
import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react'
import type { EditorProps } from '@tiptap/pm/view'
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
import { MONO, outlineButtonProps, primaryButtonProps } from './shell/ui'
import { baseExtensions } from './editor/extensions'
import { createSlashCommand, type SlashBridge } from './editor/SlashCommand'
import SlashMenu, { type SlashResult } from './editor/SlashMenu'
import LinkBubble, { type LinkBubbleHandle } from './editor/LinkBubble'
import ImageBubble from './editor/ImageBubble'
import { UPLOAD_ACCEPT, altFromFileName, uploadImage, type UploadedImage } from './editor/upload'
import { markdownLink, rawCodeFence, rawSnippet, youtubeTag, youtubeWatchUrl } from './editor/slashItems'
import { headingIndexAt, offsetOfLineColumn, slashTriggerAt, textareaCaretRect } from './editor/textareaCaret'
import {
  planVisualSync,
  sameToolbarState,
  sameViewSnapshot,
  viewSnapshot,
  type ToolbarState,
} from './editor/editorSync'

/**
 * RichEditor — dual-mode WYSIWYG / raw-MDX editor used by all admin content
 * surfaces (/admin/now, /admin/uses, /admin/blog/edit, /admin/work/edit).
 *
 * Architecture:
 *   - Single source of truth is the markdown string the parent owns (`value`).
 *   - The Visual tab is TipTap with `tiptap-markdown` (md ⇆ ProseMirror):
 *     "/" opens the block menu, selecting text shows the formatting / link
 *     bubble, selecting an image shows its alt-text bubble, ⌘K edits links.
 *   - The MDX tab is a plain textarea — the escape hatch for JSX / MDX that
 *     TipTap can't model. "/" opens the same block menu there (it inserts
 *     Markdown / MDX text, e.g. a <YouTube /> tag).
 *
 * MDX safety: TipTap re-serialises the whole document on the first edit, so
 * JSX components, import/export lines, {expressions}, GFM tables and
 * footnotes would be dropped or escaped. Whenever content arrives from
 * outside (load, reload) it is scanned first; if any of those constructs are
 * present the editor opens on the MDX tab with a warning that lists what the
 * visual editor would rewrite, and switching to Visual asks first.
 *
 * Image upload: toolbar, "/image", drag-and-drop and clipboard paste all go
 * to /api/admin/upload-image (resized, WebP variants); the image node keeps
 * the returned width / height. Failures become a toast.
 *
 * Imperative handle (`handleRef`): `jumpToLine(line, column)` (opens the MDX
 * tab with the caret on a compile error) and `focus()`.
 *
 * Rendering contract (editor/editorSync.ts): this component does NOT
 * re-render on TipTap transactions. The toolbar and the bubble menus
 * subscribe to editor state through selectors that only change when what
 * they show changes, so a metadata-only transaction (TipTap's BubbleMenu
 * dispatches one whenever its props change) can never start a render →
 * transaction → render cycle. The useEditor options are kept referentially
 * stable for the same reason, and content set from outside never emits an
 * update.
 */

export type RichEditorHandle = {
  jumpToLine: (line: number, column?: number) => void
  focus: () => void
}

type Props = {
  value: string
  onChange: (next: string) => void
  minH?: string
  placeholder?: string
  /** id of the visible label, wired to both editing surfaces. */
  labelledBy?: string
  /** Index (0-based, -1 = none) of the heading at or above the caret — drives the live preview's scroll. */
  onHeadingIndex?: (index: number) => void
  /**
   * Receives the imperative handle. A plain prop rather than `ref`, so it
   * also works through next/dynamic.
   */
  handleRef?: React.Ref<RichEditorHandle>
}

const VISUAL = 0
const RAW = 1

function getMarkdown(ed: Editor): string {
  const storage = ed.storage as unknown as { markdown?: { getMarkdown?: () => string } }
  return storage.markdown?.getMarkdown?.() ?? ed.getHTML()
}

/** Index of the heading at or above the visual editor's caret. */
function visualHeadingIndex(ed: Editor): number {
  let index = -1
  const pos = ed.state.selection.from
  ed.state.doc.nodesBetween(0, Math.max(0, Math.min(pos, ed.state.doc.content.size)), (node) => {
    if (node.type.name === 'heading') index++
    return node.isBlock && node.type.name !== 'heading'
  })
  return index
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
        color={isActive ? 'accent.text' : 'page.fg-secondary'}
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

function toolbarStateOf(ed: Editor): ToolbarState {
  return {
    heading2: ed.isActive('heading', { level: 2 }),
    bold: ed.isActive('bold'),
    italic: ed.isActive('italic'),
    strike: ed.isActive('strike'),
    code: ed.isActive('code'),
    bulletList: ed.isActive('bulletList'),
    orderedList: ed.isActive('orderedList'),
    blockquote: ed.isActive('blockquote'),
    codeBlock: ed.isActive('codeBlock'),
    link: ed.isActive('link'),
    canUndo: ed.can().undo(),
    canRedo: ed.can().redo(),
  }
}

/** Formatting toolbar; re-renders only when an active / enabled state changes. */
const Toolbar = React.memo(function Toolbar({
  editor,
  onPickImage,
  onLink,
}: {
  editor: Editor
  onPickImage: () => void
  onLink: () => void
}) {
  const state = useEditorState({ editor, selector: ({ editor: ed }) => toolbarStateOf(ed), equalityFn: sameToolbarState })
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
        isActive={state.heading2}
      />
      <ToolbarButton label="Bold (⌘B)" icon={<FaBold size={12} />} onClick={() => editor.chain().focus().toggleBold().run()} isActive={state.bold} />
      <ToolbarButton
        label="Italic (⌘I)"
        icon={<FaItalic size={12} />}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={state.italic}
      />
      <ToolbarButton
        label="Strikethrough"
        icon={<FaStrikethrough size={12} />}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={state.strike}
      />
      <ToolbarButton label="Inline code" icon={<FaCode size={12} />} onClick={() => editor.chain().focus().toggleCode().run()} isActive={state.code} />
      <Divider />
      <ToolbarButton
        label="Bullet list"
        icon={<FaListUl size={12} />}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={state.bulletList}
      />
      <ToolbarButton
        label="Numbered list"
        icon={<FaListOl size={12} />}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={state.orderedList}
      />
      <ToolbarButton
        label="Quote"
        icon={<FaQuoteRight size={12} />}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={state.blockquote}
      />
      <ToolbarButton
        label="Code block"
        icon={<FaCode size={12} />}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={state.codeBlock}
      />
      <ToolbarButton label="Horizontal rule" icon={<FaMinus size={12} />} onClick={() => editor.chain().focus().setHorizontalRule().run()} />
      <Divider />
      <ToolbarButton label="Link (⌘K)" icon={<FaLink size={12} />} onClick={onLink} isActive={state.link} />
      <ToolbarButton label="Insert image" icon={<FaImage size={12} />} onClick={onPickImage} />
      <Divider />
      <ToolbarButton label="Undo (⌘Z)" icon={<FaUndo size={12} />} onClick={() => editor.chain().focus().undo().run()} isDisabled={!state.canUndo} />
      <ToolbarButton
        label="Redo (⌘⇧Z)"
        icon={<FaRedo size={12} />}
        onClick={() => editor.chain().focus().redo().run()}
        isDisabled={!state.canRedo}
      />
    </HStack>
  )
})

/**
 * Selection bubbles. They render from the editor state (active marks, the
 * selected image), so they follow the document, selection and stored marks —
 * but not metadata-only transactions, which their own <BubbleMenu> dispatches
 * whenever they render (see editor/editorSync.ts).
 */
const EditorBubbles = React.memo(function EditorBubbles({
  editor,
  linkHandle,
}: {
  editor: Editor
  linkHandle: React.MutableRefObject<LinkBubbleHandle | null>
}) {
  useEditorState({
    editor,
    selector: ({ editor: ed }) => viewSnapshot(ed.state, Boolean(ed.isEditable)),
    equalityFn: sameViewSnapshot,
  })
  return (
    <>
      <LinkBubble editor={editor} handleRef={linkHandle} />
      <ImageBubble editor={editor} />
    </>
  )
})

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

type SlashOpen = { source: 'visual' | 'raw'; query: string; key: number }

export default function RichEditor({
  value,
  onChange,
  minH = '520px',
  placeholder,
  labelledBy,
  onHeadingIndex,
  handleRef,
}: Props) {
  const toast = useToast()
  const reducedMotion = usePrefersReducedMotion()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mdxRef = useRef<HTMLTextAreaElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const linkHandle = useRef<LinkBubbleHandle | null>(null)

  const risks = useMemo(() => detectMdxRisks(value), [value])
  // Content with constructs the visual editor would destroy opens on MDX.
  const [tabIndex, setTabIndex] = useState(() => (detectMdxRisks(value).length ? RAW : VISUAL))
  const tabRef = useRef(tabIndex)
  tabRef.current = tabIndex
  const [confirmVisual, setConfirmVisual] = useState(false)
  // The last markdown string this component produced (either surface).
  // Anything else arriving through `value` came from outside (load, reload).
  const lastEmitted = useRef<string>(value)
  // TipTap is created with the value of the first render; later values are
  // synced by the effect below (a changing `content` option would make
  // useEditor reconfigure the editor on every keystroke).
  const [initialContent] = useState(value)
  // What TipTap currently holds, to avoid re-applying identical content.
  const lastApplied = useRef<string>(initialContent)
  // An outside value arrived that TipTap has not been given yet.
  const externalPending = useRef(false)
  // The editor instance lastApplied refers to.
  const syncedEditor = useRef<Editor | null>(null)
  const valueRef = useRef(value)
  valueRef.current = value

  const emit = useCallback(
    (md: string) => {
      lastEmitted.current = md
      onChange(md)
    },
    [onChange],
  )
  const emitRef = useRef(emit)
  emitRef.current = emit

  const headingCb = useRef(onHeadingIndex)
  headingCb.current = onHeadingIndex
  const lastHeading = useRef<number | null>(null)
  const reportHeading = useCallback((i: number) => {
    if (lastHeading.current === i) return
    lastHeading.current = i
    headingCb.current?.(i)
  }, [])

  const notifyUploadError = useCallback(
    (err: unknown) =>
      toast({
        status: 'error',
        title: 'Image upload failed',
        description: err instanceof Error ? err.message : String(err),
        position: 'bottom-right',
      }),
    [toast],
  )
  const notifyRef = useRef(notifyUploadError)
  notifyRef.current = notifyUploadError

  // ── Slash menu state (shared by both surfaces) ──────────────────────────
  const [slash, setSlash] = useState<SlashOpen | null>(null)
  const slashAnchor = useRef<() => DOMRect | null>(() => null)
  /** Visual: the Suggestion range. Raw: [trigger start, caret]. */
  const slashRange = useRef<{ from: number; to: number } | null>(null)
  /** A command's form is open (the trigger text is already removed). */
  const slashStepping = useRef(false)
  /** Raw: where the chosen snippet goes once the trigger is removed. */
  const rawInsertAt = useRef<number | null>(null)
  const slashKeyRef = useRef<((e: KeyboardEvent) => boolean) | null>(null)
  const bridge = useRef<SlashBridge | null>(null)
  bridge.current = {
    onOpen: (s) => {
      slashRange.current = s.range
      slashAnchor.current = () => s.clientRect?.() ?? null
      slashStepping.current = false
      setSlash({ source: 'visual', query: s.query, key: s.range.from })
    },
    onUpdate: (s) => {
      slashRange.current = s.range
      slashAnchor.current = () => s.clientRect?.() ?? null
      setSlash({ source: 'visual', query: s.query, key: s.range.from * 1000 + s.query.length })
    },
    onClose: () => {
      if (!slashStepping.current) setSlash(null)
    },
    onKeyDown: (e) => slashKeyRef.current?.(e) ?? false,
  }
  const slashExtension = useMemo(() => createSlashCommand(bridge), [])
  const pendingImageInsert = useRef<number | null>(null)

  // useEditor compares these options on every render and reconfigures the
  // editor when one changed, so they must keep their identity.
  const extensions = useMemo(
    () => [...baseExtensions({ placeholder: placeholder || 'Write something… Type / for blocks.' }), slashExtension],
    [placeholder, slashExtension],
  )
  const editorProps = useMemo<EditorProps>(
    () => ({
      attributes: {
        class: 'tt-prose',
        role: 'textbox',
        'aria-multiline': 'true',
        ...(labelledBy ? { 'aria-labelledby': labelledBy } : {}),
      },
      handleKeyDown(_view, event) {
        // Inside the editor ⌘K edits the link; stopPropagation keeps it from also
        // reaching the site-wide command palette shortcut (a document keydown listener).
        if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
          event.preventDefault()
          event.stopPropagation()
          linkHandle.current?.openLink()
          return true
        }
        return false
      },
      handleDrop(view, event) {
        const files = event.dataTransfer?.files
        if (!files || files.length === 0) return false
        const imageFile = Array.from(files).find((f) => f.type.startsWith('image/'))
        if (!imageFile) return false
        event.preventDefault()
        uploadImage(imageFile)
          .then((img) => {
            const node = view.state.schema.nodes.image.create({
              src: img.url,
              alt: altFromFileName(imageFile.name),
              width: img.width,
              height: img.height,
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
          uploadImage(file)
            .then((img) => {
              const node = view.state.schema.nodes.image.create({ src: img.url, alt: '', width: img.width, height: img.height })
              view.dispatch(view.state.tr.replaceSelectionWith(node))
            })
            .catch((e) => notifyRef.current(e))
          return true
        }
        return false
      },
    }),
    [labelledBy],
  )

  const editor = useEditor({
    extensions,
    content: initialContent,
    editorProps,
    // Pages-router SSR: render on the client only (avoids hydration mismatch).
    immediatelyRender: false,
    // The toolbar and bubbles subscribe to the state they show; re-rendering
    // this whole tree on every transaction is what fed the update loop.
    shouldRerenderOnTransaction: false,
    // Callbacks are read from the latest options on every event.
    onUpdate: ({ editor: ed }) => {
      const md = getMarkdown(ed)
      lastApplied.current = md
      emitRef.current(md)
    },
    onSelectionUpdate: ({ editor: ed }) => reportHeading(visualHeadingIndex(ed)),
    onBlur: () => {
      if (!slashStepping.current) setSlash((s) => (s?.source === 'visual' ? null : s))
    },
  })

  // Values from outside (load, reload, draft restore) — anything but this
  // component's own echo: re-check for MDX constructs.
  useEffect(() => {
    if (value === lastEmitted.current) return
    lastEmitted.current = value
    externalPending.current = true
    if (detectMdxRisks(value).length) setTabIndex(RAW)
  }, [value])

  // Bring TipTap's document up to date: outside values at once, raw MDX
  // typing when the Visual tab opens. Content set here never emits an update,
  // and identical content (as Markdown) is not set again.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (syncedEditor.current !== editor) {
      // A new instance starts from the content it was created with.
      syncedEditor.current = editor
      lastApplied.current = initialContent
    }
    if (tabIndex !== VISUAL && !externalPending.current) return
    externalPending.current = false
    const md = valueRef.current
    const plan = planVisualSync(md, lastApplied.current, () => getMarkdown(editor))
    if (plan === 'none') return
    lastApplied.current = md
    if (plan === 'apply') editor.commands.setContent(md || '', { emitUpdate: false })
  }, [value, editor, tabIndex, initialContent])

  // A tab switch closes any open slash menu.
  useEffect(() => {
    slashStepping.current = false
    setSlash(null)
  }, [tabIndex])

  const onTabChange = (i: number) => {
    if (i === VISUAL && risks.length) {
      setConfirmVisual(true)
      return
    }
    setTabIndex(i)
  }

  const onPickImage = useCallback(() => fileInputRef.current?.click(), [])
  const openLink = useCallback(() => {
    if (!editor) return
    editor.commands.focus()
    linkHandle.current?.openLink()
  }, [editor])

  /** Insert raw text at [from, to) of the textarea value; `|` in `snippet` marks the caret. */
  const insertRaw = useCallback(
    (from: number, to: number, snippet: string, block: boolean) => {
      const cur = valueRef.current
      const before = cur.slice(0, from)
      const after = cur.slice(to)
      // Blocks start on their own paragraph: a blank line after any text before them.
      let glue = ''
      if (block && before.trim()) glue = before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
      const caretInSnippet = snippet.includes('|') ? snippet.indexOf('|') : snippet.length
      const text = snippet.replace('|', '')
      const tail = block && after && !after.startsWith('\n') ? '\n\n' : ''
      emit(`${before}${glue}${text}${tail}${after}`)
      const pos = before.length + glue.length + caretInSnippet
      requestAnimationFrame(() => {
        const ta = mdxRef.current
        if (!ta) return
        ta.focus()
        ta.setSelectionRange(pos, pos)
      })
    },
    [emit],
  )

  const insertUploaded = useCallback(
    (img: UploadedImage, fileName: string) => {
      const alt = altFromFileName(fileName)
      if (tabRef.current === RAW) {
        const ta = mdxRef.current
        const cur = valueRef.current
        const at = pendingImageInsert.current ?? (ta ? ta.selectionStart : cur.length)
        const end = pendingImageInsert.current ?? (ta ? ta.selectionEnd : cur.length)
        insertRaw(at, end, `${markdownLink(alt, img.url).replace(/^\[/, '![')}|`, true)
      } else if (editor) {
        editor.chain().focus().setImage({ src: img.url, alt, width: img.width ?? undefined, height: img.height ?? undefined }).run()
      }
      pendingImageInsert.current = null
    },
    [editor, insertRaw],
  )

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) {
      pendingImageInsert.current = null
      return
    }
    try {
      const img = await uploadImage(file)
      if (img.warning) toast({ status: 'warning', title: 'Image uploaded', description: img.warning, position: 'bottom-right' })
      insertUploaded(img, file.name)
    } catch (err) {
      pendingImageInsert.current = null
      notifyUploadError(err)
    }
  }

  // ── Slash menu actions ──────────────────────────────────────────────────
  const closeSlash = useCallback(
    ({ refocus }: { refocus: boolean }) => {
      const source = slash?.source
      slashStepping.current = false
      slashRange.current = null
      setSlash(null)
      if (!refocus) return
      if (source === 'raw') {
        const at = rawInsertAt.current
        requestAnimationFrame(() => {
          const ta = mdxRef.current
          if (!ta) return
          ta.focus()
          if (at !== null) ta.setSelectionRange(at, at)
        })
      } else editor?.commands.focus()
    },
    [slash, editor],
  )

  const beginSlash = useCallback(
    (step: boolean) => {
      if (!slash) return
      slashStepping.current = step
      if (!step) return
      const r = slashRange.current
      slashRange.current = null
      if (!r) return
      if (slash.source === 'visual') {
        editor?.chain().focus().deleteRange(r).run()
      } else {
        const cur = valueRef.current
        emit(cur.slice(0, r.from) + cur.slice(r.to))
        rawInsertAt.current = r.from
      }
    },
    [slash, editor, emit],
  )

  const runSlash = useCallback(
    (result: SlashResult) => {
      const source = slash?.source
      const range = slashRange.current
      slashRange.current = null
      slashStepping.current = false
      setSlash(null)

      if (source === 'raw') {
        const from = range ? range.from : rawInsertAt.current ?? mdxRef.current?.selectionStart ?? valueRef.current.length
        const to = range ? range.to : from
        rawInsertAt.current = null
        if (result.kind === 'block') {
          if (result.id === 'image') {
            const cur = valueRef.current
            emit(cur.slice(0, from) + cur.slice(to))
            pendingImageInsert.current = from
            onPickImage()
            return
          }
          insertRaw(from, to, rawSnippet(result.id), true)
        } else if (result.kind === 'code') insertRaw(from, to, rawCodeFence(result.language), true)
        else if (result.kind === 'youtube') insertRaw(from, to, `${youtubeTag(result.id, result.title)}|`, true)
        else insertRaw(from, to, `${markdownLink(result.title, result.href)}|`, false)
        return
      }

      if (!editor) return
      const chain = () => (range ? editor.chain().focus().deleteRange(range) : editor.chain().focus())
      if (result.kind === 'block') {
        switch (result.id) {
          case 'h2':
            chain().setNode('heading', { level: 2 }).run()
            break
          case 'h3':
            chain().setNode('heading', { level: 3 }).run()
            break
          case 'bullet':
            chain().toggleBulletList().run()
            break
          case 'ordered':
            chain().toggleOrderedList().run()
            break
          case 'quote':
            chain().toggleBlockquote().run()
            break
          case 'divider':
            chain().setHorizontalRule().run()
            break
          case 'image':
            chain().run()
            onPickImage()
            break
        }
      } else if (result.kind === 'code') {
        const lang = result.language.trim().replace(/[^\w+#.-]/g, '')
        chain()
          .setCodeBlock(lang ? { language: lang } : undefined)
          .run()
      } else if (result.kind === 'youtube') {
        const text = result.title.trim() || 'Watch on YouTube'
        chain()
          .insertContent({ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'link', attrs: { href: youtubeWatchUrl(result.id) } }] }] })
          .run()
      } else {
        chain()
          .insertContent([
            { type: 'text', text: result.title, marks: [{ type: 'link', attrs: { href: result.href } }] },
            { type: 'text', text: ' ' },
          ])
          .run()
      }
    },
    [slash, editor, emit, insertRaw, onPickImage],
  )

  // Raw textarea: "/" trigger detection, keyboard forwarding, heading tracking.
  const onRawChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value
    emit(next)
    const caret = e.target.selectionStart
    reportHeading(headingIndexAt(next, caret))
    const trigger = e.target.selectionEnd === caret ? slashTriggerAt(next, caret) : null
    if (trigger) {
      const ta = e.target
      slashRange.current = { from: trigger.from, to: caret }
      slashAnchor.current = () => textareaCaretRect(ta, trigger.from)
      slashStepping.current = false
      setSlash({ source: 'raw', query: trigger.query, key: trigger.from })
    } else if (slash?.source === 'raw' && !slashStepping.current) {
      slashRange.current = null
      setSlash(null)
    }
  }
  const onRawKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slash?.source === 'raw' && !slashStepping.current && slashKeyRef.current?.(e.nativeEvent)) e.preventDefault()
  }
  const onRawSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) =>
    reportHeading(headingIndexAt(e.currentTarget.value, e.currentTarget.selectionStart))

  useImperativeHandle(
    handleRef,
    () => ({
      jumpToLine: (line: number, column = 1) => {
        setTabIndex(RAW)
        // The MDX panel must be visible before it can take focus.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const ta = mdxRef.current
            if (!ta) return
            const offset = offsetOfLineColumn(valueRef.current, line, column)
            ta.focus()
            ta.setSelectionRange(offset, offset)
            const lineHeight = Number.parseFloat(window.getComputedStyle(ta).lineHeight) || 22
            ta.scrollTop = Math.max(0, (Math.max(1, line) - 1) * lineHeight - ta.clientHeight / 3)
            ta.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' })
          }),
        )
      },
      focus: () => {
        if (tabRef.current === RAW) mdxRef.current?.focus()
        else editor?.commands.focus()
      },
    }),
    [editor, reducedMotion],
  )

  const slashAnchorRect = useCallback(() => slashAnchor.current(), [])
  const slashController = slash?.source === 'raw' ? mdxRef.current : editor ? (editor.view.dom as HTMLElement) : null

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
              {editor ? <Toolbar editor={editor} onPickImage={onPickImage} onLink={openLink} /> : null}
              <Box
                px={4}
                py={3}
                minH={minH}
                onClick={(e: React.MouseEvent) => {
                  if (e.target === e.currentTarget) editor?.commands.focus()
                }}
                sx={{
                  '.tt-prose': { minHeight: minH, outline: 'none' },
                  '.tt-prose p.is-editor-empty:first-of-type::before': {
                    content: 'attr(data-placeholder)',
                    color: 'page.muted',
                    float: 'left',
                    height: 0,
                    pointerEvents: 'none',
                  },
                  '.tt-prose h1': { fontSize: '28px', fontWeight: 600, mt: 4, mb: 2, letterSpacing: '-0.02em' },
                  '.tt-prose h2': { fontSize: '22px', fontWeight: 600, mt: 4, mb: 2, letterSpacing: '-0.015em' },
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
                  '.tt-prose code': { fontFamily: MONO, fontSize: '0.9em', bg: 'page.bg-overlay', px: 1, borderRadius: 'sm' },
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
                  '.tt-prose img.tt-image': { maxWidth: '100%', height: 'auto', borderRadius: 'md', my: 3 },
                  '.tt-prose img.tt-image.ProseMirror-selectednode': { outline: '2px solid', outlineColor: 'accent.500', outlineOffset: '2px' },
                  '.tt-prose a': { color: 'accent.text', textDecoration: 'underline', textUnderlineOffset: '2px' },
                  '.tt-prose hr': { my: 4, borderColor: 'page.border' },
                  '.tt-prose .suggestion': { color: 'accent.text' },
                }}
              >
                <EditorContent editor={editor} />
                {editor ? <EditorBubbles editor={editor} linkHandle={linkHandle} /> : null}
              </Box>
            </Box>
          </TabPanel>
          <TabPanel p={0}>
            <Textarea
              ref={mdxRef}
              value={value}
              onChange={onRawChange}
              onKeyDown={onRawKeyDown}
              onSelect={onRawSelect}
              onBlur={() => {
                if (!slashStepping.current) setSlash((s) => (s?.source === 'raw' ? null : s))
              }}
              minH={minH}
              spellCheck={false}
              fontFamily={MONO}
              fontSize="14px"
              lineHeight={1.6}
              placeholder={placeholder ? `${placeholder} Type / for blocks.` : 'Type / for blocks.'}
              aria-labelledby={labelledBy}
              aria-autocomplete="list"
              borderColor="page.border-strong"
              focusBorderColor="accent.500"
              bg="page.bg"
            />
            <HStack mt={2} spacing={3} flexWrap="wrap">
              <Button size="xs" {...outlineButtonProps} onClick={onPickImage}>
                Upload image → insert ![]()
              </Button>
              <Text fontSize="11px" color="page.fg-secondary" fontFamily={MONO}>
                Raw MDX — JSX components, tables and footnotes are safe here. Type / for blocks.
              </Text>
            </HStack>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <SlashMenu
        open={!!slash}
        query={slash?.query ?? ''}
        anchor={slashAnchorRect}
        anchorKey={slash?.key ?? 0}
        controller={slashController}
        keyRef={slashKeyRef}
        onBegin={beginSlash}
        onResult={runSlash}
        onClose={closeSlash}
      />

      <input ref={fileInputRef} type="file" accept={UPLOAD_ACCEPT} hidden onChange={onFileSelected} aria-hidden tabIndex={-1} />

      <AlertDialog isOpen={confirmVisual} leastDestructiveRef={cancelRef} onClose={() => setConfirmVisual(false)} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4}>
            <AlertDialogHeader fontSize="md">Open the visual editor?</AlertDialogHeader>
            <AlertDialogBody fontSize="sm">
              The first edit there re-saves the whole body in plain Markdown, which rewrites:
              <RiskList risks={risks} />
              <Text mt={3} color="page.fg-secondary">
                Viewing is harmless; nothing changes until you type.
              </Text>
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={cancelRef} size="sm" {...outlineButtonProps} onClick={() => setConfirmVisual(false)}>
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
