import React, { useEffect, useState } from 'react'
import NextLink from 'next/link'
import { Box, Button, Flex, Heading, IconButton, Text } from '@chakra-ui/react'
import Picture from '../Common/Picture'
import { keyframes } from '@emotion/react'

import Hint, { HintGroup } from '../General-UI/Hint'
import { GitHubIcon, GitLabIcon, LinkedInIcon, WhatsAppIcon } from '../Icons/brand'
import type { SocialLink, SocialName } from '../Chrome/chrome'
import type { AvailabilityView } from '../Common/contactForm'
import type { HeroIdentity } from '../LandingPage/heroIdentity'
import { clearOfHeader } from '../../lib/anchorOffset'
import { cvPdfPath } from '../../lib/cvExport/paths'
import type { CvLang } from '../../lib/cvVisibility'
import { aboutHeading, paperCount, type AboutNavEntry } from './aboutNav'
import OrcidIdLink from '../Common/OrcidIdLink'

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

const SOCIAL_ICONS: Record<SocialName, React.ReactElement> = {
  GitHub: <GitHubIcon />,
  GitLab: <GitLabIcon />,
  LinkedIn: <LinkedInIcon />,
  WhatsApp: <WhatsAppIcon />,
}

/**
 * Entrance as a CSS animation, not a JS-gated one: the h1 (this page's LCP
 * candidate) is visible in the server HTML and paints before hydration.
 */
const rise = keyframes`from { opacity: 0; transform: translate3d(0, 8px, 0); } to { opacity: 1; transform: none; }`
const entranceSx = {
  animation: `${rise} 450ms cubic-bezier(0.22, 1, 0.36, 1) both`,
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
}

/** Portrait as published: the Home editor's crop (object-position + scale), intrinsic size, upload srcset. */
export type RailPortrait = { src: string; srcSet?: string; avifSrcSet?: string; width?: number; height?: number; x: number; y: number; scale: number; alt: string }

/**
 * The section whose top most recently passed the upper third of the
 * viewport, for aria-current in the nav. IntersectionObserver only; nothing
 * runs while scrolling otherwise.
 */
function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null)
  const key = ids.join('|')
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !ids.length) return
    const visible = new Map<string, boolean>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting)
        const first = ids.find((id) => visible.get(id))
        if (first) setActive(first)
      },
      { rootMargin: '-25% 0px -65% 0px' },
    )
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
    // `key` stands for `ids` (a new array each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return active
}

/**
 * /about identity rail — the page header: portrait, names (the h1),
 * availability, the CV, the publications (a link with the count, once
 * /publications lists a paper), profiles, the ORCID iD (once set: the iD
 * icon and the record's URI, per ORCID's display guidelines) and, from lg
 * up, a nav of the page's sections with the current one marked. Sticky
 * beside the content on large screens (scrolling inside itself if the
 * window is too short), a plain header block above it on smaller ones and
 * in print.
 */
