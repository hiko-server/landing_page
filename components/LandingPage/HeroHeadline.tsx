import React, { useEffect, useMemo, useState } from 'react'
import { Box, Heading, Text } from '@chakra-ui/react'

import type { HeroIdentity } from './heroIdentity'
import { revealSx } from './heroReveal'

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

/**
 * Hero copy block: brand eyebrow → h1 (person + role) → rotating phrases.
 *
 *   ● LUCIAN SPHERE
 *   Li Yanpei / 李彦霈                     ← h1, line 1 (from the public CV)
 *   Self-Taught Full-Stack Software Engineer ← h1, line 2 (first tagline phrase)
 *   > Machine Learning▍                     ← remaining phrases, typewriter
 *
 * The page's only h1 names the person; the brand is a styled eyebrow. The
 * typewriter line reserves the height of its longest phrase, so typing never
 * reflows the CTAs below. Screen readers get every phrase as plain text (the
 * animated copy is aria-hidden); with reduced motion the first phrase is
 * shown statically.
 */
export default function HeroHeadline({
  brand,
  identity,
  role,
  rotating,
  startStep = 0,
}: {
  brand?: string
  identity: HeroIdentity
  role: string
  rotating: string[]
  /** Stagger index of the first element (the hero reveals top → bottom). */
  startStep?: number
}) {
  const headline = identity.name || identity.nick
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
              <Box as="span" color="var(--accent)">
                {brandTail}
              </Box>
            )}
          </span>
        </Text>
      )}

      <Heading as="h1" fontWeight="inherit" lineHeight="inherit" letterSpacing="inherit" fontSize="inherit" m={0}>
        {headline && (
          <Box
            as="span"
            display="block"
            fontSize={{ base: '40px', sm: '48px', md: '56px', lg: '64px' }}
            fontWeight={600}
            lineHeight="1.02"
            letterSpacing="-0.035em"
            color="page.fg"
            sx={revealSx(startStep + 1)}
          >
            {headline}
            {identity.nameZh && (
              <Box as="span" fontWeight={300} color="page.fg-secondary" whiteSpace="nowrap">
                <Box as="span" aria-hidden>
                  {' / '}
                </Box>
                <span className="sr-only">, </span>
                <span lang="zh-Hans">{identity.nameZh}</span>
              </Box>
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

      {rotating.length > 0 && (
        <Box mt={{ base: 4, md: 5 }} sx={revealSx(startStep + 3)}>
          <Typewriter phrases={rotating} />
        </Box>
      )}
    </Box>
  )
}

/** Reduced-motion preference, read after mount so SSR and hydration markup match. */
function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduce(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return reduce
}

function Typewriter({ phrases }: { phrases: string[] }) {
  const reduce = usePrefersReducedMotion()
  const [idx, setIdx] = useState(0)
  const [text, setText] = useState('')
  const longest = useMemo(() => phrases.reduce((a, b) => (b.length > a.length ? b : a), ''), [phrases])

  useEffect(() => {
    if (reduce || !phrases.length) return
    const chars = phrases[idx % phrases.length]
    setText('')
    let i = 0
    let pause: ReturnType<typeof setTimeout> | undefined
    const timer = setInterval(() => {
      i++
      setText(chars.slice(0, i))
      if (i >= chars.length) {
        clearInterval(timer)
        pause = setTimeout(() => setIdx((x) => x + 1), 1800)
      }
    }, 34)
    return () => {
      clearInterval(timer)
      if (pause) clearTimeout(pause)
    }
  }, [idx, phrases, reduce])

  const lineSx = {
    fontFamily: monoFont,
    fontSize: { base: '13px', md: '14px' },
    lineHeight: '1.6',
    letterSpacing: '0.01em',
    color: 'page.fg-secondary',
    maxW: '640px',
  }

  // Reduced motion: the first phrase, static, in the same reserved box.
  const shown = reduce ? phrases[0] : text

  return (
    <Text as="div" sx={lineSx}>
      <span className="sr-only">{phrases.join(' · ')}</span>
      {/* Both layers share one grid cell: the invisible longest phrase sets the height. */}
      <Box aria-hidden display="grid" sx={{ '& > *': { gridArea: '1 / 1' } }}>
        <Box as="span" visibility="hidden" pl="1.4em">
          {longest}▍
        </Box>
        <Box as="span" pl="1.4em" position="relative">
          <Box as="span" position="absolute" left={0} color="var(--accent)">
            {'>'}
          </Box>
          {shown}
          <Box as="span" ml="2px" color="var(--accent)" className={reduce ? undefined : 'hero-caret'}>
            ▍
          </Box>
        </Box>
      </Box>
    </Text>
  )
}
