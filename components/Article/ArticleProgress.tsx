import { useEffect, useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { HEADING_OFFSET } from './useActiveHeading'

const MONO = 'var(--font-geist-mono), monospace'

/**
 * How far the reader is through the article body (not the whole page, so
 * the footer and related links do not count). Updated at most once per
 * animation frame from a passive scroll listener; no animation of its own,
 * so it is unaffected by reduced-motion preferences.
 */
export default function ArticleProgress({ targetId = 'article-body' }: { targetId?: string }) {
  const [pct, setPct] = useState(0)

  useEffect(() => {
    const el = document.getElementById(targetId)
    if (!el) return
    let frame = 0
    const measure = () => {
      frame = 0
      const rect = el.getBoundingClientRect()
      const total = rect.height - (window.innerHeight - HEADING_OFFSET)
      const read = HEADING_OFFSET - rect.top
      const ratio = total <= 0 ? (rect.top <= HEADING_OFFSET ? 1 : 0) : read / total
      setPct(Math.round(Math.min(1, Math.max(0, ratio)) * 100))
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [targetId])

  return (
    <Box
      role="progressbar"
      aria-label="Reading progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`${pct}% read`}
    >
      <Flex justify="space-between" fontFamily={MONO} fontSize="11px" color="page.fg-secondary" mb={2}>
        <Text as="span" letterSpacing="0.12em" textTransform="uppercase">
          Progress
        </Text>
        <Text as="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {pct}%
        </Text>
      </Flex>
      <Box h="1px" bg="page.border" overflow="hidden">
        <Box h="100%" bg="var(--accent)" transformOrigin="left" style={{ transform: `scaleX(${pct / 100})` }} />
      </Box>
    </Box>
  )
}
