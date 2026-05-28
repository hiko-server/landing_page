import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  HStack,
  IconButton,
  Input,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Textarea,
  Tooltip,
  useColorModeValue,
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

/**
 * RichEditor — dual-mode WYSIWYG / raw-MDX editor used by all admin content
 * surfaces (/admin/now, /admin/uses, /admin/blog/edit, /admin/work/edit).
 *
 * Architecture:
 *   - Single source of truth is the markdown string the parent owns (`value`).
 *   - GUI tab mounts TipTap with `tiptap-markdown` so it round-trips md⇆html.
 *   - MDX tab is a plain Textarea — the escape hatch for custom JSX/MDX
 *     blocks that TipTap can't model. Switching tabs flushes the editor's
 *     markdown back to the parent so no edits are lost.
 *
 * Image upload:
 *   - Toolbar button, drag-and-drop and clipboard paste all hit
 *     /api/admin/upload-image. The endpoint stores under /public/uploads/ and
 *     returns a public URL, which is inserted at the caret as `![](url)`.
 *
 * Why TipTap (vs Novel/BlockNote/lexical):
 *   - ProseMirror under the hood — the same engine Linear, Substack and
 *     GitLab use. Plugin ecosystem is the broadest in the JS editor space.
 *   - `tiptap-markdown` provides lossless markdown round-trip out of the box.
 *   - Tiny bundle compared to Novel.sh's full Notion clone (~120kB vs ~400kB).
 *
 * MDX caveat: TipTap renders markdown, so JSX like `<MyComponent/>` or
 * `<Callout>...</Callout>` will be preserved as inline HTML when switching
 * GUI → MDX, but cannot be edited visually. Use the MDX tab for those blocks.
 */

type Props = {
  value: string
  onChange: (next: string) => void
  minH?: string
  placeholder?: string
}

// File -> dataURL helper for the upload-image endpoint contract.
function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function uploadImage(file: File): Promise<string> {
  const dataUrl = await fileToDataURL(file)
  const safeName = `${Date.now()}-${file.name}`
  const res = await fetch('/api/admin/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: safeName, dataUrl }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.error || 'Upload failed')
  }
  const { url } = await res.json()
  return url as string
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
  const activeBg = useColorModeValue('purple.100', 'whiteAlpha.300')
  return (
    <Tooltip label={label} openDelay={300} hasArrow placement="top">
      <IconButton
        aria-label={label}
        icon={icon}
        size="sm"
        variant="ghost"
        onClick={onClick}
        isDisabled={isDisabled}
        bg={isActive ? activeBg : undefined}
        borderRadius="6px"
      />
    </Tooltip>
  )
}

