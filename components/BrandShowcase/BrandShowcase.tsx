import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Box, Text } from '@chakra-ui/react'

import { safeHref } from '../../lib/cvFormat'
import type { HomeBrand } from '../../lib/homeShape'
import {
  LOGO_GRID_COLUMNS,
  UNMEASURED_LOGO,
  balancedSpans,
  cropPlacement,
  opticalLogoSize,
  parseLogoMetrics,
  type LogoMetrics,
} from '../../lib/logoSize'
import { cssTransition } from '../../theme/tokens'

type Brand = { name: string; href: string; image: string; scale: number; metrics: LogoMetrics | null }

const SCALE_MIN = 0.5
const SCALE_MAX = 2

const DARK = "[data-theme='dark'] &, .chakra-ui-dark &"

/** The owner's per-logo scale, clamped; 1 when absent or invalid. */
function logoScale(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n > 0 ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, n)) : 1
}

const logoSx = {
  // A calm, monochrome band: logos read as one row, not a patchwork of colours.
  filter: 'grayscale(1) contrast(1.1)',
  mixBlendMode: 'multiply',
  opacity: 0.65,
  transition: cssTransition(['opacity', 'filter'], 'base'),
  // Dark: inverted and screened. The contrast step clips a JPEG's near-white
  // backdrop (≈ 250) to pure black after the inversion, which screening
  // then removes.
  [DARK]: { filter: 'grayscale(1) invert(1) contrast(1.2) brightness(1.15)', mixBlendMode: 'screen', opacity: 0.6 },
  '@media (forced-colors: active)': { filter: 'none', mixBlendMode: 'normal', opacity: 1 },
} as const

/**
 * The logo's frame: the page colour behind it inside an isolated group, so
 * the multiply / screen blend always has the page to blend with — even when
 * an ancestor (a reveal animation's transform or opacity) starts its own
 * stacking context, which would otherwise leave a white logo backdrop as a
 * visible box.
 */
const frameSx = { isolation: 'isolate' } as const

const revealSx = {
  '@media (hover: hover)': { '&:hover img': { opacity: 1, filter: 'none' } },
  '&:focus-visible img': { opacity: 1, filter: 'none' },
} as const

/** The image as a brand mark: content-box frame when measured, the fixed box otherwise. */
function LogoImage({
  brand,
  alt,
  imgRef,
  onError,
}: {
  brand: Brand
  alt: string
  imgRef: MutableRefObject<HTMLImageElement | null>
  onError: () => void
}) {
  const m = brand.metrics
  if (!m) {
    const width = Math.round(UNMEASURED_LOGO.width * brand.scale)
    return (
      <Box as="span" display="block" w={`${width}px`} maxW="100%" h={`${UNMEASURED_LOGO.height}px`} bg="page.bg" sx={frameSx}>
        <Box
          as="img"
          ref={imgRef}
          src={brand.image}
          alt={alt}
          width={width}
          height={UNMEASURED_LOGO.height}
          w="100%"
          h="100%"
          loading="lazy"
          decoding="async"
          onError={onError}
          display="block"
          objectFit="contain"
          sx={logoSx}
        />
      </Box>
    )
  }
  // Optical size (lib/logoSize.ts), the file cropped to its inked box. The
  // frame keeps the content's aspect ratio when a narrow grid cell shrinks
  // it, so nothing shifts while the image loads.
  const { width, height } = opticalLogoSize(m, brand.scale)
  const place = cropPlacement(m.crop)
  return (
    <Box
      as="span"
      display="block"
      position="relative"
      overflow="hidden"
      w={`${width}px`}
      maxW="100%"
      bg="page.bg"
      sx={{ ...frameSx, aspectRatio: String(m.aspect) }}
    >
      <Box
        as="img"
        ref={imgRef}
        src={brand.image}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        onError={onError}
        sx={logoSx}
        style={{ position: 'absolute', display: 'block', maxWidth: 'none', ...place }}
      />
    </Box>
  )
}

