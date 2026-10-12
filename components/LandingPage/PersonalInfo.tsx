import React, { useMemo } from 'react'
// Type-only import from the pure shape module — never lib/home (server-only).
import type { HomeData } from '../../lib/homeShape'
import type { CurrentlyCoding } from '../../lib/currentlyCoding'
import { safeHref } from '../../lib/cvFormat'
import { Box, Button, Flex, Text, Image, IconButton, Tooltip } from '@chakra-ui/react'
import { FaGithub, FaGitlab, FaLinkedin, FaWhatsapp } from 'react-icons/fa'
import NextLink from 'next/link'
import NextImage from 'next/image'

import HeroHeadline from './HeroHeadline'
import HeroAmbient from '../Background/HeroAmbient'
import SectionLabel from '../General-UI/SectionLabel'
import { heroCopy, portraitAlt, type HeroIdentity } from './heroIdentity'
import { revealSx, settleSx } from './heroReveal'

/**
 * [01] Introduction — the home hero.
 *
 * One composition for every width, laid out with responsive props only (no
 * JS media queries, so the server HTML is final and nothing jumps after
 * hydration). Reading order is the same everywhere:
 *
 *   brand eyebrow → h1 (name + role) → rotating phrases → meta → CTAs → portrait
 *
 * ≥ md the portrait sits in a right-hand column; below md it closes the hero
 * as a compact profile row (portrait + "currently coding" note) under a
 * hairline, so the headline is always the first thing read.
 */

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

const SOCIALS: Array<{ key: keyof HomeData['socials']; name: string; icon: React.ReactElement; fallback: string }> = [
  { key: 'github', name: 'GitHub', icon: <FaGithub />, fallback: 'https://github.com/HikoPLi' },
  { key: 'gitlab', name: 'GitLab', icon: <FaGitlab />, fallback: 'https://gitlab.com/HikoPLi' },
  { key: 'linkedin', name: 'LinkedIn', icon: <FaLinkedin />, fallback: 'https://www.linkedin.com/in/liyanpeihiko/' },
  { key: 'whatsapp', name: 'WhatsApp', icon: <FaWhatsapp />, fallback: 'https://wa.me/85262040827' },
]

const clamp = (v: number, min: number, max: number, fallback: number) =>
  Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback

