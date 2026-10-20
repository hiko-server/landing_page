import { useEffect, useId, useState } from 'react'
import { Box, Button, ButtonGroup, Flex, Input, Text } from '@chakra-ui/react'
import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { NodeSelection } from '@tiptap/pm/state'
import { isFilenameAlt } from '../shell/publishChecks'
import { figureWidthOfSrc, withWidthFragment, type FigureWidth } from '../../../lib/rehype/galleries'

/**
 * Bubble shown on a selected inline image in the visual editor (an image
 * that shares its paragraph with text or other images — figures have their
 * own controls, views/ImageView): its alt text, edited in place
 * (updateAttributes), with a red dot and "Alt missing" while it is empty,
 * or a hint when it is just a file name; and — for an image in a row of
 * images only (a gallery) — the gallery's width on the page: text column,
 * wide or full (a `#wide` / `#full` fragment on the source,
 * lib/rehype/galleries.ts; the widest any image asks for wins).
 */

const WIDTHS: Array<{ value: FigureWidth | null; label: string }> = [
  { value: null, label: 'Text' },
  { value: 'wide', label: 'Wide' },
  { value: 'full', label: 'Full' },
]

export const IMAGE_BUBBLE_KEY = 'imageBubble'

const POP_CSS = {
  '@keyframes bubbleIn': { from: { opacity: 0, transform: 'scale(0.98)' }, to: { opacity: 1, transform: 'none' } },
  animation: 'bubbleIn 120ms cubic-bezier(0.22, 1, 0.36, 1)',
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
}

const TYPE = 'inlineImage'

/** True when the selected inline image's paragraph holds only images (a gallery row). */
function inGallery(editor: Editor): boolean {
  const sel = editor.state.selection
  if (!(sel instanceof NodeSelection)) return false
  const parent = sel.$from.parent
  let images = 0
  let other = false
  parent.forEach((n) => {
    if (n.type.name === TYPE) images++
    else if (!(n.isText && !(n.text || '').trim()) && n.type.name !== 'hardBreak') other = true
  })
  return images >= 2 && !other
}

export default function ImageBubble({ editor }: { editor: Editor }) {
  const inputId = useId()
  const active = editor.isActive(TYPE)
  const current = active ? String(editor.getAttributes(TYPE).alt || '') : ''
  const src = active ? String(editor.getAttributes(TYPE).src || '') : ''
  const srcWidth = figureWidthOfSrc(src)
  const gallery = active && inGallery(editor)
  const [alt, setAlt] = useState(current)
  const [width, setWidth] = useState<FigureWidth | null>(srcWidth)

  // Follow the selected image (another image, or an undo).
  useEffect(() => setAlt(current), [current])
  useEffect(() => setWidth(srcWidth), [srcWidth])

  const commit = (value: string) => {
    setAlt(value)
    editor.chain().updateAttributes(TYPE, { alt: value.trim() || null }).run()
  }

  const missing = !alt.trim()
  const fileName = !missing && isFilenameAlt(alt)

  return (
    <BubbleMenu
      editor={editor}
      pluginKey={IMAGE_BUBBLE_KEY}
      updateDelay={60}
      options={{ placement: 'bottom', offset: 8, flip: true, shift: { padding: 8 } }}
      shouldShow={({ editor: ed, view, element }) => ed.isEditable && ed.isActive(TYPE) && (view.hasFocus() || element.contains(document.activeElement))}
    >
      <Box
        bg="page.bg-elevated"
        border="1px solid"
        borderColor="page.border-strong"
        borderRadius="lg"
        boxShadow="0 10px 28px rgba(0,0,0,0.18)"
        p={2}
        w={{ base: '260px', sm: '320px' }}
        sx={POP_CSS}
      >
        <Flex as="label" htmlFor={inputId} align="center" gap={1.5} mb={1.5} fontSize="12px" color="page.fg-secondary">
          Alt text
          {missing ? (
            <Flex as="span" align="center" gap={1} color="red.400" fontWeight={500}>
              <Box as="span" w="6px" h="6px" borderRadius="full" bg="red.400" aria-hidden />
              Alt missing
            </Flex>
          ) : null}
        </Flex>
        <Input
          id={inputId}
          size="sm"
          value={alt}
          onChange={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
              e.preventDefault()
              editor.commands.focus()
            }
          }}
          placeholder="What the image shows"
          isInvalid={missing}
          aria-describedby={`${inputId}-hint`}
          autoComplete="off"
        />
        <Text id={`${inputId}-hint`} fontSize="11px" color={fileName ? 'orange.400' : 'page.fg-secondary'} mt={1.5}>
          {fileName ? 'That looks like a file name — describe the picture instead.' : 'Read aloud by screen readers; shown if the image fails to load.'}
        </Text>
        {gallery ? (
          <Flex align="center" justify="space-between" gap={2} mt={2.5}>
            <Text id={`${inputId}-width`} fontSize="12px" color="page.fg-secondary">
              Gallery width
            </Text>
            <ButtonGroup size="xs" isAttached variant="outline" role="group" aria-labelledby={`${inputId}-width`}>
              {WIDTHS.map((w) => (
                <Button
                  key={w.label}
                  aria-pressed={width === w.value}
                  bg={width === w.value ? 'var(--accent-soft)' : 'transparent'}
                  borderColor="page.border-strong"
                  fontWeight={width === w.value ? 600 : 400}
                  onClick={() => {
                    if (!src) return
                    setWidth(w.value)
                    editor.chain().updateAttributes(TYPE, { src: withWidthFragment(src, w.value) }).run()
                  }}
                >
                  {w.label}
                </Button>
              ))}
            </ButtonGroup>
          </Flex>
        ) : null}
      </Box>
    </BubbleMenu>
  )
}
