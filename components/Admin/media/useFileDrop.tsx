import { useEffect, useRef, useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'

/**
 * Drag-and-drop of image files onto a whole page or dialog (H7): while files
 * are dragged over the window an overlay says where they go; dropping them
 * hands the files to `onFiles`. Only file drags count (text or a link
 * dragged around the page is left alone), and nothing happens while
 * `enabled` is false (another dialog is open).
 */
export function useFileDrop(onFiles: (files: File[]) => void, enabled = true): { dragging: boolean } {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  const cb = useRef(onFiles)
  cb.current = onFiles

  useEffect(() => {
    if (!enabled) {
      depth.current = 0
      setDragging(false)
      return
    }
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current++
      setDragging(true)
    }
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (!depth.current) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setDragging(false)
      const files = Array.from(e.dataTransfer?.files || [])
      if (files.length) cb.current(files)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [enabled])

  return { dragging }
}

/** The overlay shown while files are dragged over the page. */
export function DropOverlay({ show, label }: { show: boolean; label: string }) {
  if (!show) return null
  return (
    <Flex
      position="fixed"
      inset={0}
      zIndex={1500}
      align="center"
      justify="center"
      bg="rgba(5, 5, 5, 0.55)"
      backdropFilter="blur(2px)"
      pointerEvents="none"
      aria-hidden
      data-testid="drop-overlay"
      sx={{
        '@keyframes dropIn': { from: { opacity: 0 }, to: { opacity: 1 } },
        animation: 'dropIn 150ms var(--ease-standard, ease)',
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    >
      <Box m={6} px={10} py={8} border="2px dashed" borderColor="accent.500" borderRadius="2xl" bg="page.bg-elevated" textAlign="center" maxW="420px">
        <Text fontSize="lg" fontWeight={600}>
          {label}
        </Text>
        <Text fontSize="sm" color="page.fg-secondary" mt={1}>
          JPEG, PNG, WebP or GIF, up to 8 MB each. Responsive sizes are made as they arrive.
        </Text>
      </Box>
    </Flex>
  )
}

