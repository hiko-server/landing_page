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
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  Textarea,
  Tooltip,
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
  FaImages,
  FaMinus,
  FaUndo,
  FaRedo,
} from 'react-icons/fa'
import { TbInfoCircle, TbTable } from 'react-icons/tb'
import { MONO, outlineButtonProps, primaryButtonProps } from './shell/ui'
import { baseExtensions } from './editor/extensions'
import { withNodeViews } from './editor/views/nodeViews'
import type { BlockMove } from './editor/nodes/blockMove'
import { EditorUiContext, type EditorUi } from './editor/views/editorUi'
import { markdownToDoc, visualFidelity, type VisualFidelity } from './editor/markdown/index'
import { createSlashCommand, type SlashBridge } from './editor/SlashCommand'
import SlashMenu, { type SlashResult } from './editor/SlashMenu'
import LinkBubble, { type LinkBubbleHandle } from './editor/LinkBubble'
import ImageBubble from './editor/ImageBubble'
import TableMenu from './editor/TableMenu'
import BlockHandle from './editor/BlockHandle'
import { UPLOAD_ACCEPT, altFromFileName, uploadImage, type UploadedImage } from './editor/upload'
import { CARET_MARK, markdownLink, rawCodeFence, rawSnippet, videoLine } from './editor/slashItems'
import { editorNodeSx } from './editor/editorStyles'
import { caseStudyTemplate } from './editor/caseStudyTemplate'
import { headingIndexAt, offsetOfLineColumn, slashTriggerAt, textareaCaretRect } from './editor/textareaCaret'
import { flushSync } from 'react-dom'
import { cssTransition } from '../../theme/tokens'
import { FindReplace } from './editor/findPlugin'
import { FocusBlock } from './editor/focusBlock'
import FindReplacePanel from './editor/FindReplacePanel'
import { scrollCaretToCenter } from './editor/typewriter'
import { imageMarkdown } from '../../lib/media/view'
import type { PickedImage } from './media/MediaPicker'
import { MediaPickerLazy as MediaPicker } from './media/LibraryPicker'
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
 *   - The Visual tab is TipTap with the Markdown bridge (editor/markdown:
 *     MDX ⇄ ProseMirror with the site's own parser): "/" opens the block
 *     menu, selecting text shows the formatting / link bubble, figures,
 *     videos, callouts and MDX blocks edit in place (editor/views), a table
 *     gets its toolbar (editor/TableMenu), every block a drag handle
 *     (editor/BlockHandle; Alt+↑ / ↓ from the keyboard), ⌘K edits links,
 *     pasted Markdown becomes structure.
 *   - The MDX tab is a plain textarea — the source itself. "/" opens the
 *     same block menu there (it inserts Markdown / MDX text).
 *
 * MDX safety: the Visual tab holds every construct exactly — what it does
 * not model as a block (JSX, {expressions}, import / export, footnotes,
 * reference links) is an MDX island kept verbatim. Before a body is shown
 * there it is checked (editor/markdown visualFidelity: parsed, written back
 * and compared). A body that does not parse opens on the MDX tab with the
 * error and its line; one the visual editor would rewrite (none are known)
 * opens there too and switching asks first.
 *
 * Image upload: toolbar, "/image", drag-and-drop and clipboard paste all go
 * to /api/admin/upload-image (resized, WebP variants); the image node keeps
 * the returned width / height. Failures become a toast. "Insert from the
 * media library" (toolbar, "/library", the MDX tab) opens the image picker
 * (media/MediaPicker, loaded on demand) with each image's default alt text
 * and caption (H7).
 *
 * Imperative handle (`handleRef`): `jumpToLine(line, column)` (opens the MDX
 * tab with the caret on a compile error), `focus()` and `openFind()`.
 *
 * Writing environment (H3): ⌘F / Ctrl+F while the editor has focus opens
 * find & replace on the active surface (editor/FindReplacePanel); with
 * `focusMode` every block but the one being written is dimmed
 * (editor/focusBlock); with `typewriter` the caret line stays at the same
 * height while typing (editor/typewriter, always an instant scroll).
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
  /** Open find & replace (the selection, when there is one, becomes the query). */
  openFind: () => void
}

