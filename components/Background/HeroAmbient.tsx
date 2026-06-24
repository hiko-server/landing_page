'use client'
import React from 'react'
import { Box, useColorModeValue } from '@chakra-ui/react'

/**
 * HeroAmbient — premium daytime mountain backdrop for the Hero.
 *
 * Layer stack (back → front):
 *   z=-4  Solid base                              (#fdfdfd light / #050505 dark)
 *   z=-3  /images/hero/hero-mountains.jpg         (Aravalli layered ridges,
 *                                                  2880×1920, Pinal Jain
 *                                                  via Unsplash)
 *           - Light mode: washed-out atmospheric watermark
 *                         (brightness 1.18, saturate 0.55, contrast 0.85,
 *                          opacity 0.55)
 *           - Dark  mode: brightness 0.28, saturate 0.75, slight hue
 *                         rotation toward indigo so the image blends with
 *                         the v6 accent palette
 *   z=-2  Full-area scrim                         (light-mode only — a uniform
 *                                                  white wash that lifts every
 *                                                  pixel toward the surface so
 *                                                  the dark mountain silhouettes
 *                                                  can never compete with text)
 *   z=-2  Top + bottom vignettes                  (header + section-label
 *                                                  readability; in light mode
 *                                                  the bottom vignette is much
 *                                                  taller + more opaque so the
 *                                                  silhouettes at the bottom
 *                                                  of the photo fade entirely
 *                                                  into white before reaching
 *                                                  the meta row + CTA buttons)
 *   z=-1  Dot grid (8px)                          (engineer signature overlay)
 *
 * Why so much white in light mode:
 *   The photo's lower band is dark mountain silhouettes. Dark hero text
 *   landing on dark silhouettes is the exact bug the user reported
 *   ("Light mode 下会导致有些文字看不清楚"). Washing the photo out + a
 *   uniform 0.55 white scrim + a deeper bottom vignette puts every text
 *   element on a near-white surface, regardless of which photo pixels
 *   happen to sit under it.
 */

const HERO_IMG = '/images/hero/hero-mountains.jpg'

export default function HeroAmbient({
  children,
  minH,
}: {
  children: React.ReactNode
  minH?: string
}) {
  const base = useColorModeValue('#fdfdfd', '#050505')

  // Photo filter — quiet it down so text always wins.
  // Light mode: wash the photo into a soft pastel ghost (high brightness,
  // low saturation, lower contrast) so the silhouette band reads as a
  // suggestion rather than a hard shape.
  const imgFilter = useColorModeValue(
    'brightness(1.18) saturate(0.55) contrast(0.85)',
    'brightness(0.28) saturate(0.75) hue-rotate(-8deg) contrast(1.05)',
  )
  // Light mode also drops the photo opacity outright (~ half-strength
  // watermark). Dark mode keeps the photo at full opacity — the filter
  // already handles dim.
  const imgOpacity = useColorModeValue(0.55, 1)

  // Uniform full-area scrim — only in light mode. Lifts every pixel toward
  // #fdfdfd so any text element sits on near-white regardless of which
  // photo pixels happen to be under it.
  const scrim = useColorModeValue('rgba(253,253,253,0.55)', 'rgba(0,0,0,0)')

  // Vignettes blend the photo into the surrounding page chrome.
  const topVignette = useColorModeValue(
    'linear-gradient(180deg, rgba(253,253,253,0.70) 0%, rgba(253,253,253,0) 100%)',
    'linear-gradient(180deg, rgba(5,5,5,0.80) 0%, rgba(5,5,5,0) 100%)',
  )
  // Light-mode bottom vignette: taller (480px vs 260px) and steeper so the
  // dark mountain silhouettes at the bottom of the photo fade entirely
  // into white before reaching the meta row + CTA buttons.
  const bottomVignette = useColorModeValue(
    'linear-gradient(0deg, rgba(253,253,253,0.98) 0%, rgba(253,253,253,0.85) 40%, rgba(253,253,253,0.40) 75%, rgba(253,253,253,0) 100%)',
    'linear-gradient(0deg, rgba(5,5,5,0.95) 0%, rgba(5,5,5,0.55) 50%, rgba(5,5,5,0) 100%)',
  )
  const bottomVignetteHeight = useColorModeValue('480px', '260px')

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
        opacity={imgOpacity}
        sx={{
          // Emotion array = CSS fallback cascade: browsers without image-set()
          // get the (recompressed) JPG; modern browsers get the ~60KB WebP.
          backgroundImage: [
            `url("${HERO_IMG}")`,
            `image-set(url("/images/hero/hero-mountains.webp") type("image/webp"), url("${HERO_IMG}") type("image/jpeg"))`,
          ],
          backgroundSize: 'cover',
          backgroundPosition: 'center 35%', // bias upward so peaks land mid-hero
          backgroundRepeat: 'no-repeat',
          filter: imgFilter,
          willChange: 'filter, opacity',
        }}
      />

      {/* z=-2 uniform scrim (light-mode only — fully transparent in dark) */}
      <Box
        position="absolute"
        inset={0}
        zIndex={-2}
        pointerEvents="none"
        bg={scrim}
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

      {/* z=-2 bottom vignette (taller in light mode so silhouettes fade out) */}
      <Box
        position="absolute"
        bottom={0}
        left={0}
        right={0}
        h={bottomVignetteHeight}
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
