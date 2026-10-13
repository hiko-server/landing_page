import { useEffect, useRef, useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'

import { safeHref } from '../../lib/cvFormat'
import type { HomeBrand } from '../../lib/homeShape'

type Brand = { name: string; href: string; image: string; scale: number }

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'
const LOGO_H = 28
/** Width box of a logo at scale 1; the owner's per-logo `scale` multiplies it. */
const LOGO_W = 120
const SCALE_MIN = 0.5
const SCALE_MAX = 2

const DARK = "[data-theme='dark'] &, .chakra-ui-dark &"

/** The owner's per-logo scale, clamped; 1 when absent or invalid. */
function logoScale(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n > 0 ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, n)) : 1
}

const logoSx = {
  display: 'block',
  height: `${LOGO_H}px`,
  objectFit: 'contain',
  // A calm, monochrome band: logos read as one row, not a patchwork of colours.
  filter: 'grayscale(1) contrast(1.1)',
  mixBlendMode: 'multiply',
  opacity: 0.65,
  transition: 'opacity 250ms var(--ease-out-quart), filter 250ms var(--ease-out-quart)',
  [DARK]: { filter: 'grayscale(1) invert(1) brightness(1.15)', mixBlendMode: 'screen', opacity: 0.6 },
  '@media (forced-colors: active)': { filter: 'none', mixBlendMode: 'normal', opacity: 1 },
} as const

const revealSx = {
  '@media (hover: hover)': { '&:hover img': { opacity: 1, filter: 'none' } },
  '&:focus-visible img': { opacity: 1, filter: 'none' },
} as const

/**
 * Affiliations band.
 *
 * - One centred, wrapping row of logos at a fixed 28px height (48px column
 *   gap, 24px row gap). Each logo's box is `scale × 120px` wide, so the
 *   owner can balance wide wordmarks against square marks from the Home
 *   editor; explicit width/height mean no layout shift.
 * - Monochrome and quiet by default (multiply in light, inverted screen in
 *   dark — no white chips); full colour on hover / keyboard focus.
 * - A logo that is missing or fails to load (including one that failed
 *   before hydration) falls back to the brand name in mono caps.
 * - Links only for safe http(s) URLs; otherwise the logo is static.
 */
const BrandLogo = ({ brand }: { brand: Brand }) => {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [failed, setFailed] = useState(!brand.image)

  // An image that errored before React attached onError never fires it again.
  useEffect(() => {
    const img = imgRef.current
    if (img && img.complete && img.naturalWidth === 0) setFailed(true)
  }, [])

  const href = safeHref(brand.href)
  const width = Math.round(LOGO_W * brand.scale)

  const mark = failed ? (
    <Text
      as="span"
      display="flex"
      alignItems="center"
      h={`${LOGO_H}px`}
      fontFamily={monoFont}
      fontSize="12px"
      fontWeight={500}
      letterSpacing="0.08em"
      textTransform="uppercase"
      color="page.fg-secondary"
      whiteSpace="nowrap"
    >
      {brand.name}
    </Text>
  ) : (
    <Box
      as="img"
      ref={imgRef}
      src={brand.image}
      alt={href ? '' : brand.name}
      width={width}
      height={LOGO_H}
      w={`${width}px`}
      maxW="100%"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      sx={logoSx}
    />
  )

  return href ? (
    <Box
      as="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${brand.name} (opens in a new tab)`}
      display="flex"
      alignItems="center"
      minH="44px"
      borderRadius="6px"
      sx={revealSx}
      _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '4px' }}
    >
      {mark}
    </Box>
  ) : (
    <Box display="flex" alignItems="center" minH="44px">
      {mark}
    </Box>
  )
}

const Brands = ({ brands }: { brands?: HomeBrand[] }) => {
  const data: Brand[] = (Array.isArray(brands) ? brands : [])
    .map((b) => ({
      name: typeof b?.name === 'string' ? b.name.trim() : '',
      href: typeof b?.href === 'string' ? b.href : '',
      image: safeHref(b?.image),
      scale: logoScale(b?.scale),
    }))
    .filter((b) => b.name || b.image)
    .map((b) => ({ ...b, name: b.name || 'Affiliation' }))

  if (!data.length) return null

  return (
    <Box as="section" aria-labelledby="affiliations-label" py={{ base: 8, md: 10 }} w="100%">
      <Box maxW="var(--container-content)" mx="auto" px={{ base: 4, md: 6, lg: 8 }}>
        <Text
          id="affiliations-label"
          fontFamily={monoFont}
          fontSize="11px"
          letterSpacing="0.16em"
          textTransform="uppercase"
          color="page.fg-secondary"
          mb={6}
          textAlign={{ base: 'center', md: 'left' }}
        >
          Affiliations
        </Text>
        <Flex as="ul" listStyleType="none" wrap="wrap" justify="center" align="center" columnGap="48px" rowGap="24px" m={0} p={0}>
          {data.map((brand, i) => (
            <Box as="li" key={`${brand.name}-${i}`} maxW="100%">
              <BrandLogo brand={brand} />
            </Box>
          ))}
        </Flex>
      </Box>
    </Box>
  )
}

export default Brands