// The media library's picker loads only when it is opened (H7).

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
  /** Focus mode: dim every block but the one with the caret. */
  focusMode?: boolean
  /** Typewriter scrolling: keep the caret line at a fixed height. */
  typewriter?: boolean
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
        minW="30px"
        h="30px"
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
  return <Box w="1px" h="20px" bg="page.border" mx={0.5} aria-hidden />
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
    table: ed.isActive('table'),
    callout: ed.isActive('callout'),
    canUndo: ed.can().undo(),
    canRedo: ed.can().redo(),
  }
}

/** Formatting toolbar; re-renders only when an active / enabled state changes. */
const Toolbar = React.memo(function Toolbar({
  editor,
  onPickImage,
  onPickLibrary,
  onLink,
}: {
  editor: Editor
  onPickImage: () => void
  onPickLibrary: () => void
  onLink: () => void
}) {
  const state = useEditorState({ editor, selector: ({ editor: ed }) => toolbarStateOf(ed), equalityFn: sameToolbarState })
  return (
    <HStack
      role="toolbar"
      aria-label="Formatting"
      spacing={0.5}
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
      <ToolbarButton
        label="Callout"
        icon={<TbInfoCircle size={15} />}
        onClick={() => (state.callout ? editor.chain().focus().unsetCallout().run() : editor.chain().focus().setCallout('note').run())}
        isActive={state.callout}
      />
      <ToolbarButton
        label="Table"
        icon={<TbTable size={15} />}
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3 }).run()}
        isActive={state.table}
        isDisabled={state.table}
      />
      <Divider />
      <ToolbarButton label="Link (⌘K)" icon={<FaLink size={12} />} onClick={onLink} isActive={state.link} />
      <ToolbarButton label="Insert image" icon={<FaImage size={12} />} onClick={onPickImage} />
      <ToolbarButton label="Insert from the media library" icon={<FaImages size={12} />} onClick={onPickLibrary} />
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
  announce,
}: {
  editor: Editor
  linkHandle: React.MutableRefObject<LinkBubbleHandle | null>
  announce: (message: string) => void
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
      <TableMenu editor={editor} announce={announce} />
    </>
  )
})