export default function IdentityRail({
  brand,
  identity,
  portrait,
  availability,
  socials,
  nav,
  cvLang = 'en',
  publicationCount = 0,
  orcid = '',
  orcidAuthenticated = false,
}: {
  brand?: string
  identity?: HeroIdentity | null
  portrait: RailPortrait | null
  availability: AvailabilityView | null
  socials: SocialLink[]
  nav: AboutNavEntry[]
  /** Language the page's CV stack shows: View CV and Download PDF follow it (/cv or /cv/zh, /cv.pdf or /cv/zh.pdf). */
  cvLang?: CvLang
  /** Papers on /publications; 0 = no page, no link. */
  publicationCount?: number
  /** The owner's public ORCID iD (bare, lib/cvLinks orcidOf); '' = no link. */
  orcid?: string
  /** The owner connected the iD (lib/orcid/cv orcidAuthenticatedOf): the authenticated iD icon; else the unauthenticated one. */
  orcidAuthenticated?: boolean
}) {
  const heading = aboutHeading(identity)
  const nick = identity?.name && identity.nick && identity.nick !== heading ? identity.nick : ''
  const nameZh = identity?.nameZh && identity.nameZh !== heading ? identity.nameZh : ''
  const eyebrow = (brand || '').trim() || 'About'
  const active = useActiveSection(nav.map((n) => n.id))

  return (
    <Box
      // The page's header (it holds the h1), not a landmark of its own.
      as="header"
      position={{ base: 'static', lg: 'sticky' }}
      top={{ lg: clearOfHeader('8px') }}
      maxH={{ lg: `calc(100vh - var(--header-h) - 48px)` }}
      overflowY={{ lg: 'auto' }}
      pr={{ lg: 2 }}
      sx={{
        scrollbarWidth: 'thin',
        '@media print': { position: 'static', maxHeight: 'none', overflow: 'visible' },
      }}
    >
      <Box sx={entranceSx}>
        <Flex align="center" gap={4}>
          {portrait ? (
            <Box
              position="relative"
              flexShrink={0}
              w={{ base: '72px', md: '88px' }}
              h={{ base: '72px', md: '88px' }}
              borderRadius="18px"
              overflow="hidden"
              border="1px solid"
              borderColor="page.border-strong"
              bg="page.bg-elevated"
            >
              <Picture avifSrcSet={portrait.srcSet ? portrait.avifSrcSet : null} sizes="88px">
                <Box
                  as="img"
                  src={portrait.src}
                  srcSet={portrait.srcSet}
                  sizes={portrait.srcSet ? '88px' : undefined}
                  width={portrait.width}
                  height={portrait.height}
                  alt={portrait.alt}
                  decoding="async"
                  draggable={false}
                  position="absolute"
                  inset={0}
                  w="100%"
                  h="100%"
                  maxW="none"
                  style={{
                    objectFit: 'cover',
                    objectPosition: `${portrait.x}% ${portrait.y}%`,
                    transform: `scale(${portrait.scale})`,
                    transformOrigin: `${portrait.x}% ${portrait.y}%`,
                  }}
                />
              </Picture>
            </Box>
          ) : null}
          <Box minW={0}>
            <Text fontFamily={monoFont} fontSize="11px" letterSpacing="0.16em" textTransform="uppercase" color="accent.text" mb={1.5}>
              {eyebrow}
            </Text>
            <Heading as="h1" fontSize={{ base: '3xl', md: '4xl' }} fontWeight={700} letterSpacing="-0.025em" lineHeight="1.05" color="page.fg">
              {heading}
            </Heading>
            {nameZh || nick ? (
              <Flex
                wrap="wrap"
                columnGap={2.5}
                rowGap={0.5}
                mt={1.5}
                fontSize={{ base: 'sm', md: 'md' }}
                color="page.fg-secondary"
                sx={{ '& > span + span::before': { content: '"·"', mr: 2.5, opacity: 0.6 } }}
              >
                {nameZh ? <span lang="zh-Hans">{nameZh}</span> : null}
                {nick ? <span>{nick}</span> : null}
              </Flex>
            ) : null}
          </Box>
        </Flex>

        {availability ? (
          <Flex as="p" align="center" gap={2.5} mt={6} fontSize="14px" color="page.fg" flexWrap="wrap" data-availability={availability.status}>
            <Box
              as="span"
              aria-hidden
              w="8px"
              h="8px"
              borderRadius="full"
              flexShrink={0}
              bg={`status.${availability.status}`}
              sx={{ '@media (forced-colors: active)': { bg: 'CanvasText', forcedColorAdjust: 'none' } }}
            />
            <span>{availability.label}</span>
            {availability.from ? (
              <Text as="span" fontFamily={monoFont} fontSize="12px" color="page.fg-secondary" className="tnum">
                from <time dateTime={availability.from}>{availability.from}</time>
              </Text>
            ) : null}
          </Flex>
        ) : null}

        <Flex gap={2} mt={6} wrap="wrap" sx={{ '@media print': { display: 'none' } }}>
          <Button
            as={NextLink}
            href={cvLang === 'zh' ? '/cv/zh' : '/cv'}
            h="40px"
            px={5}
            bg="accent.solid"
            color="accent.fg"
            fontSize="14px"
            fontWeight={500}
            _hover={{ bg: 'accent.solid-hover' }}
            _active={{ bg: 'accent.solid-active' }}
            _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '3px' }}
          >
            View CV&nbsp;<span className="nudge" aria-hidden>→</span>
          </Button>
          <Button
            as="a"
            href={cvPdfPath(cvLang)}
            download
            hrefLang={cvLang === 'zh' ? 'zh-Hans' : 'en'}
            h="40px"
            px={4}
            variant="outline"
            borderColor="page.border-strong"
            color="page.fg"
            bg="page.surface"
            fontSize="14px"
            fontWeight={500}
            _hover={{ borderColor: 'page.fg-secondary', bg: 'page.surface' }}
            _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '3px' }}
          >
            Download PDF
          </Button>
        </Flex>

        {publicationCount > 0 ? (
          <Box mt={3} sx={{ '@media print': { display: 'none' } }}>
            <Flex
              as={NextLink}
              href="/publications"
              // One name for the whole link — "Publications: 3 papers" — that starts with its visible label (WCAG 2.5.3).
              aria-label={`Publications: ${paperCount(publicationCount)}`}
              display="inline-flex"
              align="center"
              gap={2}
              minH="32px"
              fontSize="14px"
              fontWeight={500}
              color="page.fg"
              borderRadius="md"
              _hover={{ color: 'accent.text', textDecoration: 'none' }}
              _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '3px' }}
              sx={{ '&:hover .rail-count': { borderColor: 'var(--accent)', color: 'accent.text' } }}
            >
              Publications
              <Box
                as="span"
                className="rail-count tnum"
                aria-hidden
                fontFamily={monoFont}
                fontSize="12px"
                lineHeight="20px"
                minW="22px"
                px={1.5}
                textAlign="center"
                borderRadius="full"
                border="1px solid"
                borderColor="page.border-strong"
                color="page.fg-secondary"
                sx={{ transition: 'border-color var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard)' }}
              >
                {publicationCount}
              </Box>
              <span className="nudge" aria-hidden>
                →
              </span>
            </Flex>
          </Box>
        ) : null}

        {orcid ? (
          <Box mt={publicationCount > 0 ? 1 : 3} sx={{ '@media print': { display: 'none' } }}>
            <OrcidIdLink
              id={orcid}
              authenticated={orcidAuthenticated}
              lang={cvLang}
              iconSize={16}
              minH="32px"
              fontSize="14px"
              fontWeight={500}
              color="page.fg"
              borderRadius="md"
              _hover={{ color: 'accent.text', textDecoration: 'none' }}
              _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '3px' }}
            />
          </Box>
        ) : null}

        {socials.length > 0 ? (
          <HintGroup>
            <Flex as="ul" listStyleType="none" gap={2} mt={4} aria-label="Profiles" sx={{ '@media print': { display: 'none' } }}>
              {socials.map((s) => (
                <li key={s.name}>
                  <Hint label={s.name} placement="top">
                    <IconButton
                      as="a"
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer me"
                      aria-label={`${s.name} (opens in a new tab)`}
                      icon={SOCIAL_ICONS[s.name]}
                      variant="outline"
                      h="40px"
                      w="40px"
                      minW="40px"
                      borderColor="page.border-strong"
                      color="page.fg"
                      bg="page.surface"
                      _hover={{ borderColor: 'page.fg-secondary', color: 'accent.text' }}
                      _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '3px' }}
                    />
                  </Hint>
                </li>
              ))}
            </Flex>
          </HintGroup>
        ) : null}
      </Box>

      {nav.length > 1 ? (
        <Box as="nav" aria-label="On this page" display={{ base: 'none', lg: 'block' }} mt={10} sx={{ '@media print': { display: 'none' } }}>
          <Text fontFamily={monoFont} fontSize="11px" letterSpacing="0.12em" textTransform="uppercase" color="page.fg-subtle" mb={3}>
            On this page
          </Text>
          <Box as="ul" listStyleType="none" borderLeft="1px solid" borderColor="page.border">
            {nav.map((n) => {
              const current = active === n.id
              return (
                <li key={n.id}>
                  <Box
                    as="a"
                    href={`#${n.id}`}
                    lang={n.lang}
                    aria-current={current ? 'location' : undefined}
                    display="block"
                    py={1.5}
                    pl={4}
                    ml="-1px"
                    borderLeft="1px solid"
                    borderColor={current ? 'var(--accent)' : 'transparent'}
                    fontSize="14px"
                    lineHeight="1.4"
                    color={current ? 'page.fg' : 'page.fg-secondary'}
                    sx={{
                      transition: 'color 160ms var(--ease-out-quart), border-color 160ms var(--ease-out-quart)',
                      '&:hover': { color: 'page.fg' },
                      '&:focus-visible': { outline: '2px solid var(--accent)', outlineOffset: '2px', borderRadius: '2px' },
                    }}
                  >
                    {n.label}
                  </Box>
                </li>
              )
            })}
          </Box>
        </Box>
      ) : null}
    </Box>
  )
}
