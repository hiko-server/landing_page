import React, { useEffect, useRef, useState } from 'react'
import { Box, Flex, Text, useColorModeValue } from '@chakra-ui/react'

import { safeHref } from '../../lib/cvFormat'

type Brand = { name: string; href: string; image: string }

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

/**
 * Affiliations strip.
 *
 * - Centred, wrapping row of equal-width tiles: 2 per row on phones, then as
 *   many as fit — a short last row is centred, never a lone tile hugging the
 *   left edge, and nothing overflows at 320px.
 * - A logo that is missing or fails to load (including one that failed
 *   before hydration) falls back to a clean text chip with the brand name.
 * - Links only for safe http(s) URLs; otherwise the tile is static.
 */
const BrandTile = ({ brand }: { brand: Brand }) => {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [failed, setFailed] = useState(!brand.image)

  // An image that errored before React attached onError never fires it again.
  useEffect(() => {
    const img = imgRef.current
    if (img && img.complete && img.naturalWidth === 0) setFailed(true)
  }, [])

  // Dark mode: logos sit on a light chip so marks drawn in solid black stay legible.
  const logoChipBg = useColorModeValue('transparent', 'rgba(255,255,255,0.9)')
  const logoChipBorder = useColorModeValue('transparent', 'rgba(255,255,255,0.12)')
  const logoFilter = useColorModeValue('grayscale(15%)', 'grayscale(20%)')
  const href = safeHref(brand.href)

  const tile = (
    <Flex
      h="48px"
      w="100%"
      align="center"
      justify="center"
      px={3}
      borderRadius="8px"
      border="1px solid"
      borderColor={failed ? 'page.border' : logoChipBorder}
      bg={failed ? 'transparent' : logoChipBg}
      sx={{ transition: 'border-color 200ms var(--ease-out-quart), transform 200ms var(--ease-out-quart)' }}
    >
      {failed ? (
        <Text
          as="span"
          fontFamily={monoFont}
          fontSize="12px"
          fontWeight={500}
          letterSpacing="0.08em"
          textTransform="uppercase"
          color="page.fg-secondary"
          noOfLines={1}
          textAlign="center"
        >
          {brand.name}
        </Text>
      ) : (
        <Box
          as="img"
          ref={imgRef}
          src={brand.image}
          alt={brand.name}
          loading="lazy"
          decoding="async"
          maxH="28px"
          maxW="100%"
          objectFit="contain"
          onError={() => setFailed(true)}
          sx={{ filter: logoFilter, transition: 'filter 250ms var(--ease-out-quart)' }}
        />
      )}
    </Flex>
  )

  return href ? (
    <Box
      as="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${brand.name} (opens in a new tab)`}
      display="block"
      borderRadius="8px"
      sx={{
        '@media (hover: hover)': {
          '&:hover > div': { borderColor: 'var(--chakra-colors-page-border-strong)' },
          '&:hover img': { filter: 'none' },
        },
        '@media (hover: hover) and (prefers-reduced-motion: no-preference)': {
          '&:hover > div': { transform: 'translateY(-2px)' },
        },
      }}
      _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '3px' }}
    >
      {tile}
    </Box>
  ) : (
    tile
  )
}

const Brands = ({ brands }: { brands?: { name: string; href: string; image: string }[] }) => {
  const data: Brand[] = (Array.isArray(brands) ? brands : [])
    .map((b) => ({
      name: typeof b?.name === 'string' ? b.name.trim() : '',
      href: typeof b?.href === 'string' ? b.href : '',
      image: safeHref(b?.image),
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
        <Flex as="ul" listStyleType="none" wrap="wrap" justify="center" gap={{ base: 3, sm: 4, md: 6 }}>
          {data.map((brand, i) => (
            <Box
              as="li"
              key={`${brand.name}-${i}`}
              // Two per row on phones (12px gap), fixed tiles from sm up.
              flex="0 0 auto"
              w={{ base: 'calc(50% - 6px)', sm: '148px', md: '160px' }}
            >
              <BrandTile brand={brand} />
            </Box>
          ))}
        </Flex>
      </Box>
    </Box>
  )
}

export default Brands