const PersonalInfo = ({
  home,
  identity,
  autoCoding,
}: {
  home?: HomeData
  identity: HeroIdentity
  /** CV-derived values for any "currently coding" line the admin left blank. */
  autoCoding: CurrentlyCoding
}) => {
  // Memoised so the typewriter's phrase list keeps its identity across re-renders
  // (e.g. a colour-mode toggle) instead of restarting mid-phrase.
  const tagline = home?.hero?.tagline
  const { role, rotating } = useMemo(() => heroCopy(tagline), [tagline])

  const posX = clamp(Number(home?.hero?.avatarTransform?.x ?? 50), 0, 100, 50)
  const posY = clamp(Number(home?.hero?.avatarTransform?.y ?? 50), 0, 100, 50)
  const scale = clamp(Number(home?.hero?.avatarTransform?.scale ?? 1), 0.5, 3, 1)
  const avatarSrc = safeHref(home?.hero?.avatarUrl) || '/images/hikoAvator.png'
  const alt = portraitAlt(identity)

  const socials = SOCIALS.map((s) => ({ ...s, href: safeHref(home?.socials?.[s.key] || s.fallback) })).filter((s) => s.href)

  // Admin value per line wins; blank lines fall back to the CV-derived value.
  const cc = home?.hero?.currentlyCoding
  const merge = (admin?: string, fallback?: string) => (admin ?? '').trim() || (fallback ?? '').trim()
  const coding = {
    label: merge(cc?.label, autoCoding.label),
    project: merge(cc?.project, autoCoding.project),
    note: merge(cc?.note, autoCoding.note),
  }
  const hasCoding = Boolean(coding.label || coding.project || coding.note)

  const imgStyle: React.CSSProperties = {
    objectFit: 'cover',
    objectPosition: `${posX}% ${posY}%`,
    transform: `scale(${scale})`,
    transformOrigin: `${posX}% ${posY}%`,
    pointerEvents: 'none',
  }

  return (
    <HeroAmbient>
      <Box pt={{ base: 16, md: 24, lg: 32 }} pb={{ base: 12, md: 20 }}>
        <Box mx="auto" maxW="var(--container-content)" px={{ base: 4, md: 6, lg: 8 }}>
          <Box mb={{ base: 8, md: 10 }} sx={revealSx(0)}>
            <SectionLabel n={1} as="p" mb={0}>
              Introduction
            </SectionLabel>
          </Box>

          <Flex
            direction={{ base: 'column', md: 'row' }}
            align={{ base: 'stretch', md: 'flex-start' }}
            justify="space-between"
            gap={{ base: 10, md: 12, lg: 16 }}
          >
            {/* Copy column */}
            <Box flex="1" minW={0}>
              <HeroHeadline brand={home?.hero?.brand} identity={identity} role={role} rotating={rotating} startStep={1} />

              <Flex
                as="ul"
                listStyleType="none"
                wrap="wrap"
                align="center"
                columnGap={3}
                rowGap={1}
                mt={{ base: 6, md: 8 }}
                fontFamily={monoFont}
                fontSize="12px"
                letterSpacing="0.04em"
                color="page.fg-secondary"
                sx={{
                  ...revealSx(5),
                  // Hairline slash between items, never orphaned when a row wraps.
                  '& > li + li::before': { content: '"/"', mr: 3, opacity: 0.5 },
                }}
              >
                <li>Hong Kong</li>
                <li>Mandarin · Cantonese · English</li>
                <li suppressHydrationWarning>Available · {new Date().getFullYear()}</li>
              </Flex>

              <Flex
                direction={{ base: 'column', sm: 'row' }}
                align={{ base: 'stretch', sm: 'center' }}
                wrap="wrap"
                gap={3}
                mt={{ base: 8, md: 10 }}
                sx={revealSx(6)}
              >
                <Button
                  as={NextLink}
                  href="/cv"
                  h="44px"
                  px={6}
                  bg="var(--accent)"
                  color="white"
                  fontSize="14px"
                  fontWeight={500}
                  _hover={{ bg: '#4f46e5' }}
                  _active={{ bg: '#4338ca' }}
                  _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '3px' }}
                >
                  View CV →
                </Button>
                <Button
                  as={NextLink}
                  href="/contact"
                  h="44px"
                  px={6}
                  variant="outline"
                  borderColor="page.border-strong"
                  color="page.fg"
                  bg="page.surface"
                  fontSize="14px"
                  fontWeight={500}
                  _hover={{ borderColor: 'page.fg-secondary', bg: 'page.surface' }}
                  _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '3px' }}
                >
                  Get in touch
                </Button>

                {socials.length > 0 && (
                  <Flex as="ul" listStyleType="none" gap={2} ml={{ sm: 1 }} aria-label="Profiles">
                    {socials.map((s) => (
                      <li key={s.name}>
                        <Tooltip label={s.name} placement="top" hasArrow openDelay={300}>
                          <IconButton
                            as="a"
                            href={s.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`${s.name} (opens in a new tab)`}
                            icon={s.icon}
                            variant="outline"
                            h="44px"
                            w="44px"
                            minW="44px"
                            borderColor="page.border-strong"
                            color="page.fg"
                            bg="page.surface"
                            _hover={{ borderColor: 'page.fg-secondary', color: 'var(--accent)' }}
                            _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '3px' }}
                          />
                        </Tooltip>
                      </li>
                    ))}
                  </Flex>
                )}
              </Flex>
            </Box>

            {/* Portrait — right column ≥ md, closing profile row below md */}
            <Flex
              direction={{ base: 'row', md: 'column' }}
              align={{ base: 'center', md: 'flex-start' }}
              gap={{ base: 4, md: 4 }}
              flexShrink={0}
              pt={{ base: 8, md: 0 }}
              borderTop={{ base: '1px solid', md: 'none' }}
              borderColor="page.border"
              sx={settleSx(3)}
            >
              <Box
                position="relative"
                flexShrink={0}
                w={{ base: '104px', sm: '128px', md: '220px', lg: '260px' }}
                h={{ base: '104px', sm: '128px', md: '220px', lg: '260px' }}
                borderRadius={{ base: '14px', md: '20px' }}
                overflow="hidden"
                border="1px solid"
                borderColor="page.border-strong"
                bg="page.bg-elevated"
                boxShadow={{ base: 'none', md: '0 24px 60px rgba(0,0,0,0.22)' }}
              >
                {avatarSrc.startsWith('/') ? (
                  // Local / uploaded portrait → optimised, right-sized and
                  // high-priority: it is the hero's LCP image.
                  <NextImage
                    src={avatarSrc}
                    alt={alt}
                    fill
                    priority
                    sizes="(max-width: 479px) 104px, (max-width: 767px) 128px, (max-width: 991px) 220px, 260px"
                    draggable={false}
                    style={imgStyle}
                  />
                ) : (
                  <Image
                    src={avatarSrc}
                    alt={alt}
                    loading="eager"
                    decoding="async"
                    w="100%"
                    h="100%"
                    display="block"
                    draggable={false}
                    style={imgStyle}
                  />
                )}
              </Box>

              {hasCoding && (
                <Flex
                  direction="column"
                  gap={0.5}
                  minW={0}
                  fontFamily={monoFont}
                  fontSize="11px"
                  letterSpacing="0.04em"
                  color="page.fg-secondary"
                >
                  {coding.label && (
                    <Flex as="span" align="center" gap={2}>
                      <Box as="span" aria-hidden w="5px" h="5px" borderRadius="full" bg="var(--accent)" flexShrink={0} />
                      {coding.label}
                    </Flex>
                  )}
                  {coding.project && (
                    <Text as="span" color="page.fg" fontSize="13px" fontFamily="body" letterSpacing="-0.005em" fontWeight={500}>
                      {coding.project}
                    </Text>
                  )}
                  {coding.note && <Text as="span">{coding.note}</Text>}
                </Flex>
              )}
            </Flex>
          </Flex>
        </Box>
      </Box>
    </HeroAmbient>
  )
}

export default PersonalInfo
