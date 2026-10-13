import React from 'react'
import { Box } from '@chakra-ui/react'

/**
 * HeroAmbient — daytime mountain backdrop for the home hero.
 *
 * Layer stack (back → front):
 *   z=-4  Solid base (page.bg)
 *   z=-3  Mountain photo (Aravalli ridges, Pinal Jain via Unsplash), a real
 *         <img> so it can be the LCP element: AVIF/WebP baked by
 *         scripts/bake-hero.mjs at 640/1080/1600/2400 px (the image optimizer
 *         is disabled), preloaded from pages/index.tsx, fetchpriority high.
 *           - light: washed-out watermark (brightness 1.18, saturate 0.55,
 *             contrast 0.85, opacity 0.55)
 *           - dark:  brightness 0.28, saturate 0.75, a slight hue rotation
 *             toward the indigo accent
 *         On browsers with scroll-driven animations it drifts 8% down over
 *         the first viewport of scroll (`.hero-drift`, styles/globals.css;
 *         text never moves); never with reduced motion.
 *   z=-2  Light-mode scrim, top + bottom vignettes (the photo's dark lower
 *         band must never sit under hero text; the light bottom vignette is
 *         taller and steeper for that reason)
 *   z=-2  Film grain (SVG turbulence, soft-light, --grain-opacity) that
 *         dithers 8-bit banding out of the dark vignettes
 *   z=-1  16px dot grid (the site's engineer signature)
 *
 * No seam where the hero ends: the photo, scrim, vignettes and grain sit in
 * one layer that is masked to transparent over its last HERO_FADE, so the
 * hero dissolves into the solid page background instead of stopping at a
 * line (the light vignette alone left a 1–2 % tinted band with a hard edge).
 * The dot grid is the body's own grid continued: same colour variable, and
 * its tiles are shifted by the header height (the hero starts right under
 * the sticky header), so the dots line up with the page's dots below.
 *
 * Every colour-mode difference is a CSS selector on the theme attribute that
 * ColorModeScript sets before first paint, so the server HTML is right for
 * both themes and nothing changes on hydration.
 */

export const HERO_WIDTHS = [640, 1080, 1600, 2400] as const
const heroSet = (ext: 'avif' | 'webp') => HERO_WIDTHS.map((w) => `/images/hero/hero-mountains-${w}.${ext} ${w}w`).join(', ')
/** srcset of the AVIF hero (also preloaded by pages/index.tsx). */
export const HERO_AVIF_SRCSET = heroSet('avif')
export const HERO_WEBP_SRCSET = heroSet('webp')
export const HERO_FALLBACK_SRC = '/images/hero/hero-mountains-1080.webp'
export const HERO_SIZES = '100vw'

const DARK = "[data-theme='dark'] &, .chakra-ui-dark &"
const FORCED_COLORS = '@media (forced-colors: active)'

/** Height over which the hero's imagery fades into the page at its bottom edge. */
export const HERO_FADE = '160px'
/** Mask of the imagery layer: opaque, then transparent over the last HERO_FADE. */
export const HERO_FADE_MASK = `linear-gradient(180deg, #000 0, #000 calc(100% - ${HERO_FADE}), transparent 100%)`
/**
 * Vertical offset that puts the hero's dot tiles on the body's 16px grid
 * (globals.css --dot-color on <body>): the hero starts at the header's
 * measured height (--header-h, components/Chrome/SiteChrome.tsx).
 */
export const HERO_GRID_POSITION = '0 calc(-1 * var(--header-h, 57px))'

const GRAIN_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>" +
  "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/>" +
  "<feColorMatrix values='1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 .55'/></filter>" +
  "<rect width='100%' height='100%' filter='url(#n)'/></svg>"
const GRAIN_URI = `url("data:image/svg+xml,${encodeURIComponent(GRAIN_SVG)}")`

