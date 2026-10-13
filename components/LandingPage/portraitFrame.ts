/**
 * Dark-mode frame for the hero portrait.
 *
 * The owner's headshot is a studio photo on a white background: on the
 * near-black dark theme it read as a bright square cut out of the page. In
 * dark mode the portrait is matted instead — an inner ring of the elevated
 * surface colour with a hairline edge (a passe-partout), a soft vignette
 * that pulls the white corners toward the page, and a slight exposure cut so
 * the photo sits at the page's brightness. Light mode is unchanged.
 *
 * Pure CSS on the theme attribute that ColorModeScript sets before first
 * paint (no JS, no layout change: the ring is an inset shadow on an overlay,
 * so the image box keeps its size); off in forced-colours mode.
 */

const DARK = "[data-theme='dark'] &, .chakra-ui-dark &"

export type PortraitSize = 'card' | 'avatar'

/** Mat width (px) per portrait size: the 220/260px card and the 64px phone avatar. */
export const PORTRAIT_MAT: Record<PortraitSize, number> = { card: 6, avatar: 3 }

/** Exposure applied to the photo in dark mode. */
export const PORTRAIT_DARK_FILTER = 'brightness(0.86) contrast(1.04) saturate(0.95)'

export function portraitFrameSx(size: PortraitSize) {
  const mat = PORTRAIT_MAT[size]
  return {
    [DARK]: {
      '& img': { filter: PORTRAIT_DARK_FILTER },
      '&::after': {
        content: '""',
        position: 'absolute',
        inset: 0,
        borderRadius: 'inherit',
        pointerEvents: 'none',
        boxShadow: `inset 0 0 0 ${mat}px var(--chakra-colors-page-bg-elevated), inset 0 0 0 ${mat + 1}px rgba(255,255,255,0.10)`,
        backgroundImage: 'radial-gradient(120% 120% at 50% 38%, rgba(5,5,5,0) 58%, rgba(5,5,5,0.32) 100%)',
      },
    },
    '@media (forced-colors: active)': {
      '&::after': { display: 'none' },
      '& img': { filter: 'none' },
    },
  } as const
}
