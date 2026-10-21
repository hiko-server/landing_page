import React, { useEffect, useId, useRef, useState } from 'react'
import { Box, Button, ButtonGroup, Flex, IconButton, Input, Text, Tooltip } from '@chakra-ui/react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { TbPhoto, TbReplace, TbTrash } from 'react-icons/tb'
import { figureWidthOfSrc, withWidthFragment, type FigureWidth } from '../../../../lib/rehype/galleries'
import { isFilenameAlt } from '../../shell/publishChecks'
import { UPLOAD_ACCEPT } from '../upload'
import { MONO } from '../../shell/ui'
import { tabStop, useEditorUi } from './editorUi'

/**
 * A figure in the visual editor (an image alone in its paragraph), edited
 * the way the site shows it (components/MDX/Figure):
 *
 *   - the caption under the image is the image's title — typed in place;
 *     with no title the site shows the alt text instead (when it is real
 *     text), which the placeholder says;
 *   - alt text: missing alt opens a prompt under the image (and the
 *     publish checklist flags it); a file-name alt gets a hint;
 *   - width on the page: text column, wide or full (`#wide` / `#full`,
 *     lib/rehype/galleries.ts) — previewed in the editor;
 *   - replace (upload another file, keeping the caption, alt and width) or
 *     remove. The toolbar shows while the figure is selected.
 */

const WIDTHS: Array<{ value: FigureWidth | null; label: string; hint: string }> = [
  { value: null, label: 'Text', hint: 'As wide as the text' },
  { value: 'wide', label: 'Wide', hint: 'Wider than the text, up to 64rem' },
  { value: 'full', label: 'Full', hint: 'The full column; edge to edge on phones' },
]

