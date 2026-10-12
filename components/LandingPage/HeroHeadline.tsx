import React, { useEffect, useMemo, useState } from 'react'
import { Box, Heading, Text, useColorModeValue } from '@chakra-ui/react'
import { motion, useReducedMotion } from 'framer-motion'

/**
 * Hero brand + typewriter tagline.
 *
 * v6: drop the candy-rainbow gradient on the brand and use the locked indigo
 * accent only on the `.dev` suffix (or the whole brand if it doesn't contain
 * that token). Tagline stays as plain white text on the video bg.
 *
 * Tagline phrases are separated by `|` in data/home.json and cycled with a
 * 35ms-per-char typewriter; the cursor blinks via CSS. Screen readers and
 * crawlers get every phrase as real text (the animated copy is aria-hidden),
 * and with reduced motion the first phrase is shown statically.
 */
export default function HeroHeadline({
  brand,
  tagline,
}: {
  brand?: string
  tagline?: string
}) {
  const reduce = useReducedMotion()
  const [idx, setIdx] = useState(0)
  const [text, setText] = useState('')
  const phrases = useMemo(
    () => (tagline ? tagline.split('|').map((s) => s.trim()).filter(Boolean) : []),
    [tagline],
  )

  useEffect(() => {
    if (!phrases.length) return
    const chars = phrases[idx % phrases.length]
    if (reduce) {
      setText(chars)
      return
    }
    setText('')
    let i = 0
    let pause: ReturnType<typeof setTimeout> | undefined
    const timer = setInterval(() => {
      i++
      setText(chars.slice(0, i))
      if (i >= chars.length) {
        clearInterval(timer)
        pause = setTimeout(() => setIdx((x) => x + 1), 1600)
      }
    }, 35)
    return () => {
      clearInterval(timer)
      if (pause) clearTimeout(pause)
    }
  }, [idx, phrases, reduce])

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
          minH="1.6em"
        >
          <Box as="span" className="sr-only">
            {phrases.join(' · ')}
          </Box>
          <Box as="span" aria-hidden>
            {text}
            <Box as="span" ml="2px" color="var(--accent)" className={reduce ? undefined : 'hero-caret'}>
              ▍
            </Box>
          </Box>
        </Text>
      )}
    </Box>
  )
}
