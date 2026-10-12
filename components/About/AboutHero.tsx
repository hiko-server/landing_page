import React from 'react'
import { Box, Flex, Heading, Text } from '@chakra-ui/react'
import { motion, useReducedMotion } from 'framer-motion'

import { taglinePhrases } from '../LandingPage/heroIdentity'

const MotionHeader = motion(Box)

/**
 * /about hero — same brand treatment as the home hero: the wordmark with
 * only a domain-style suffix in the accent colour, a mono eyebrow, and the
 * tagline underneath. The tagline is stored as "A | B | C"; the first phrase
 * reads as the lead line and the rest as hairline-separated focus areas —
 * never raw pipes.
 */
export default function AboutHero({ brand, tagline }: { brand?: string; tagline?: string }) {
  const reduce = useReducedMotion()
  const brandText = (brand || '').trim()
  const [lead, ...rest] = taglinePhrases(tagline)
  if (!brandText && !lead) return null

  const dot = brandText.lastIndexOf('.')
  const head = dot > 0 ? brandText.slice(0, dot) : brandText
  const tail = dot > 0 ? brandText.slice(dot) : ''

  return (
    <MotionHeader
      as="header"
      textAlign="center"
      mb={6}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <Text fontFamily="var(--font-geist-mono), monospace" fontSize="11px" letterSpacing="0.16em" textTransform="uppercase" color="accent.text" mb={3}>
        About
      </Text>
      <Heading as="h1" fontSize={{ base: '3xl', md: '5xl' }} fontWeight={700} letterSpacing="-0.025em" lineHeight="1.05" color="page.fg">
        {brandText ? (
          <>
            {head}
            {tail ? (
              <Box as="span" color="var(--accent)">
                {tail}
              </Box>
            ) : null}
          </>
        ) : (
          lead
        )}
      </Heading>
      {brandText && lead ? (
        <Text mt={4} fontSize={{ base: 'md', md: 'lg' }} color="page.fg-secondary" maxW="640px" mx="auto" lineHeight="1.6">
          {lead}
        </Text>
      ) : null}
      {rest.length > 0 && (
        <Flex
          as="ul"
          listStyleType="none"
          wrap="wrap"
          justify="center"
          columnGap={3}
          rowGap={1.5}
          mt={4}
          mx="auto"
          maxW="720px"
          fontFamily="var(--font-geist-mono), monospace"
          fontSize={{ base: '12px', md: '13px' }}
          letterSpacing="0.02em"
          color="page.fg-secondary"
          sx={{ '& > li + li::before': { content: '"·"', mr: 3, opacity: 0.6 } }}
        >
          {rest.map((p, i) => (
            <li key={`${i}-${p}`}>{p}</li>
          ))}
        </Flex>
      )}
    </MotionHeader>
  )
}
