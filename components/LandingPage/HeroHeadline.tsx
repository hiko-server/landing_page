import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Flex, Heading, Text } from '@chakra-ui/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

import type { HeroIdentity } from './heroIdentity'
import { headlineWords, heroWordStyle, revealSx } from './heroReveal'

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'
const ROTATE_MS = 2600
const SWAP = { duration: 0.26, ease: [0.22, 1, 0.36, 1] } as const

/**
 * Hero copy block: brand eyebrow → h1 (person + role) → rotating phrases.
 *
 *   ● LUCIAN SPHERE
 *   Li Yanpei / 李彦霈                     ← h1, line 1 (from the public CV)
 *   Self-Taught Full-Stack Software Engineer ← h1, line 2 (first tagline phrase)
 *   > Machine Learning                      ← remaining phrases, swapped in place
 *
 * The page's only h1 names the person; the brand is a styled eyebrow. The
 * name rises word by word out of a blur (pure CSS, `.hero-word`, so it runs
 * before hydration; instant under reduced motion). The phrase line reserves
 * the box of its longest phrase, so swapping never reflows the CTAs below.
 * Screen readers get every phrase as plain text (the animated copy is
 * aria-hidden); with reduced motion the first phrase is shown statically.
 */
export default function HeroHeadline({
  brand,
  identity,
  role,
  rotating,
  startStep = 0,
  avatar,
}: {
  brand?: string
  identity: HeroIdentity
  role: string
  rotating: string[]
  /** Stagger index of the first element (the hero reveals top → bottom). */
  startStep?: number
  /** Small portrait shown beside the h1 below md (the large card is hidden there). */
  avatar?: React.ReactNode
}) {
  // EN name (or nickname) leads; when the owner shows only the 中文 name it leads alone.
  const primary = identity.name || identity.nick
  const headline = primary || identity.nameZh
  const brandText = (brand || '').trim()
  // Paint only a domain-style suffix (".dev") in the accent, as the header does.
  const dot = brandText.lastIndexOf('.')
  const brandHead = dot > 0 ? brandText.slice(0, dot) : brandText
  const brandTail = dot > 0 ? brandText.slice(dot) : ''

  return (
    <Box>
      {brandText && (
        <Text
          display="inline-flex"
          alignItems="center"
          gap={2}
          mb={{ base: 4, md: 5 }}
          fontFamily={monoFont}
          fontSize="11px"
          letterSpacing="0.16em"
          textTransform="uppercase"
          color="page.fg-secondary"
          sx={revealSx(startStep)}
        >
          <Box as="span" aria-hidden w="6px" h="6px" borderRadius="full" bg="var(--accent)" flexShrink={0} />
          <span>
            {brandHead}
            {brandTail && (
              <Box as="span" color="accent.text">
                {brandTail}
              </Box>
            )}
          </span>
        </Text>
      )}

      <Flex align="flex-start" gap={4}>
        {avatar && (
          <Box display={{ base: 'block', md: 'none' }} flexShrink={0} mt="2px">
            {avatar}
          </Box>
        )}
        <Heading as="h1" flex="1" minW={0} fontWeight="inherit" lineHeight="inherit" letterSpacing="inherit" fontSize="inherit" m={0}>
          {headline && (
            <Box
              as="span"
              display="block"
              fontSize={{ base: '40px', sm: '48px', md: '56px', lg: '64px' }}
              fontWeight={600}
              lineHeight="1.02"
              letterSpacing="-0.035em"
              color="page.fg"
            >
              {primary ? (
                <Words text={primary} />
              ) : (
                <span className="hero-word" style={heroWordStyle(0)} lang="zh-Hans">
                  {identity.nameZh}
                </span>
              )}
              {primary && identity.nameZh && (
                <>
                  {' '}
                  <Box
                    as="span"
                    className="hero-word"
                    style={heroWordStyle(headlineWords(primary).length)}
                    fontWeight={300}
                    color="page.fg-secondary"
                    whiteSpace="nowrap"
                  >
                    <Box as="span" aria-hidden>
                      {'/ '}
                    </Box>
                    <span className="sr-only">, </span>
                    <span lang="zh-Hans">{identity.nameZh}</span>
                  </Box>
                </>
              )}
              <span className="sr-only">, </span>
            </Box>
          )}
          <Box
            as="span"
            display="block"
            mt={headline ? { base: 3, md: 4 } : 0}
            fontSize={{ base: '18px', md: '22px' }}
            fontWeight={400}
            lineHeight="1.35"
            letterSpacing="-0.012em"
            color={headline ? 'page.fg-secondary' : 'page.fg'}
            maxW="42ch"
            sx={revealSx(startStep + 2)}
          >
            {role}
          </Box>
        </Heading>
      </Flex>

      {rotating.length > 0 && (
        <Box mt={{ base: 4, md: 5 }} sx={revealSx(startStep + 3)}>
          <PhraseSwap phrases={rotating} />
        </Box>
      )}
    </Box>
  )
}

/** The Latin name as `.hero-word` spans with normal spaces between them. */
function Words({ text }: { text: string }) {
  const words = headlineWords(text)
  return (
    <>
      {words.map((w, i) => (
        <React.Fragment key={i}>
          {i > 0 && ' '}
          <span className="hero-word" style={heroWordStyle(i)}>
            {w}
          </span>
        </React.Fragment>
      ))}
    </>
  )
}

/**
 * One phrase at a time, swapped every 2.6 s with a short blur rise; paused
 * while the hero is off-screen or the tab is hidden. Both layers share one
 * grid cell: the invisible longest phrase sets the box, so nothing below
 * ever moves (the leaving phrase is popped out of flow).
 */
function PhraseSwap({ phrases }: { phrases: string[] }) {
  const reduce = useReducedMotion()
  const [idx, setIdx] = useState(0)
  const [onScreen, setOnScreen] = useState(true)
  const [tabVisible, setTabVisible] = useState(true)
  const ref = useRef<HTMLDivElement | null>(null)
  const longest = useMemo(() => phrases.reduce((a, b) => (b.length > a.length ? b : a), ''), [phrases])

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => setOnScreen(entries.some((e) => e.isIntersecting)))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const sync = () => setTabVisible(document.visibilityState !== 'hidden')
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  const count = phrases.length
  useEffect(() => {
    if (reduce || count < 2 || !onScreen || !tabVisible) return
    const t = window.setTimeout(() => setIdx((i) => (i + 1) % count), ROTATE_MS)
    return () => window.clearTimeout(t)
  }, [idx, count, reduce, onScreen, tabVisible])

  const shown = reduce ? 0 : idx % Math.max(1, count)

  return (
    <Text
      as="div"
      ref={ref}
      fontFamily={monoFont}
      fontSize={{ base: '13px', md: '14px' }}
      lineHeight="1.6"
      letterSpacing="0.01em"
      color="page.fg-secondary"
      maxW="640px"
    >
      <span className="sr-only">{phrases.join(' · ')}</span>
      <Box aria-hidden position="relative" pl="1.4em">
        <Box as="span" position="absolute" left={0} top={0} color="accent.text">
          {'>'}
        </Box>
        <Box display="grid" position="relative" sx={{ '& > *': { gridArea: '1 / 1' } }}>
          <Box as="span" visibility="hidden">
            {longest}
          </Box>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={shown}
              initial={{ opacity: 0, y: '40%', filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: '-40%', filter: 'blur(4px)' }}
              transition={SWAP}
            >
              {phrases[shown]}
            </motion.span>
          </AnimatePresence>
        </Box>
      </Box>
    </Text>
  )
}
