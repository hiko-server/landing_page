// Brands.tsx with Chakra UI
'use client'
import React from 'react'
import { Box, Grid, Image, Link } from '@chakra-ui/react'
import { motion } from 'framer-motion'

interface Brand {
  id: number
  image: string
  href: string
  name: string
}
const brandData: Brand[] = [
  {
    id: 1,
    name: 'Client',
    href: 'https://www.uowchk.edu.hk/',
    image: '/images/brand/uowchk-logo-navy.svg',
  },
  {
    id: 2,
    name: 'Client',
    href: 'https://www.hkmu.edu.hk/',
    image: '/images/brand/hkmu.png',
  },
  {
    id: 3,
    name: 'Client',
    href: 'https://honsennaudio.com/',
    image: '/images/brand/HONSENN-CEO.svg',
  },
  {
    id: 3,
    name: 'Client',
    href: 'https://wegreen.ltd/',
    image: '/images/brand/Wegreen.svg',
  },
]

const SingleBrand = ({ brand }: { brand: Brand }) => {
  const { image, href, name } = brand

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 10 }}
      variants={{
        hidden: { opacity: 0, y: -20 },
        visible: { opacity: 1, y: 0 },
      }}
      initial="hidden"
      animate="visible"
      viewport={{ once: true }}
    >
      <Link href={href} style={{ textDecoration: 'none' }}>
        <Box position="relative" height="10" width="200px">
          <Image
            src={image}
            alt={name}
            objectFit="contain"
            w="full"
            h="full"
            transition="opacity 0.3s ease"
            _groupHover={{ opacity: 1 }}
            loading="lazy"
          />
        </Box>
      </Link>
    </motion.div>
  )
}

const Brands = ({ brands }: { brands?: { name: string; href: string; image: string }[] }) => {
  const data: Brand[] = (brands && brands.length
    ? brands.map((b, idx) => ({ id: idx + 1, name: b.name, href: b.href, image: b.image }))
    : brandData)
  return (
    <>
      {/* Clients Section */}
      <Box as="section" py={11} justifyContent="center" alignItems="center">
        <Box maxW="1390px" mx="auto" px={[4, 8, 0]}>
          <Grid
            placeItems="center"
            templateColumns={['repeat(3, 1fr)', null, 'repeat(6, 1fr)']}
            gap={[7.5, null, 12.5, 29]}
            alignItems="center"
            justifyContent="center"
          >
            {data.map((brand) => (
              <SingleBrand key={brand.id} brand={brand} />
            ))}
          </Grid>
        </Box>
      </Box>
    </>
  )
}

export default Brands
