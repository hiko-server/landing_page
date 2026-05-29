import React from 'react'
import { Box, BoxProps } from '@chakra-ui/react'
import { motion } from 'framer-motion'

const MotionBox = motion(Box)

type Props = BoxProps & { children: React.ReactNode }

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

export default function SectionReveal({ children, ...rest }: Props) {
  return (
    <MotionBox
      width="100%"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      {...rest}
    >
      {children}
    </MotionBox>
  )
}
