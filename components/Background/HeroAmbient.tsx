'use client'
import React from 'react'
import { Box, useColorModeValue } from '@chakra-ui/react'

/**
 * HeroAmbient — premium daytime mountain backdrop for the Hero.
 *
 * Layer stack (back → front):
 *   z=-4  Solid base                                   (#fafafa light / #050505 dark)
 *   z=-3  /images/hero/hero-mountains.jpg              (Aravalli layered ridges,
 *                                                       2880×1920, Pinal Jain
 *                                                       via Unsplash)
 *           - Light mode: brightness 0.92, saturate 1.05
 *           - Dark  mode: brightness 0.28, saturate 0.75, slight hue rotation
 *             toward indigo so the image blends with the v6 accent palette
 *   z=-2  Top + bottom vignettes                       (header + section label
 *                                                       readability)
 *   z=-1  Dot grid (8px)                               (engineer signature
 *                                                       overlay)
 *
 * Why a static photo instead of the v5 video reel:
 *   - 36 MB of mp4 ↑↑ first paint, no longer needed
 *   - Single decoded image is < 1 MB and caches forever
 *   - Photograph feels grounded and editorial vs the looping reel
 *   - Theme-aware filters keep the same image working in dark mode without
 *     fighting the indigo+near-black palette
 */

const HERO_IMG = '/images/hero/hero-mountains.jpg'

export default function HeroAmbient({
  children,
  minH,
}: {
  children: React.ReactNode
  minH?: string
}) {
  const base = useColorModeValue('#fafafa', '#050505')

  // Photo filter — quiet it down so text always wins.
  const imgFilter = useColorModeValue(
    'brightness(0.92) saturate(1.05) contrast(1.02)',
    'brightness(0.28) saturate(0.75) hue-rotate(-8deg) contrast(1.05)',
  )

  // Vignettes blend the photo into the surrounding page chrome.
  const topVignette = useColorModeValue(
    'linear-gradient(180deg, rgba(253,253,253,0.55) 0%, rgba(253,253,253,0) 100%)',
    'linear-gradient(180deg, rgba(5,5,5,0.80) 0%, rgba(5,5,5,0) 100%)',
  )
  const bottomVignette = useColorModeValue(
    'linear-gradient(0deg, rgba(253,253,253,0.92) 0%, rgba(253,253,253,0.45) 50%, rgba(253,253,253,0) 100%)',
    'linear-gradient(0deg, rgba(5,5,5,0.95) 0%, rgba(5,5,5,0.55) 50%, rgba(5,5,5,0) 100%)',
  )

  // Subtle dot grid on top of the photo so the engineer signature stays.
  const dotColor = useColorModeValue('rgba(0,0,0,0.05)', 'rgba(255,255,255,0.05)')

  return (
    <Box position="relative" w="full" minH={minH || 'auto'} overflow="hidden">
      {/* z=-4 solid base (shows through if the image fails to load) */}
      <Box position="absolute" inset={0} bg={base} zIndex={-4} />

      {/* z=-3 mountain photo */}
      <Box
        position="absolute"
        inset={0}
        zIndex={-3}
        pointerEvents="none"
        sx={{
          backgroundImage: `url("${HERO_IMG}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 35%', // bias upward so peaks land mid-hero
          backgroundRepeat: 'no-repeat',
          filter: imgFilter,
          willChange: 'filter',
        }}
      />

      {/* z=-2 top vignette */}
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        h="220px"
        zIndex={-2}
        pointerEvents="none"
        backgroundImage={topVignette}
      />

      {/* z=-2 bottom vignette (taller — blends into the next section) */}
      <Box
        position="absolute"
        bottom={0}
        left={0}
        right={0}
        h="260px"
        zIndex={-2}
        pointerEvents="none"
        backgroundImage={bottomVignette}
      />

      {/* z=-1 dot grid (8×8) — engineer signature stays */}
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

      {children}
    </Box>
  )
}
