import React from 'react'
import { Box, BoxProps } from '@chakra-ui/react'
import { useScrollReveal } from './useScrollReveal'

type Props = BoxProps & {
  children: React.ReactNode
  /**
   * Fade only the section's heading (`.section-heading`, SectionHeading) and
   * leave the content alone — for sections whose rows run their own
   * stagger, so a section never animates twice.
   */
  labelOnly?: boolean
}

/**
 * Fade-and-rise wrapper used as the outer slot for every section on the
 * home page.
 *
 * One path for every arrival (lib/reveal.ts): the wrapper renders visible —
 * in the server HTML, in the first frame after a client-side navigation and
 * in the route transition's snapshot — and only a section that lies wholly
 * below the viewport is hidden (after that first frame, where nobody can see
 * it) and rises in when it scrolls into view. Under prefers-reduced-motion,
 * or without IntersectionObserver, nothing is ever hidden. Print always
 * shows everything.
 *
 * `width="100%"` is the default and matters:
 *
 *   The pages put these inside `<Flex direction="column" alignItems="center">`,
 *   which makes each child a flex item. A flex item with no explicit width
 *   shrink-wraps to its content's intrinsic size, so anything inside that
 *   changes width on interaction — opening an accordion, switching language
 *   between EN and 中, swapping a long string for a short one — causes the
 *   whole card to re-measure and re-center, producing the visible "jump"
 *   the user reported on the /about Contributions panel.
 *
 *   Locking the wrapper to 100% width lets the inner `maxW="…px"` controls
 *   (e.g. CVSectionShell's 1100px cap) hold the visual size stable across
 *   states. Callers can still override via the spread.
 */

const REVEAL_TRANSITION = 'opacity 350ms var(--ease-out-quart), transform 350ms var(--ease-out-quart)'

const SECTION_SX = {
  '&[data-reveal="pending"]': { opacity: 0, transform: 'translate3d(0, 24px, 0)' },
  '&[data-reveal="shown"]': { transition: REVEAL_TRANSITION },
  '@media print': { opacity: '1 !important', transform: 'none !important' },
} as const

const LABEL_SX = {
  '&[data-reveal="pending"] .section-heading': { opacity: 0, transform: 'translate3d(0, 12px, 0)' },
  '&[data-reveal="shown"] .section-heading': { transition: REVEAL_TRANSITION },
  '@media print': { '& .section-heading': { opacity: '1 !important', transform: 'none !important' } },
} as const

export default function SectionReveal({ children, labelOnly, ...rest }: Props) {
  const { ref, phase } = useScrollReveal<HTMLDivElement>()
  return (
    <Box ref={ref} width="100%" data-reveal={phase} sx={labelOnly ? LABEL_SX : SECTION_SX} {...rest}>
      {children}
    </Box>
  )
}