function Toolbar({
  editor,
  onPickImage,
}: {
  editor: Editor | null
  onPickImage: () => void
}) {
  const border = useColorModeValue('gray.200', 'whiteAlpha.200')
  const bg = useColorModeValue('white', 'gray.800')

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
      spacing={1}
      p={2}
      borderBottom="1px solid"
      borderColor={border}
      bg={bg}
      borderTopRadius="6px"
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
        label="Strike"
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
      <Box w="1px" h="20px" bg={border} mx={1} />
      <ToolbarButton
        label="Bullet list"
        icon={<FaListUl size={12} />}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
      />
      <ToolbarButton
        label="Ordered list"
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
      <Box w="1px" h="20px" bg={border} mx={1} />
      <ToolbarButton label="Link" icon={<FaLink size={12} />} onClick={setLink} isActive={editor.isActive('link')} />
      <ToolbarButton label="Insert image" icon={<FaImage size={12} />} onClick={onPickImage} />
      <Box w="1px" h="20px" bg={border} mx={1} />
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

export default function RichEditor({ value, onChange, minH = '520px', placeholder }: Props) {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tabIndex, setTabIndex] = useState(0) // 0 = GUI, 1 = MDX
  // Track the value we last applied to TipTap so we don't loop when we
  // re-receive the same markdown back from the parent.
  const lastCommittedRef = useRef<string>(value)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: { HTMLAttributes: { class: 'tt-codeblock' } } }),
      Image.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'tt-image' } }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      Placeholder.configure({ placeholder: placeholder || 'Write something…' }),
      Typography,
      // tiptap-markdown bridges Markdown ↔ ProseMirror. Linkify keeps raw URLs
      // formatted; transformPastedText preserves Markdown pasted from a doc.
      Markdown.configure({
        html: true,
        linkify: true,
        breaks: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: value,
    onUpdate: ({ editor: ed }) => {
      // tiptap-markdown exposes `storage.markdown.getMarkdown()`.
      const md = (ed.storage as any).markdown?.getMarkdown?.() ?? ed.getHTML()
      lastCommittedRef.current = md
      onChange(md)
    },
    editorProps: {
      attributes: {
        class: 'tt-prose',
      },
      // Drag-and-drop images.
      handleDrop(view, event) {
        const files = event.dataTransfer?.files
        if (!files || files.length === 0) return false
        const imageFile = Array.from(files).find((f) => f.type.startsWith('image/'))
        if (!imageFile) return false
        event.preventDefault()
        uploadImage(imageFile)
          .then((url) => {
            const { schema } = view.state
            const node = schema.nodes.image.create({ src: url, alt: imageFile.name })
            const tr = view.state.tr.replaceSelectionWith(node)
            view.dispatch(tr)
          })
          .catch((e) => toast({ status: 'error', title: e?.message || 'Upload failed' }))
        return true
      },
      // Paste images from clipboard.
      handlePaste(view, event) {
        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (!file) continue
            event.preventDefault()
            uploadImage(file)
              .then((url) => {
                const { schema } = view.state
                const node = schema.nodes.image.create({ src: url, alt: file.name })
                const tr = view.state.tr.replaceSelectionWith(node)
                view.dispatch(tr)
              })
              .catch((e) => toast({ status: 'error', title: e?.message || 'Upload failed' }))
            return true
          }
        }
        return false
      },
    },
    // SSR-safe init: TipTap renders empty on server, hydrates client-side.
    immediatelyRender: false,
  })

  // Push external value changes (e.g. parent loaded data) into the editor.
  useEffect(() => {
    if (!editor) return
    if (value === lastCommittedRef.current) return
    const md = (editor.storage as any).markdown?.getMarkdown?.() ?? editor.getHTML()
    if (md === value) return
    lastCommittedRef.current = value
    editor.commands.setContent(value || '', { emitUpdate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor])

  // When switching to GUI tab, push the latest raw MDX into the editor so
  // edits made in the Textarea show up immediately.
  useEffect(() => {
    if (!editor) return
    if (tabIndex === 0 && value !== lastCommittedRef.current) {
      lastCommittedRef.current = value
      editor.commands.setContent(value || '', { emitUpdate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabIndex])

  const onPickImage = useCallback(() => fileInputRef.current?.click(), [])

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file || !editor) return
    try {
      const url = await uploadImage(file)
      editor.chain().focus().setImage({ src: url, alt: file.name }).run()
    } catch (err: any) {
      toast({ status: 'error', title: err?.message || 'Upload failed' })
    }
  }

  const border = useColorModeValue('gray.200', 'whiteAlpha.200')
  const editorBg = useColorModeValue('white', 'gray.900')

  return (
    <Box>
      <Tabs index={tabIndex} onChange={setTabIndex} variant="soft-rounded" colorScheme="purple" size="sm" mb={3}>
        <TabList>
          <Tab>GUI</Tab>
          <Tab>MDX</Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0}>
            <Box border="1px solid" borderColor={border} borderRadius="8px" bg={editorBg}>
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
                    color: 'gray.400',
                    float: 'left',
                    height: 0,
                    pointerEvents: 'none',
                  },
                  '.tt-prose h1': { fontSize: '28px', fontWeight: 600, mt: 4, mb: 2 },
                  '.tt-prose h2': { fontSize: '22px', fontWeight: 600, mt: 4, mb: 2 },
                  '.tt-prose h3': { fontSize: '18px', fontWeight: 600, mt: 3, mb: 2 },
                  '.tt-prose p': { my: 2, lineHeight: 1.7 },
                  '.tt-prose ul, .tt-prose ol': { pl: 6, my: 2 },
                  '.tt-prose ul': { listStyleType: 'disc' },
                  '.tt-prose ol': { listStyleType: 'decimal' },
                  '.tt-prose blockquote': {
                    borderLeft: '3px solid',
                    borderColor: border,
                    pl: 4,
                    color: 'gray.500',
                    my: 3,
                  },
                  '.tt-prose code': {
                    fontFamily: 'var(--font-geist-mono), monospace',
                    fontSize: '0.9em',
                    bg: useColorModeValue('gray.100', 'whiteAlpha.100'),
                    px: 1,
                    borderRadius: '3px',
                  },
                  '.tt-prose pre.tt-codeblock': {
                    fontFamily: 'var(--font-geist-mono), monospace',
                    fontSize: '13px',
                    bg: useColorModeValue('gray.50', 'blackAlpha.500'),
                    p: 3,
                    borderRadius: '6px',
                    overflow: 'auto',
                    my: 3,
                  },
                  '.tt-prose img.tt-image': {
                    maxWidth: '100%',
                    borderRadius: '6px',
                    my: 3,
                  },
                  '.tt-prose a': { color: 'purple.400', textDecoration: 'underline' },
                  '.tt-prose hr': { my: 4, borderColor: border },
                }}
              >
                <EditorContent editor={editor} />
              </Box>
            </Box>
          </TabPanel>
          <TabPanel px={0}>
            <Textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              minH={minH}
              fontFamily="var(--font-geist-mono), monospace"
              fontSize="14px"
              placeholder={placeholder}
            />
            <HStack mt={2} spacing={2}>
              <Button size="xs" variant="outline" onClick={onPickImage}>
                Upload image → insert ![]()
              </Button>
              <Box fontSize="11px" color="gray.500" fontFamily="var(--font-geist-mono), monospace">
                Raw MDX — JSX components live here.
              </Box>
            </HStack>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        display="none"
        onChange={onFileSelected}
      />
    </Box>
  )
}
