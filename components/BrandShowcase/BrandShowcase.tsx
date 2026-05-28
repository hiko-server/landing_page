'use client'
import React from 'react'
import { Box, Grid, Image, Link, useColorModeValue, Text } from '@chakra-ui/react'
import { motion } from 'framer-motion'

interface Brand {
  id: number
  image: string
  href: string
  name: string
}

/**
 * v6 Brands strip.
 * Replaces v5's white-card + 3D tilt with a calm monochrome row that respects
 * dark mode. Logos sit on transparent ground; in dark mode they desaturate
 * slightly so the row doesn't punch through the dot grid.
 */

const SingleBrand = ({ brand }: { brand: Brand }) => {
  const { image, href, name } = brand
  const filter = useColorModeValue('grayscale(15%)', 'grayscale(20%) opacity(0.95)')
  // In dark mode, give the logo a subtle light chip behind it so partner
  // marks that ship as solid black on transparent backgrounds stay legible
  // without us touching their colors.
  const chipBg = useColorModeValue('transparent', 'rgba(255,255,255,0.88)')
  const chipBorder = useColorModeValue('transparent', 'rgba(255,255,255,0.12)')

  return (
    <motion.div
      whileHover={{ scale: 1.04, y: -2 }}
      transition={{ type: 'spring', stiffness: 380, damping: 18 }}
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
    >
      <Link href={href} isExternal aria-label={name} _hover={{ textDecoration: 'none' }}>
        <Box
          position="relative"
          h="40px"
          w={{ base: '120px', md: '160px' }}
          display="flex"
          alignItems="center"
          justifyContent="center"
          bg={chipBg}
          border="1px solid"
          borderColor={chipBorder}
          borderRadius="8px"
          px={3}
          transition="background 200ms var(--ease-out-quart)"
        >
          <Image
            src={image}
            alt={name}
            objectFit="contain"
            maxH="28px"
            maxW="100%"
            loading="lazy"
            filter={filter}
            transition="filter 250ms var(--ease-out-quart)"
            _hover={{ filter: 'none' }}
          />
        </Box>
      </Link>
    </motion.div>
  )
}

const Brands = ({
  brands,
}: {
  brands?: { name: string; href: string; image: string }[]
}) => {
  const data: Brand[] = (brands || []).map((b, idx) => ({
    id: idx + 1,
    name: b.name,
    href: b.href,
    image: b.image,
  }))
  const labelColor = useColorModeValue('gray.600', 'gray.500')

  if (!data.length) return null

  return (
    <Box as="section" py={10} w="100%">
      <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]}>
        <Text
          fontFamily="var(--font-geist-mono), monospace"
          fontSize="10px"
          letterSpacing="0.16em"
          textTransform="uppercase"
          color={labelColor}
          mb={6}
          textAlign={['center', 'left']}
        >
          Affiliations
        </Text>
        <Grid
          placeItems="center"
          templateColumns={['repeat(2, 1fr)', 'repeat(3, 1fr)', 'repeat(4, 1fr)']}
          gap={[6, 8, 12]}
        >
          {data.map((brand) => (
            <SingleBrand key={brand.id} brand={brand} />
          ))}
        </Grid>
      </Box>
    </Box>
  )
}

export default Brands
