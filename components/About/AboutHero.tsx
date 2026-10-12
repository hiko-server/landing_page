import React from 'react'
import { Box, Heading, Text, useColorModeValue } from '@chakra-ui/react'
import { motion } from 'framer-motion'

/**
 * /about hero — same brand treatment as the home hero: the domain-style
 * wordmark with only the TLD suffix in the accent colour, a mono eyebrow,
 * and the tagline underneath.
 */
export default function AboutHero({ brand, tagline }: { brand?: string; tagline?: string }) {
  // Hooks first — never after an early return.
  const fg = useColorModeValue('gray.900', 'gray.50')
  const dim = useColorModeValue('gray.600', 'gray.400')
  if (!brand && !tagline) return null

  const dot = brand ? brand.lastIndexOf('.') : -1
  const head = brand && dot > 0 ? brand.slice(0, dot) : brand
  const tail = brand && dot > 0 ? brand.slice(dot) : ''

  return (
    <Box
      as={motion.header}
      textAlign="center"
      mb={6}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] } as any}
    >
      <Text
        fontFamily="var(--font-geist-mono), monospace"
        fontSize="11px"
        letterSpacing="0.16em"
        textTransform="uppercase"
        color="var(--accent)"
        mb={3}
      >
        About
      </Text>
      {brand ? (
        <Heading as="h1" fontSize={{ base: '3xl', md: '5xl' }} fontWeight={700} letterSpacing="-0.025em" lineHeight="1.05" color={fg}>
          {head}
          {tail ? (
            <Box as="span" color="var(--accent)">
              {tail}
            </Box>
          ) : null}
        </Heading>
      ) : null}
      {tagline ? (
        <Text mt={3} fontSize={{ base: 'md', md: 'lg' }} color={dim} maxW="640px" mx="auto" lineHeight="1.6">
          {tagline}
        </Text>
      ) : null}
    </Box>
  )
}