export default function ImageView({ node, editor, getPos, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const ui = useEditorUi()
  const id = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const altRef = useRef<HTMLInputElement>(null)
  const src = String(node.attrs.src || '')
  const width = figureWidthOfSrc(src)
  const alt = String(node.attrs.alt || '')
  const title = String(node.attrs.title || '')
  const intrinsicW = Number(node.attrs.width) || undefined
  const intrinsicH = Number(node.attrs.height) || undefined
  const missingAlt = !alt.trim()
  const fileNameAlt = !missingAlt && isFilenameAlt(alt)
  const [altOpen, setAltOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const showTools = selected || focusWithin

  // The alt field is open while alt text is missing (the prompt) or on request.
  const altVisible = altOpen || missingAlt

  useEffect(() => {
    if (altOpen && !missingAlt) requestAnimationFrame(() => altRef.current?.focus())
    // Focus only when opened on request, not while typing the first characters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [altOpen])
  // Once the figure is left with alt text, the field folds back into the toolbar's Alt button.
  useEffect(() => {
    if (!selected && !focusWithin && !missingAlt) setAltOpen(false)
  }, [selected, focusWithin, missingAlt])

  const pos = () => (typeof getPos === 'function' ? getPos() : null)

  /** Back to the document: the figure selected (Esc) or the line after it (Enter). */
  const leave = (where: 'select' | 'after') => {
    const at = pos()
    if (typeof at !== 'number') return
    const { state, view } = editor
    const self = state.doc.nodeAt(at)
    if (!self) return
    if (where === 'select') view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, at)))
    else {
      const after = at + self.nodeSize
      const next = state.doc.nodeAt(after)
      const tr = state.tr
      if (!next || !next.isTextblock) tr.insert(after, state.schema.nodes.paragraph.create())
      tr.setSelection(TextSelection.create(tr.doc, after + 1))
      view.dispatch(tr.scrollIntoView())
    }
    editor.commands.focus()
  }

  const setWidth = (w: FigureWidth | null) => {
    if (w === width) return
    updateAttributes({ src: withWidthFragment(src, w) })
    ui.announce(`Image width: ${WIDTHS.find((x) => x.value === w)?.label ?? 'Text'}.`)
  }

  const replace = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const img = await ui.upload(file)
      if (img) {
        updateAttributes({ src: withWidthFragment(img.url, width), width: img.width, height: img.height })
        ui.announce('Image replaced.')
      }
    } finally {
      setBusy(false)
    }
  }

  const display = withWidthFragment(src, null)
  const captionPlaceholder = alt.trim() && !fileNameAlt ? 'Caption (empty: the alt text is shown)' : 'Add a caption (optional)'

  return (
    <NodeViewWrapper
      as="figure"
      className={`tt-figure${width ? ` tt-figure-${width}` : ''}`}
      data-selected={selected || undefined}
      onFocus={() => setFocusWithin(true)}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false)
      }}
    >
      <Box className="tt-figure-frame" position="relative" data-drag-handle>
        {display ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={display} alt={alt} width={intrinsicW} height={intrinsicH} draggable={false} />
        ) : (
          <Flex aspectRatio="16 / 10" align="center" justify="center" color="page.fg-subtle">
            <TbPhoto size={28} aria-hidden />
          </Flex>
        )}
        {width ? (
          <Text as="span" className="tt-figure-badge" contentEditable={false} aria-hidden>
            {width === 'wide' ? 'Wide' : 'Full width'}
          </Text>
        ) : null}
        <Flex
          className="tt-figure-tools"
          contentEditable={false}
          suppressContentEditableWarning
          data-visible={showTools || undefined}
          position="absolute"
          top={2}
          right={2}
          gap={1}
          p={1}
          bg="page.bg-elevated"
          border="1px solid"
          borderColor="page.border-strong"
          borderRadius="lg"
          boxShadow="0 6px 20px rgba(0,0,0,0.18)"
          align="center"
          role="toolbar"
          aria-label="Image"
        >
          <ButtonGroup size="xs" isAttached variant="outline" role="group" aria-label="Width on the page">
            {WIDTHS.map((w) => (
              <Tooltip key={w.label} label={w.hint} openDelay={400} hasArrow placement="top">
                <Button
                  aria-pressed={width === w.value}
                  onClick={() => setWidth(w.value)}
                  bg={width === w.value ? 'var(--accent-soft)' : 'transparent'}
                  borderColor="page.border-strong"
                  fontWeight={width === w.value ? 600 : 400}
                  tabIndex={tabStop(showTools)}
                >
                  {w.label}
                </Button>
              </Tooltip>
            ))}
          </ButtonGroup>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setAltOpen((o) => !o)}
            aria-expanded={altVisible}
            aria-controls={`${id}-alt`}
            tabIndex={tabStop(showTools)}
            gap={1}
          >
            {missingAlt ? <Box as="span" w="6px" h="6px" borderRadius="full" bg="status.error" aria-hidden /> : null}
            Alt
          </Button>
          <Tooltip label="Replace the image" openDelay={400} hasArrow placement="top">
            <IconButton size="xs" variant="ghost" aria-label="Replace the image" icon={<TbReplace size={14} />} isLoading={busy} onClick={() => fileRef.current?.click()} tabIndex={tabStop(showTools)} />
          </Tooltip>
          <Tooltip label="Remove the image" openDelay={400} hasArrow placement="top">
            <IconButton
              size="xs"
              variant="ghost"
              aria-label="Remove the image"
              icon={<TbTrash size={14} />}
              onClick={() => {
                deleteNode()
                ui.announce('Image removed.')
                editor.commands.focus()
              }}
              tabIndex={tabStop(showTools)}
            />
          </Tooltip>
        </Flex>
        <input ref={fileRef} type="file" accept={UPLOAD_ACCEPT} hidden aria-hidden tabIndex={-1} onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          void replace(file)
        }} />
      </Box>

      <Box contentEditable={false} suppressContentEditableWarning>
        <Input
          className="tt-figure-caption"
          variant="unstyled"
          value={title}
          onChange={(e) => updateAttributes({ title: e.target.value || null })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              leave('after')
            } else if (e.key === 'Escape') {
              e.preventDefault()
              leave('select')
            }
          }}
          placeholder={captionPlaceholder}
          aria-label="Caption"
          tabIndex={tabStop(showTools)}
          autoComplete="off"
        />
        {altVisible ? (
          <Box id={`${id}-alt`} className="tt-figure-alt" mt={1} mx="auto" maxW="560px" textAlign="left">
            <Flex as="label" htmlFor={`${id}-alt-input`} align="center" gap={1.5} fontSize="12px" color="page.fg-secondary" mb={1}>
              Alt text
              {missingAlt ? (
                <Flex as="span" align="center" gap={1} color="status.error" fontWeight={500}>
                  <Box as="span" w="6px" h="6px" borderRadius="full" bg="status.error" aria-hidden />
                  Missing — describe what the image shows
                </Flex>
              ) : null}
            </Flex>
            <Input
              ref={altRef}
              id={`${id}-alt-input`}
              size="sm"
              value={alt}
              onChange={(e) => {
                // The prompt stays open while the alt text is being typed.
                setAltOpen(true)
                updateAttributes({ alt: e.target.value || null })
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  e.preventDefault()
                  if (alt.trim()) setAltOpen(false)
                  leave('select')
                }
              }}
              placeholder="What the image shows"
              isInvalid={missingAlt}
              aria-describedby={`${id}-alt-hint`}
              autoComplete="off"
              bg="page.bg"
            />
            <Text id={`${id}-alt-hint`} fontSize="11px" color={fileNameAlt ? 'status.warning' : 'page.fg-secondary'} mt={1}>
              {fileNameAlt ? 'That looks like a file name — describe the picture instead.' : 'Read aloud by screen readers; shown if the image cannot load.'}
            </Text>
          </Box>
        ) : null}
        {src && !src.startsWith('/') ? (
          <Text fontSize="11px" fontFamily={MONO} color="page.fg-secondary" textAlign="center" mt={1}>
            Hosted elsewhere — Content health can copy it into your uploads.
          </Text>
        ) : null}
      </Box>
    </NodeViewWrapper>
  )
}
