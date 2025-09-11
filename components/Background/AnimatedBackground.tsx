import React from 'react'
import { Box, useColorModeValue, usePrefersReducedMotion } from '@chakra-ui/react'
import { motion } from 'framer-motion'

const MotionBox = motion(Box)

/**
 * Subtle animated background blobs.
 * - Fixed, behind content (use with parent stacking context above it)
 * - Pointer-events disabled so it won't block clicks
 */
export default function AnimatedBackground(): JSX.Element {
  const lightA = useColorModeValue('#6b9cff', '#3b82f6')
  const lightB = useColorModeValue('#ff76ad', '#fb7185')
  const lightC = useColorModeValue('#ffc857', '#facc15')
  const opacity = useColorModeValue(0.25, 0.12)
  const stop = useColorModeValue(55, 60) // radial gradient color stop (% before transparent)
  const blurA = useColorModeValue(50, 60)
  const blurB = useColorModeValue(60, 70)
  const blurC = useColorModeValue(70, 80)
  const prefersReduced = usePrefersReducedMotion()

  return (
    <Box
      position="fixed"
      inset={0}
      zIndex={0}
      overflow="hidden"
      pointerEvents="none"
      aria-hidden
    >
      {/* Top-left blob */}
      <MotionBox
        position="absolute"
        top="-120px"
        left="-120px"
        w="520px"
        h="520px"
        borderRadius="50%"
        bgGradient={`radial(${lightA} 0%, transparent ${stop}%)`}
        filter={`blur(${blurA}px)`}
        opacity={opacity}
        animate={prefersReduced ? undefined : {
          x: [0, 20, -10, 0],
          y: [0, -10, 10, 0],
          scale: [1, 1.05, 0.98, 1],
        }}
        transition={prefersReduced ? undefined : { duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Bottom-right blob */}
      <MotionBox
        position="absolute"
        right="-160px"
        bottom="-160px"
        w="640px"
        h="640px"
        borderRadius="50%"
        bgGradient={`radial(${lightB} 0%, transparent ${stop}%)`}
        filter={`blur(${blurB}px)`}
        opacity={opacity}
        animate={prefersReduced ? undefined : {
          x: [0, -25, 10, 0],
          y: [0, 15, -10, 0],
          scale: [1, 0.97, 1.03, 1],
        }}
        transition={prefersReduced ? undefined : { duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Center faint blob */}
      <MotionBox
        position="absolute"
        left="40%"
        top="30%"
        w="560px"
        h="560px"
        borderRadius="50%"
        bgGradient={`radial(${lightC} 0%, transparent ${stop}%)`}
        filter={`blur(${blurC}px)`}
        opacity={opacity * 0.8}
        animate={prefersReduced ? undefined : {
          x: [0, 10, -15, 0],
          y: [0, 5, -8, 0],
          rotate: [0, 2, -1, 0],
        }}
        transition={prefersReduced ? undefined : { duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />
    </Box>
  )
}
