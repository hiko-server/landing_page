import { useEffect, useId, useState } from 'react'
import { Box, Button, ButtonGroup, Flex, Input, Text } from '@chakra-ui/react'
import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { isFilenameAlt } from '../shell/publishChecks'
import { figureWidthOfSrc, withWidthFragment, type FigureWidth } from '../../../lib/rehype/galleries'

/**
 * Bubble shown on a selected image in the visual editor: edits its alt text
 * in place (updateAttributes), with a red dot and "Alt missing" while it is
 * empty, or a hint when it is just a file name; and its width on the page —
 * text column, wide or full (a `#wide` / `#full` fragment on the source,
 * lib/rehype/galleries.ts; images alone in their paragraph only).
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

export default function ImageBubble({ editor }: { editor: Editor }) {
  const inputId = useId()
  const current = editor.isActive('image') ? String(editor.getAttributes('image').alt || '') : ''
  const src = editor.isActive('image') ? String(editor.getAttributes('image').src || '') : ''
  const srcWidth = figureWidthOfSrc(src)
  const [alt, setAlt] = useState(current)
  const [width, setWidth] = useState<FigureWidth | null>(srcWidth)

  // Follow the selected image (another image, or an undo).
  useEffect(() => setAlt(current), [current])
  useEffect(() => setWidth(srcWidth), [srcWidth])

  const commit = (value: string) => {
    setAlt(value)
    editor.chain().updateAttributes('image', { alt: value.trim() || null }).run()
  }

  const missing = !alt.trim()
  const fileName = !missing && isFilenameAlt(alt)

  return (
    <BubbleMenu
      editor={editor}
      pluginKey={IMAGE_BUBBLE_KEY}
      updateDelay={60}
      options={{ placement: 'bottom', offset: 8, flip: true, shift: { padding: 8 } }}
      shouldShow={({ editor: ed, view, element }) =>
        ed.isEditable && ed.isActive('image') && (view.hasFocus() || element.contains(document.activeElement))
      }
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
          aria-invalid={missing}
          aria-describedby={`${inputId}-hint`}
          autoComplete="off"
        />
        <Text id={`${inputId}-hint`} fontSize="11px" color={fileName ? 'orange.400' : 'page.fg-secondary'} mt={1.5}>
          {fileName ? 'That looks like a file name — describe the picture instead.' : 'Read aloud by screen readers; shown if the image fails to load.'}
        </Text>
        <Flex align="center" justify="space-between" gap={2} mt={2.5}>
          <Text id={`${inputId}-width`} fontSize="12px" color="page.fg-secondary">
            Width on the page
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
                  editor.chain().updateAttributes('image', { src: withWidthFragment(src, w.value) }).run()
                }}
              >
                {w.label}
              </Button>
            ))}
          </ButtonGroup>
        </Flex>
      </Box>
    </BubbleMenu>
  )
}
