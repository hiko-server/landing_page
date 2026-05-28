'use client'
import React from 'react'
import { Box, useColorModeValue } from '@chakra-ui/react'

/**
 * HeroAmbient — premium static ambient background for the Hero.
 *
 * Replaces the v5 video reel ('background.mp4' / 'coding.mp4' / 'cryptoStock.mp4')
 * with a stack of pure-CSS layers:
 *
 *   z=-3  Solid base                            (#050505 dark / #fafafa light)
 *   z=-2  Three slow-drifting aurora orbs       (indigo + cyan + violet/pink)
 *           Each blob ~50–60% viewport, 120 px Gaussian blur, 75–110 s loop
 *   z=-1  Site signature 8×8 dot grid overlay   (slightly intensified vs body)
 *   z=-1  Top + bottom vignettes                (so header + section labels
 *                                               stay readable on any frame)
 *
 * Everything is CSS-only. prefers-reduced-motion stops the orb animation
 * (still renders, just frozen) so the screen doesn't shimmer for users who
 * opt out. Total runtime: zero JS after mount, no main-thread work.
 *
 * Why this instead of the v5 video:
 *   - 36 MB of mp4 ↑↑ first paint, no longer needed
 *   - Light + dark modes both look intentional (the videos forced 'white on
 *     dark vignette' regardless of theme)
 *   - Indigo accent matches the locked v6 brand color
 *   - 'Engineer + premium' instead of 'lifestyle reel'
 */

export default function HeroAmbient({
  children,
  minH,
}: {
  children: React.ReactNode
  minH?: string
}) {
  const base = useColorModeValue('#fdfdfd', '#050505')
  const glowIndigo = useColorModeValue('rgba(99, 102, 241, 0.20)', 'rgba(99, 102, 241, 0.26)')
  const glowCyan = useColorModeValue('rgba(56, 189, 248, 0.14)', 'rgba(56, 189, 248, 0.12)')
  const glowViolet = useColorModeValue('rgba(244, 114, 182, 0.10)', 'rgba(168, 85, 247, 0.14)')
  const dotColor = useColorModeValue('rgba(0,0,0,0.06)', 'rgba(255,255,255,0.06)')
  const topVignette = useColorModeValue(
    'linear-gradient(180deg, rgba(253,253,253,0.55) 0%, rgba(253,253,253,0) 100%)',
    'linear-gradient(180deg, rgba(5,5,5,0.75) 0%, rgba(5,5,5,0) 100%)',
  )
  const bottomVignette = useColorModeValue(
    'linear-gradient(0deg, rgba(253,253,253,0.55) 0%, rgba(253,253,253,0) 100%)',
    'linear-gradient(0deg, rgba(5,5,5,0.65) 0%, rgba(5,5,5,0) 100%)',
  )

  return (
    <Box position="relative" w="full" minH={minH || 'auto'} overflow="hidden">
      {/* z=-3 base */}
      <Box position="absolute" inset={0} bg={base} zIndex={-3} />

      {/* z=-2 aurora */}
      <Box position="absolute" inset={0} zIndex={-2} pointerEvents="none">
        <Box
          position="absolute"
          top="-25%"
          left="-15%"
          w="60%"
          h="80%"
          borderRadius="50%"
          bg={glowIndigo}
          filter="blur(120px)"
          sx={{
            animation: 'hero-aurora-1 90s cubic-bezier(0.45, 0, 0.55, 1) infinite',
            '@keyframes hero-aurora-1': {
              '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 0.85 },
              '50%': { transform: 'translate3d(20%, 8%, 0) scale(1.18)', opacity: 1 },
            },
            '@media (prefers-reduced-motion: reduce)': {
              animation: 'none',
            },
          }}
        />
        <Box
          position="absolute"
          bottom="-25%"
          right="-15%"
          w="55%"
          h="80%"
          borderRadius="50%"
          bg={glowCyan}
          filter="blur(140px)"
          sx={{
            animation: 'hero-aurora-2 110s cubic-bezier(0.45, 0, 0.55, 1) infinite',
            '@keyframes hero-aurora-2': {
              '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 0.85 },
              '50%': { transform: 'translate3d(-18%, -10%, 0) scale(1.22)', opacity: 1 },
            },
            '@media (prefers-reduced-motion: reduce)': {
              animation: 'none',
            },
          }}
        />
        <Box
          position="absolute"
          top="30%"
          left="50%"
          w="40%"
          h="40%"
          borderRadius="50%"
          bg={glowViolet}
          filter="blur(100px)"
          sx={{
            transform: 'translate(-50%, -50%)',
            animation: 'hero-aurora-3 75s cubic-bezier(0.45, 0, 0.55, 1) infinite',
            '@keyframes hero-aurora-3': {
              '0%, 100%': { transform: 'translate(-50%, -50%) scale(1)' },
              '50%': { transform: 'translate(-40%, -60%) scale(1.12)' },
            },
            '@media (prefers-reduced-motion: reduce)': {
              animation: 'none',
            },
          }}
        />
      </Box>

      {/* z=-1 dot grid (slightly intensified vs the body's global grid) */}
      <Box
        position="absolute"
        inset={0}
        zIndex={-1}
        pointerEvents="none"
        sx={{
          backgroundImage: `radial-gradient(circle at center, ${dotColor} 1px, transparent 1px)`,
          backgroundSize: '16px 16px',
        }}
      />

      {/* z=-1 top vignette (header readability) */}
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        h="160px"
        zIndex={-1}
        pointerEvents="none"
        backgroundImage={topVignette}
      />

      {/* z=-1 bottom vignette (smooth blend into next section) */}
      <Box
        position="absolute"
        bottom={0}
        left={0}
        right={0}
        h="160px"
        zIndex={-1}
        pointerEvents="none"
        backgroundImage={bottomVignette}
      />

      {children}
    </Box>
  )
}
