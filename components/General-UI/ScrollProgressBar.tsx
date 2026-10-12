import React from 'react'
import { Box } from '@chakra-ui/react'
import { useRouter } from 'next/router'
import { motion, useReducedMotion, useScroll, useSpring } from 'framer-motion'

/**
 * Reading-progress hairline in the brand accent. Shown on long-form pages
 * (articles, case studies, about / now / uses) where progress means
 * something, not on every route.
 *
 * Under prefers-reduced-motion the bar tracks the scroll position directly
 * instead of easing after it on a spring.
 */
const ROUTES = [/^\/blog\/[^/]+$/, /^\/work\/[^/]+$/, /^\/about$/, /^\/now$/, /^\/uses$/]

export default function ScrollProgressBar() {
  const { pathname } = useRouter()
  const { scrollYProgress } = useScroll()
  const smoothed = useSpring(scrollYProgress, { stiffness: 400, damping: 40 })
  const reduceMotion = useReducedMotion()
  if (!ROUTES.some((r) => r.test(pathname.replace('[slug]', 'x')))) return null

  return (
    <Box position="fixed" top={0} left={0} right={0} h="2px" zIndex={9999} pointerEvents="none" className="no-print" aria-hidden>
      <motion.div
        style={{
          height: '100%',
          background: 'var(--accent)',
          transformOrigin: 'left',
          scaleX: reduceMotion ? scrollYProgress : smoothed,
        }}
      />
    </Box>
  )
}