/**
 * Affiliations band.
 *
 * - Optically balanced logos: each is sized from its measured content box
 *   and ink density (equal areas, gentle density compensation; measured on
 *   save — lib/logoMetrics.ts, lib/logoSize.ts) and cropped to that box, so
 *   a wide wordmark no longer towers over a compact crest and file padding
 *   no longer shrinks a logo. The owner's per-logo scale (Home editor)
 *   multiplies the result. A logo without measurements keeps the fixed
 *   28 px-high box.
 * - Phones: a 6-column grid with rows of 3 or 2 (never a lone orphan:
 *   5 → 3 + 2); from md, one centred, wrapping row (48px column gap).
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

  const mark = failed ? (
    <Text
      as="span"
      display="flex"
      alignItems="center"
      h={`${UNMEASURED_LOGO.height}px`}
      fontFamily="mono"
      fontSize="caption"
      fontWeight={500}
      letterSpacing="caps-tight"
      textTransform="uppercase"
      color="page.fg-secondary"
      whiteSpace="nowrap"
    >
      {brand.name}
    </Text>
  ) : (
    <LogoImage brand={brand} alt={href ? '' : brand.name} imgRef={imgRef} onError={() => setFailed(true)} />
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
      justifyContent="center"
      maxW="100%"
      minH="44px"
      borderRadius="control"
      sx={revealSx}
      _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '4px' }}
    >
      {mark}
    </Box>
  ) : (
    <Box display="flex" alignItems="center" justifyContent="center" maxW="100%" minH="44px">
      {mark}
    </Box>
  )
}

/** Public brand entries with their clamped scale and validated measurements. */
export function brandsForDisplay(brands?: HomeBrand[]): Brand[] {
  return (Array.isArray(brands) ? brands : [])
    .map((b) => {
      const image = safeHref(b?.image)
      const metrics = parseLogoMetrics(b?.metrics)
      return {
        name: typeof b?.name === 'string' ? b.name.trim() : '',
        href: typeof b?.href === 'string' ? b.href : '',
        image,
        scale: logoScale(b?.scale),
        // Measurements of another file are stale: use the fixed box instead.
        metrics: metrics && metrics.source === (typeof b?.image === 'string' ? b.image.trim() : '') ? metrics : null,
      }
    })
    .filter((b) => b.name || b.image)
    .map((b) => ({ ...b, name: b.name || 'Affiliation' }))
}

/** The logo row itself (also the Home editor's live preview). */
export function BrandStrip({ brands }: { brands: Brand[] }) {
  const spans = balancedSpans(brands.length)
  return (
    <Box
      as="ul"
      listStyleType="none"
      m={0}
      p={0}
      display={{ base: 'grid', md: 'flex' }}
      gridTemplateColumns={`repeat(${LOGO_GRID_COLUMNS}, minmax(0, 1fr))`}
      flexWrap="wrap"
      justifyContent="center"
      alignItems="center"
      columnGap={{ base: 4, md: 12 }}
      rowGap={6}
    >
      {brands.map((brand, i) => (
        <Box
          as="li"
          key={`${brand.name}-${i}`}
          minW={0}
          maxW="100%"
          display="flex"
          justifyContent="center"
          gridColumn={{ base: `span ${spans[i]}`, md: 'auto' }}
        >
          <BrandLogo brand={brand} />
        </Box>
      ))}
    </Box>
  )
}

const Brands = ({ brands }: { brands?: HomeBrand[] }) => {
  const data = brandsForDisplay(brands)
  if (!data.length) return null

  return (
    <Box as="section" aria-labelledby="affiliations-label" py={{ base: 8, md: 10 }} w="100%">
      <Box maxW="var(--container-content)" mx="auto" px={{ base: 4, md: 6, lg: 8 }}>
        <Text
          id="affiliations-label"
          textStyle="label-wide"
          color="page.fg-secondary"
          mb={6}
          textAlign={{ base: 'center', md: 'left' }}
        >
          Affiliations
        </Text>
        <BrandStrip brands={data} />
      </Box>
    </Box>
  )
}

export default Brands
