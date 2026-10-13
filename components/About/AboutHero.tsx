import { Box, Flex, Heading, Text } from '@chakra-ui/react'
import { keyframes } from '@emotion/react'

import { taglinePhrases, type HeroIdentity } from '../LandingPage/heroIdentity'
import { PERSON_NAME } from '../../lib/schema'

const monoFont = 'var(--font-geist-mono), monospace'

/**
 * Entrance as a CSS animation, not a JS-gated one: the h1 (this page's LCP
 * element) is visible in the server HTML and paints before hydration.
 */
const rise = keyframes`from { opacity: 0; transform: translate3d(0, 10px, 0); } to { opacity: 1; transform: none; }`
const entranceSx = {
  animation: `${rise} 450ms cubic-bezier(0.22, 1, 0.36, 1) both`,
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
}

/**
 * The h1 of /about: the public identity name (website-pruned CV, same rule
 * as the home hero), then the nickname, then the site-wide person name.
 */
export function aboutHeading(identity: HeroIdentity | null | undefined): string {
  return identity?.name || identity?.nick || PERSON_NAME
}

/**
 * /about hero. The brand ("Lucian Sphere") is the mono eyebrow; the h1 is
 * the person's name, with the 中文 name and nickname from the public CV
 * underneath when they are set. The tagline is stored as "A | B | C": the
 * first phrase reads as the lead line and the rest as hairline-separated
 * focus areas — never raw pipes.
 */
export default function AboutHero({
  brand,
  tagline,
  identity,
}: {
  brand?: string
  tagline?: string
  identity?: HeroIdentity | null
}) {
  const eyebrow = (brand || '').trim() || 'About'
  const heading = aboutHeading(identity)
  const [lead, ...rest] = taglinePhrases(tagline)
  const nick = identity?.name && identity.nick && identity.nick !== heading ? identity.nick : ''
  const nameZh = identity?.nameZh && identity.nameZh !== heading ? identity.nameZh : ''

  return (
    <Box as="header" textAlign="center" mb={6} sx={entranceSx}>
      <Text fontFamily={monoFont} fontSize="11px" letterSpacing="0.16em" textTransform="uppercase" color="accent.text" mb={3}>
        {eyebrow}
      </Text>
      <Heading as="h1" fontSize={{ base: '3xl', md: '5xl' }} fontWeight={700} letterSpacing="-0.025em" lineHeight="1.05" color="page.fg">
        {heading}
      </Heading>
      {nameZh || nick ? (
        <Flex
          justify="center"
          wrap="wrap"
          columnGap={3}
          rowGap={1}
          mt={3}
          fontSize={{ base: 'sm', md: 'md' }}
          color="page.fg-secondary"
          sx={{ '& > span + span::before': { content: '"·"', mr: 3, opacity: 0.6 } }}
        >
          {nameZh ? <span lang="zh-Hans">{nameZh}</span> : null}
          {nick ? <span>{nick}</span> : null}
        </Flex>
      ) : null}
      {lead ? (
        <Text className="lede" mt={4} fontSize={{ base: 'md', md: 'lg' }} color="page.fg-secondary" maxW="640px" mx="auto" lineHeight="1.6">
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
          fontFamily={monoFont}
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
    </Box>
  )
}