/** Why the visual editor cannot take this body, in words. */
function FidelityNote({ fidelity, onJump }: { fidelity: VisualFidelity; onJump: (line: number, column?: number) => void }) {
  if (fidelity.ok) return null
  if (fidelity.reason === 'parse') {
    const { message, line, column } = fidelity.problem
    return (
      <>
        This body is not valid MDX, so the visual editor cannot open it:{' '}
        <Text as="span" fontFamily={MONO} fontSize="12px">
          {message}
        </Text>
        {line ? (
          <Button size="xs" variant="link" ml={2} color="accent.text" onClick={() => onJump(line, column)}>
            Go to line {line}
          </Button>
        ) : null}
      </>
    )
  }
  return (
    <>
      The visual editor would rewrite part of this body{fidelity.line ? ` (from line ${fidelity.line})` : ''}, so it opens here. Opening the visual editor
      is harmless until you type.
      {fidelity.line ? (
        <Button size="xs" variant="link" ml={2} color="accent.text" onClick={() => onJump(fidelity.line as number)}>
          Go to line {fidelity.line}
        </Button>
      ) : null}
    </>
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
  focusMode = false,
  typewriter = false,
}: Props) {
  const toast = useToast()
  const reducedMotion = usePrefersReducedMotion()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mdxRef = useRef<HTMLTextAreaElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const linkHandle = useRef<LinkBubbleHandle | null>(null)

  // Can the visual editor hold this body exactly? Checked on load, for
  // values from outside, after MDX typing (debounced) and before switching.
  const [fidelity, setFidelity] = useState<VisualFidelity>(() => visualFidelity(value))
  // A body the visual editor cannot hold exactly opens on MDX.
  const [tabIndex, setTabIndex] = useState(() => (fidelity.ok ? VISUAL : RAW))
  const tabRef = useRef(tabIndex)
  tabRef.current = tabIndex
  const [confirmVisual, setConfirmVisual] = useState(false)
  // Polite announcements (block moves, table and node edits).
  const [live, setLive] = useState('')
  const announce = useCallback((message: string) => {
    setLive('')
    requestAnimationFrame(() => setLive(message))
  }, [])
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
  const [libraryOpen, setLibraryOpen] = useState(false)

  // ── Find & replace (H3) ─────────────────────────────────────────────────
  const [find, setFind] = useState<{ key: number; query: string } | null>(null)
  const openFindRef = useRef<() => void>(() => undefined)
  const typewriterRef = useRef(typewriter)
  typewriterRef.current = typewriter

  // useEditor compares these options on every render and reconfigures the
  // editor when one changed, so they must keep their identity.
  const announceRef = useRef(announce)
  announceRef.current = announce
  const extensions = useMemo(
    () =>
      withNodeViews(
        [...baseExtensions({ placeholder: placeholder || 'Write something… Type / for blocks.' }), slashExtension, FindReplace, FocusBlock].map((ext) =>
          // Alt+↑ / ↓ moves are announced in the live region.
          ext.name === 'blockMove' ? (ext as typeof BlockMove).configure({ onMove: (m: string) => announceRef.current(m) }) : ext,
        ),
      ),
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
        // ⌘F / Ctrl+F inside the editor opens find & replace (the browser's find elsewhere).
        if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
          event.preventDefault()
          event.stopPropagation()
          openFindRef.current()
          return true
        }
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

  const openFind = useCallback(() => {
    let query = ''
    if (tabRef.current === RAW) {
      const ta = mdxRef.current
      if (ta && ta.selectionEnd > ta.selectionStart) query = ta.value.slice(ta.selectionStart, ta.selectionEnd)
    } else if (editor && !editor.isDestroyed) {
      const { from, to } = editor.state.selection
      if (to > from) query = editor.state.doc.textBetween(from, to, ' ')
    }
    // A multi-line or very long selection is not a useful query.
    if (query.includes('\n') || query.length > 200) query = ''
    // Synchronously, so the bar has focus before the next keystroke arrives.
    flushSync(() => setFind((f) => ({ key: (f?.key ?? 0) + 1, query })))
  }, [editor])
  openFindRef.current = openFind

  // Typewriter scrolling in the visual editor.
  useEffect(() => {
    if (!editor || !typewriter) return
    const center = () => {
      if (editor.isDestroyed || !editor.view.hasFocus()) return
      scrollCaretToCenter(editor.view.coordsAtPos(editor.state.selection.head), editor.view.dom as HTMLElement)
    }
    editor.on('selectionUpdate', center)
    editor.on('update', center)
    return () => {
      editor.off('selectionUpdate', center)
      editor.off('update', center)
    }
  }, [editor, typewriter])

  // Values from outside (load, reload, draft restore) — anything but this
  // component's own echo: check them before the visual editor takes them.
  useEffect(() => {
    if (value === lastEmitted.current) return
    lastEmitted.current = value
    const check = visualFidelity(value)
    setFidelity(check)
    externalPending.current = check.ok
    if (!check.ok) setTabIndex(RAW)
  }, [value])

  // MDX typing: the check follows (debounced), so a fixed error clears.
  useEffect(() => {
    if (tabIndex !== RAW) return
    const t = window.setTimeout(() => setFidelity(visualFidelity(valueRef.current)), 450)
    return () => window.clearTimeout(t)
  }, [value, tabIndex])

  // The banner below the tabs is not a live region: its parser message
  // changes at every pause while a component is typed, and re-reading it
  // each time would talk over the typing. Only its coming and going is
  // announced (politely); the words are in the banner, and in the dialog a
  // switch to Visual opens.
  const fidelityState = fidelity.ok ? 'ok' : fidelity.reason
  const announcedFidelity = useRef(fidelityState)
  useEffect(() => {
    const was = announcedFidelity.current
    if (was === fidelityState) return
    announcedFidelity.current = fidelityState
    announce(
      fidelityState === 'parse'
        ? 'This body is not valid MDX yet, so the visual editor cannot open it.'
        : fidelityState === 'lossy'
          ? 'The visual editor would rewrite part of this body.'
          : was === 'parse'
            ? 'The MDX is valid again.'
            : 'The visual editor can open this body again.',
    )
  }, [fidelityState, announce])

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
    if (i === VISUAL) {
      const check = visualFidelity(valueRef.current)
      setFidelity(check)
      if (!check.ok) {
        setConfirmVisual(true)
        return
      }
    }
    setTabIndex(i)
  }

  const onPickImage = useCallback(() => fileInputRef.current?.click(), [])
  const onPickLibrary = useCallback(() => setLibraryOpen(true), [])
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
      const mark = snippet.includes(CARET_MARK) ? CARET_MARK : '|'
      const caretInSnippet = snippet.includes(mark) ? snippet.indexOf(mark) : snippet.length
      const text = snippet.replace(mark, '')
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

  /** An image from the media library, with the alt text and caption chosen in the picker. */
  const insertFromLibrary = useCallback(
    (img: PickedImage) => {
      if (tabRef.current === RAW) {
        const ta = mdxRef.current
        const cur = valueRef.current
        const at = pendingImageInsert.current ?? (ta ? ta.selectionStart : cur.length)
        const end = pendingImageInsert.current ?? (ta ? ta.selectionEnd : cur.length)
        insertRaw(at, end, `${imageMarkdown(img.url, img.alt, img.caption)}|`, true)
      } else if (editor) {
        editor
          .chain()
          .focus()
          .setImage({ src: img.url, alt: img.alt || undefined, title: img.caption || undefined, width: img.width ?? undefined, height: img.height ?? undefined })
          .run()
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
          if (result.id === 'image' || result.id === 'library') {
            const cur = valueRef.current
            emit(cur.slice(0, from) + cur.slice(to))
            pendingImageInsert.current = from
            if (result.id === 'library') onPickLibrary()
            else onPickImage()
            return
          }
          // The MDX tab is source already: "MDX block" is a Visual-tab command.
          if (result.id === 'mdx') return
          insertRaw(from, to, rawSnippet(result.id), true)
        } else if (result.kind === 'code') insertRaw(from, to, rawCodeFence(result.language), true)
        else if (result.kind === 'video') insertRaw(from, to, `${videoLine(result.url, result.title)}|`, true)
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
          case 'library':
            chain().run()
            onPickLibrary()
            break
          case 'note':
          case 'tip':
          case 'important':
          case 'warning':
          case 'caution':
            // Written as `> [!NOTE] …`: the compiler turns it into a callout (lib/rehype/alerts.ts).
            chain().setCallout(result.id).run()
            break
          case 'table':
            chain().insertTable({ rows: 3, cols: 3 }).run()
            announce('Table inserted: 3 columns, a header row and 2 rows. Tab moves between cells.')
            break
          case 'mdx':
            chain().insertMdxBlock('').run()
            break
          case 'outline':
            // The whole outline: its guidance notes (MDX comments) are MDX blocks here.
            chain()
              .insertContent(markdownToDoc(caseStudyTemplate()).content ?? [])
              .run()
            break
        }
      } else if (result.kind === 'code') {
        const lang = result.language.trim().replace(/[^\w+#.-]/g, '')
        chain()
          .setCodeBlock(lang ? { language: lang } : undefined)
          .run()
      } else if (result.kind === 'video') {
        // The video block: a link alone in its paragraph, which compiles to the click-to-load player.
        chain()
          .insertVideo({ url: result.url, title: result.title.trim() || null })
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
    [slash, editor, emit, insertRaw, onPickImage, onPickLibrary, announce],
  )

  // Raw textarea: "/" trigger detection, keyboard forwarding, heading tracking.
  const onRawChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value
    emit(next)
    const caret = e.target.selectionStart
    reportHeading(headingIndexAt(next, caret))
    if (typewriterRef.current) scrollCaretToCenter(textareaCaretRect(e.target, caret), e.target, { self: true })
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
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      openFind()
      return
    }
    if (slash?.source === 'raw' && !slashStepping.current && slashKeyRef.current?.(e.nativeEvent)) e.preventDefault()
  }
  const onRawSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) =>
    reportHeading(headingIndexAt(e.currentTarget.value, e.currentTarget.selectionStart))

  const jumpToLine = useCallback(
    (line: number, column = 1) => {
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
    [reducedMotion],
  )

  useImperativeHandle(
    handleRef,
    () => ({
      jumpToLine,
      focus: () => {
        if (tabRef.current === RAW) mdxRef.current?.focus()
        else editor?.commands.focus()
      },
      openFind,
    }),
    [editor, jumpToLine, openFind],
  )

  // Node views reach the upload pipeline and the live region through this.
  const editorUi = useMemo<EditorUi>(
    () => ({
      upload: async (file: File) => {
        try {
          const img = await uploadImage(file)
          if (img.warning) toast({ status: 'warning', title: 'Image uploaded', description: img.warning, position: 'bottom-right' })
          return img
        } catch (err) {
          notifyRef.current(err)
          return null
        }
      },
      announce,
    }),
    [announce, toast],
  )

  const surfaceRef = useRef<HTMLDivElement>(null)

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

        {!fidelity.ok ? (
          <Alert
            // Not role="alert": see the announcement effect above.
            addRole={false}
            status={fidelity.reason === 'parse' ? 'error' : 'warning'}
            variant="left-accent"
            borderRadius="md"
            mb={3}
            alignItems="flex-start"
            bg="page.bg-elevated"
            fontSize="sm"
            data-testid="visual-fidelity"
          >
            <AlertIcon mt={0.5} />
            <AlertDescription>
              <FidelityNote fidelity={fidelity} onJump={jumpToLine} />
            </AlertDescription>
          </Alert>
        ) : null}

        {find ? (
          <FindReplacePanel
            mode={tabIndex === RAW ? 'raw' : 'visual'}
            editor={editor}
            textarea={mdxRef}
            value={value}
            onRawChange={emit}
            initialQuery={find.query}
            openKey={find.key}
            onClose={() => setFind(null)}
          />
        ) : null}

        <TabPanels>
          <TabPanel p={0}>
            <Box border="1px solid" borderColor="page.border-strong" borderRadius="lg" bg="page.bg">
              {editor ? <Toolbar editor={editor} onPickImage={onPickImage} onPickLibrary={onPickLibrary} onLink={openLink} /> : null}
              <Box
                ref={surfaceRef}
                position="relative"
                pl={{ base: 9, md: 10 }}
                pr={{ base: 4, md: 6 }}
                py={3}
                minH={minH}
                onClick={(e: React.MouseEvent) => {
                  if (e.target === e.currentTarget) editor?.commands.focus()
                }}
                sx={{
                  ...editorNodeSx,
                  '.tt-prose': { minHeight: minH, outline: 'none' },
                  '.tt-prose p.is-editor-empty:first-of-type::before': {
                    content: 'attr(data-placeholder)',
                    color: 'page.fg-subtle',
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
                  // Find & replace highlights (editor/findPlugin): matches on a soft
                  // yellow wash, the current one on the accent fill (white text, ≥ 4.5:1).
                  '.tt-prose .tt-find-match': { bg: 'rgba(250, 204, 21, 0.3)', borderRadius: '2px' },
                  '.tt-prose .tt-find-current': { bg: 'accent.solid', color: 'accent.fg', borderRadius: '2px' },
                  '@media (forced-colors: active)': {
                    '.tt-prose .tt-find-match': { outline: '1px solid CanvasText' },
                    '.tt-prose .tt-find-current': { outline: '2px solid Highlight', forcedColorAdjust: 'none', bg: 'Highlight', color: 'HighlightText' },
                  },
                  // Focus mode (H3): while the editor has focus, every top-level block
                  // but the one with the caret turns to the subtle text colour — still
                  // AA (≥ 4.5:1) in both themes, so nothing becomes unreadable — and
                  // images fade. The colour eases on the standard duration (0 ms under
                  // reduced motion).
                  ...(focusMode
                    ? {
                        '.tt-prose.ProseMirror-focused > :not(.tt-focus-block), .tt-prose.ProseMirror-focused > :not(.tt-focus-block) *': {
                          color: 'page.fg-subtle',
                          borderColor: 'page.border',
                        },
                        '.tt-prose.ProseMirror-focused > :not(.tt-focus-block) img': { opacity: 0.45 },
                        '.tt-prose > *, .tt-prose > * *': { transition: cssTransition(['color', 'opacity'], 'base') },
                      }
                    : {}),
                  // Typewriter scrolling: room under the last line, so it can rise to the typing line too.
                  ...(typewriter ? { '.tt-prose': { minHeight: minH, outline: 'none', paddingBottom: '45vh' } } : {}),
                }}
              >
                <EditorUiContext.Provider value={editorUi}>
                  <EditorContent editor={editor} />
                </EditorUiContext.Provider>
                {editor ? <EditorBubbles editor={editor} linkHandle={linkHandle} announce={announce} /> : null}
                {editor && tabIndex === VISUAL ? <BlockHandle editor={editor} surface={surfaceRef} announce={announce} /> : null}
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
              focusBorderColor="accent.500"
              bg="page.bg"
            />
            <HStack mt={2} spacing={3} flexWrap="wrap">
              <Button size="xs" {...outlineButtonProps} onClick={onPickImage}>
                Upload image → insert ![]()
              </Button>
              <Button size="xs" {...outlineButtonProps} onClick={onPickLibrary}>
                Insert from library…
              </Button>
              <Text fontSize="11px" color="page.fg-secondary" fontFamily={MONO}>
                The MDX source. Type / for blocks.
              </Text>
            </HStack>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <SlashMenu
        open={!!slash}
        query={slash?.query ?? ''}
        surface={slash?.source === 'raw' ? 'raw' : 'visual'}
        anchor={slashAnchorRect}
        anchorKey={slash?.key ?? 0}
        controller={slashController}
        keyRef={slashKeyRef}
        onBegin={beginSlash}
        onResult={runSlash}
        onClose={closeSlash}
      />

      <input ref={fileInputRef} type="file" accept={UPLOAD_ACCEPT} hidden onChange={onFileSelected} aria-hidden tabIndex={-1} />

      {libraryOpen ? (
        <MediaPicker
          isOpen
          onClose={() => {
            setLibraryOpen(false)
            pendingImageInsert.current = null
          }}
          onPick={insertFromLibrary}
        />
      ) : null}

      <Box aria-live="polite" role="status" srOnly data-testid="editor-live">
        {live}
      </Box>

      <AlertDialog isOpen={confirmVisual} leastDestructiveRef={cancelRef} finalFocusRef={mdxRef} onClose={() => setConfirmVisual(false)} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4}>
            <AlertDialogHeader fontSize="md">{!fidelity.ok && fidelity.reason === 'parse' ? 'Fix the MDX first' : 'Open the visual editor?'}</AlertDialogHeader>
            <AlertDialogBody fontSize="sm">
              <FidelityNote
                fidelity={fidelity}
                onJump={(line, column) => {
                  setConfirmVisual(false)
                  jumpToLine(line, column)
                }}
              />
              {!fidelity.ok && fidelity.reason === 'lossy' ? (
                <Text mt={3} color="page.fg-secondary">
                  Viewing is harmless; the first edit there writes the whole body again.
                </Text>
              ) : null}
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={cancelRef} size="sm" {...outlineButtonProps} onClick={() => setConfirmVisual(false)}>
                Stay in MDX
              </Button>
              {!fidelity.ok && fidelity.reason === 'lossy' ? (
                <Button
                  size="sm"
                  {...primaryButtonProps}
                  onClick={() => {
                    setConfirmVisual(false)
                    externalPending.current = true
                    setTabIndex(VISUAL)
                  }}
                >
                  Open visual editor
                </Button>
              ) : null}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  )
}
