import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Box, Text } from '@chakra-ui/react'
import { A4_HEIGHT_PX, A4_WIDTH_PX } from './CVResult'

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * Shows the fixed-width A4 sheet at any viewport width.
 *
 * Uses CSS `zoom` (layout-affecting, so no phantom whitespace the way a
 * `transform: scale` would leave) driven by a ResizeObserver. Before JS runs,
 * stepped breakpoint defaults keep the server-rendered sheet roughly
 * fitted on phones. Print always resets the zoom to 1 (an `!important`
 * print rule beats the inline style), so the PDF is true A4 at any width.
 *
 * `zoom="fit"` fits the container width (never upscaling past `maxScale`);
 * a number forces that zoom and lets the container scroll horizontally.
 * `pageGuides` draws dashed A4 page boundaries (Studio preview).
 */
export default function ScaledSheet({
  children,
  zoom = 'fit',
  maxScale = 1,
  pageGuides = false,
  onScale,
  onPages,
}: {
  children: React.ReactNode
  zoom?: 'fit' | number
  maxScale?: number
  pageGuides?: boolean
  onScale?: (scale: number) => void
  /** With `pageGuides`: called with the measured number of A4 pages (Studio readiness check). */
  onPages?: (pages: number) => void
}) {
  const outerRef = useRef<HTMLDivElement | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const [fit, setFit] = useState<number | null>(null)
  // null until the sheet has been measured (a hidden pane is never measured).
  const [pages, setPages] = useState<number | null>(null)

  useIsoLayoutEffect(() => {
    const el = outerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = (w: number) => setFit(Math.max(0.2, Math.min(maxScale, w / A4_WIDTH_PX)))
    measure(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) measure(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [maxScale])

  useEffect(() => {
    if (!pageGuides) return
    const el = sheetRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      // offsetHeight is in the sheet's own (un-zoomed) CSS pixels; 0 while
      // the sheet is not displayed (a hidden pane) — nothing to measure then.
      if (!el.offsetHeight) return
      setPages(Math.max(1, Math.ceil((el.offsetHeight - 2) / A4_HEIGHT_PX)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [pageGuides])

  const scale = zoom === 'fit' ? fit : zoom
  useEffect(() => {
    if (scale && onScale) onScale(scale)
  }, [scale, onScale])
  useEffect(() => {
    if (pageGuides && onPages && pages !== null) onPages(pages)
  }, [pageGuides, pages, onPages])

  return (
    <Box ref={outerRef} className="cv-print-flow" w="100%" overflowX={zoom === 'fit' ? 'visible' : 'auto'}>
      <Box
        className="cv-print-flow cv-sheet-zoom"
        w={`${A4_WIDTH_PX}px`}
        mx={zoom === 'fit' ? 'auto' : undefined}
        position="relative"
        style={scale ? ({ zoom: scale } as React.CSSProperties) : undefined}
        sx={{
          ...(scale ? null : { zoom: { base: 0.44, sm: 0.6, md: 0.9, lg: 1 } }),
          '@media print': { zoom: '1 !important' },
        }}
      >
        <Box ref={sheetRef}>{children}</Box>
        {pageGuides && pages !== null && pages > 1
          ? Array.from({ length: pages - 1 }, (_, i) => (
              <Box
                key={i}
                className="no-print"
                aria-hidden
                position="absolute"
                left="-12px"
                right="-12px"
                top={`${(i + 1) * A4_HEIGHT_PX}px`}
                borderTop="2px dashed rgba(99,102,241,0.55)"
                pointerEvents="none"
              >
                <Text
                  position="absolute"
                  right="12px"
                  top="-20px"
                  fontFamily="mono"
                  fontSize="11px"
                  color="accent.600"
                  bg="white"
                  px="6px"
                  borderRadius="3px"
                >
                  page {i + 2}
                </Text>
              </Box>
            ))
          : null}
      </Box>
    </Box>
  )
}
