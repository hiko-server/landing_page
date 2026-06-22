import React, { useEffect, useMemo, useState } from 'react'
import { Box, Heading, Text, useColorModeValue } from '@chakra-ui/react'
import { motion } from 'framer-motion'

/**
 * Hero brand + typewriter tagline.
 *
 * v6: drop the candy-rainbow gradient on the brand and use the locked indigo
 * accent only on the `.dev` suffix (or the whole brand if it doesn't contain
 * that token). Tagline stays as plain white text on the video bg.
 *
 * Tagline phrases are separated by `|` in data/home.json and cycled with a
 * 35ms-per-char typewriter; the cursor still blinks at 550ms.
 */
export default function HeroHeadline({
  brand,
  tagline,
}: {
  brand?: string
  tagline?: string
}) {
  const [cursor, setCursor] = useState(true)
  const [idx, setIdx] = useState(0)
  const [text, setText] = useState('')
  const phrases = useMemo(
    () => (tagline ? tagline.split('|').map((s) => s.trim()).filter(Boolean) : []),
    [tagline],
  )

  useEffect(() => {
    const blink = setInterval(() => setCursor((v) => !v), 550)
    return () => clearInterval(blink)
  }, [])

  useEffect(() => {
    if (!phrases.length) return
    setText('')
    let i = 0
    const chars = phrases[idx % phrases.length]
    const timer = setInterval(() => {
      i++
      setText(chars.slice(0, i))
      if (i >= chars.length) {
        clearInterval(timer)
        setTimeout(() => setIdx((x) => x + 1), 1400)
      }
    }, 35)
    return () => clearInterval(timer)
  }, [idx, phrases])

  // Theme-aware colors (was hard-white because of v5's always-dark video bg)
  const brandColor = useColorModeValue('gray.900', 'white')
  const taglineColor = useColorModeValue('gray.600', 'rgba(255,255,255,0.78)')

  // Split brand on "." so we can paint only the TLD-like suffix with accent,
  // matching the header's "lucian-dev.com" treatment. If there's no dot, the whole
  // brand becomes accent.
  const dotIdx = brand?.lastIndexOf('.')
  const brandHead = brand && dotIdx && dotIdx > 0 ? brand.slice(0, dotIdx) : brand
  const brandTail = brand && dotIdx && dotIdx > 0 ? brand.slice(dotIdx) : ''

  return (
    <Box>
      {brand && (
        <Heading
          as={motion.h1}
          fontSize={{ base: '3xl', md: '5xl' }}
          fontWeight={700}
          letterSpacing="-0.025em"
          lineHeight="1"
          color={brandColor}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 } as any}
        >
          {brandHead}
          {brandTail && (
            <Box as="span" color="var(--accent)">
              {brandTail}
            </Box>
          )}
        </Heading>
      )}
      {phrases.length > 0 && (
        <Text
          mt={3}
          fontSize={{ base: 'sm', md: 'md' }}
          fontFamily="var(--font-geist-mono), monospace"
          color={taglineColor}
          letterSpacing="0.01em"
          maxW="640px"
        >
          {text}
          <Box
            as="span"
            ml="2px"
            opacity={cursor ? 1 : 0}
            color="var(--accent)"
            transition="opacity 100ms linear"
          >
            ▍
          </Box>
        </Text>
      )}
    </Box>
  )
}
