// Brands.tsx with Chakra UI
'use client'
import React from 'react'
import { Box, Grid, Image, Link, useColorModeValue } from '@chakra-ui/react'
import { motion } from 'framer-motion'

interface Brand {
  id: number
  image: string
  href: string
  name: string
}

const SingleBrand = ({ brand }: { brand: Brand }) => {
  const { image, href, name } = brand

  const shadow = useColorModeValue('0 10px 24px rgba(0,0,0,0.08)','0 10px 24px rgba(0,0,0,0.4)')
  return (
    <motion.div
      whileHover={{ scale: 1.06, rotateX: 6, rotateY: -6 }}
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
        <Box position="relative" height="10" width="200px" style={{ perspective: 600 }}>
          <Image
            src={image}
            alt={name}
            objectFit="contain"
            w="full"
            h="full"
            transition="opacity 0.3s ease"
            _groupHover={{ opacity: 1 }}
            loading="lazy"
            filter={useColorModeValue('none','grayscale(20%) brightness(0.95)')}
            style={{ boxShadow: shadow, borderRadius: 8, padding: 6, background: useColorModeValue('#fff','rgba(255,255,255,0.06)') }}
          />
        </Box>
      </Link>
    </motion.div>
  )
}

const Brands = ({ brands }: { brands?: { name: string; href: string; image: string }[] }) => {
  const data: Brand[] = (brands || []).map((b, idx) => ({ id: idx + 1, name: b.name, href: b.href, image: b.image }))
  if (!data.length) return null
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
