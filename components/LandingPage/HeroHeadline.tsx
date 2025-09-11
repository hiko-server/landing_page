import React, { useEffect, useMemo, useState } from 'react'
import { Box, Heading, Text, useColorModeValue } from '@chakra-ui/react'
import { motion } from 'framer-motion'

export default function HeroHeadline({ brand, tagline }: { brand?: string; tagline?: string }) {
  const accent = useColorModeValue('linear-gradient(90deg,#60a5fa,#34d399,#f472b6)','linear-gradient(90deg,#93c5fd,#6ee7b7,#f9a8d4)')
  const [cursor, setCursor] = useState(true)
  const [idx, setIdx] = useState(0)
  const [text, setText] = useState('')
  const phrases = useMemo(() => (tagline ? tagline.split('|').map(s => s.trim()).filter(Boolean) : []), [tagline])

  useEffect(() => {
    const blink = setInterval(() => setCursor(v => !v), 550)
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
        setTimeout(() => setIdx(x => x + 1), 1400)
      }
    }, 35)
    return () => clearInterval(timer)
  }, [idx, phrases])

  return (
    <Box>
      {brand && (
        <Heading
          as={motion.h1}
          fontSize={{ base: '3xl', md: '5xl' }}
          fontWeight="extrabold"
          bgImage={accent}
          bgClip="text"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {brand}
        </Heading>
      )}
      {phrases.length > 0 && (
        <Text mt={2} fontSize={{ base: 'md', md: 'xl' }} color={'white'}>
          {text}
          <Box as="span" ml={1} opacity={cursor ? 1 : 0}>|
          </Box>
        </Text>
      )}
    </Box>
  )
}
