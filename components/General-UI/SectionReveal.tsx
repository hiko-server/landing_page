import React, { useRef } from 'react'
import { Box, BoxProps } from '@chakra-ui/react'
import { motion, useInView, useReducedMotion } from 'framer-motion'

const MotionBox = motion(Box)

type Props = BoxProps & {
  children: React.ReactNode
  /**
   * Fade only the section's `[NN]` label (`.section-label-rule`) and leave
   * the content alone — for sections whose rows run their own stagger, so a
   * section never animates twice.
   */
  labelOnly?: boolean
}

/**
 * Fade-and-rise wrapper used as the outer slot for every "[NN]" section
 * on the home + about pages.
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

const EASE_OUT_QUART = [0.22, 1, 0.36, 1] as const

export default function SectionReveal({ children, labelOnly, ...rest }: Props) {
  // Under prefers-reduced-motion the section appears as soon as it enters the
  // viewport — no rise (MotionConfig already drops transforms) and no fade.
  // Only `transition` depends on it, so server and client markup match.
  const reduceMotion = useReducedMotion()
  if (labelOnly) return <LabelReveal {...rest}>{children}</LabelReveal>
  return (
    <MotionBox
      width="100%"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.35, ease: EASE_OUT_QUART }}
      {...rest}
    >
      {children}
    </MotionBox>
  )
}

function LabelReveal({ children, ...rest }: BoxProps & { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const shown = useInView(ref, { once: true, amount: 0.2 })
  return (
    <Box
      ref={ref}
      width="100%"
      data-revealed={shown ? 'true' : 'false'}
      sx={{
        '& .section-label-rule': {
          transition: 'opacity 350ms var(--ease-out-quart), transform 350ms var(--ease-out-quart)',
        },
        '&[data-revealed="false"] .section-label-rule': { opacity: 0, transform: 'translate3d(0, 12px, 0)' },
      }}
      {...rest}
    >
      {children}
    </Box>
  )
}