const photoSx = {
  position: 'absolute',
  inset: '-8% 0 0 0',
  width: '100%',
  height: '108%',
  maxWidth: 'none',
  objectFit: 'cover',
  objectPosition: 'center 35%',
  opacity: 0.55,
  filter: 'brightness(1.18) saturate(0.55) contrast(0.85)',
  [DARK]: {
    opacity: 1,
    filter: 'brightness(0.28) saturate(0.75) hue-rotate(-8deg) contrast(1.05)',
  },
  [FORCED_COLORS]: { display: 'none' },
} as const

const layer = { position: 'absolute', pointerEvents: 'none' } as const

export default function HeroAmbient({ children, minH }: { children: React.ReactNode; minH?: string }) {
  return (
    // `isolation: isolate` keeps the negative z-index layers inside this box's
    // own stacking context, so they can never slip behind an ancestor's background.
    <Box position="relative" w="full" minH={minH || 'auto'} overflow="hidden" sx={{ isolation: 'isolate' }}>
      {/* z=-4 solid base (shows through if the image fails to load) */}
      <Box sx={layer} inset={0} bg="page.bg" zIndex={-4} />

      {/* z=-3 imagery: photo, scrim, vignettes and grain, faded out at the bottom (no seam) */}
      <Box
        sx={{ ...layer, maskImage: HERO_FADE_MASK, WebkitMaskImage: HERO_FADE_MASK }}
        inset={0}
        zIndex={-3}
        aria-hidden
      >
        {/* mountain photo (styled from the wrapper so <picture> holds only source + img) */}
        <Box sx={{ ...layer, '& img': photoSx }} inset={0} zIndex={-3}>
          <picture>
            <source type="image/avif" srcSet={HERO_AVIF_SRCSET} sizes={HERO_SIZES} />
            <img
              className="hero-drift"
              src={HERO_FALLBACK_SRC}
              srcSet={HERO_WEBP_SRCSET}
              sizes={HERO_SIZES}
              alt=""
              width={2880}
              height={1920}
              decoding="async"
              draggable={false}
              {...{ fetchpriority: 'high' }}
            />
          </picture>
        </Box>

        {/* z=-2 uniform scrim (light mode only) */}
        <Box sx={{ ...layer, [DARK]: { display: 'none' } }} inset={0} zIndex={-2} bg="rgba(253,253,253,0.55)" />

        {/* z=-2 top vignette */}
        <Box
          top={0}
          left={0}
          right={0}
          h="220px"
          zIndex={-2}
          sx={{
            ...layer,
            backgroundImage: 'linear-gradient(180deg, rgba(253,253,253,0.70) 0%, rgba(253,253,253,0) 100%)',
            [DARK]: { backgroundImage: 'linear-gradient(180deg, rgba(5,5,5,0.80) 0%, rgba(5,5,5,0) 100%)' },
          }}
        />

        {/* z=-2 bottom vignette (taller in light mode so silhouettes fade out) */}
        <Box
          bottom={0}
          left={0}
          right={0}
          zIndex={-2}
          sx={{
            ...layer,
            height: '480px',
            backgroundImage:
              'linear-gradient(0deg, rgba(253,253,253,0.98) 0%, rgba(253,253,253,0.85) 40%, rgba(253,253,253,0.40) 75%, rgba(253,253,253,0) 100%)',
            [DARK]: {
              height: '260px',
              backgroundImage: 'linear-gradient(0deg, rgba(5,5,5,0.95) 0%, rgba(5,5,5,0.55) 50%, rgba(5,5,5,0) 100%)',
            },
          }}
        />

        {/* z=-2 grain, above the vignettes so it dithers their gradients */}
        <Box
          inset={0}
          zIndex={-2}
          sx={{
            ...layer,
            backgroundImage: GRAIN_URI,
            backgroundSize: '160px 160px',
            mixBlendMode: 'soft-light',
            opacity: 'var(--grain-opacity)',
          }}
        />
      </Box>

      {/* z=-1 dot grid — the body's grid, continued over the imagery */}
      <Box
        inset={0}
        zIndex={-1}
        sx={{
          ...layer,
          backgroundImage: 'radial-gradient(circle at center, var(--dot-color) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
          backgroundPosition: HERO_GRID_POSITION,
          [FORCED_COLORS]: { display: 'none' },
        }}
      />

      {children}
    </Box>
  )
}
