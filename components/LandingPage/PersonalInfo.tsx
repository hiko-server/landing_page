'use client'
import React from 'react'
import type { HomeData } from '../../lib/home'
import {
  Box,
  Button,
  Flex,
  Link,
  Text,
  Stack,
  Image,
  IconButton,
  Tooltip,
  useColorModeValue,
} from '@chakra-ui/react'
import { FaGithub, FaGitlab, FaLinkedin, FaWhatsapp } from 'react-icons/fa'
import { useRouter } from 'next/router'

import HeroHeadline from './HeroHeadline'
import HeroAmbient from '../Background/HeroAmbient'
import SectionLabel from '../General-UI/SectionLabel'

/**
 * v6 Hero — preserves every v5 capability EXCEPT the video reel background
 * (replaced with HeroAmbient — CSS aurora orbs + dot grid + vignettes).
 *
 * Preserved:
 *   - HeroHeadline typewriter tagline from home.json
 *   - Avatar with x/y/scale transform from admin GUI
 *   - Phone / email click-to-reveal pattern
 *   - CV button (router.push('/cv'))
 *   - GitHub / GitLab / LinkedIn / WhatsApp social row
 *
 * Visual upgrades:
 *   - [01] INTRODUCTION section marker
 *   - Theme-aware text colors (works in both dark and light mode now;
 *     v5 was effectively dark-only because of the always-dark video bg)
 *   - Indigo accent only on primary CTA + brand suffix
 */

const PersonalInfo = ({
  isMobile,
  home,
}: {
  isMobile: boolean
  home?: HomeData
}) => {
  const router = useRouter()
  const [showPhone, setShowPhone] = React.useState(false)
  const [showEmail, setShowEmail] = React.useState(false)

  // Theme-aware tokens (was hard-coded white because of v5 video overlay)
  const fg = useColorModeValue('gray.900', 'white')
  const fgMuted = useColorModeValue('gray.600', 'rgba(255,255,255,0.7)')
  const ctaBorder = useColorModeValue('rgba(0,0,0,0.12)', 'rgba(255,255,255,0.18)')
  const ctaBorderHover = useColorModeValue('rgba(0,0,0,0.30)', 'rgba(255,255,255,0.40)')
  const socialBg = useColorModeValue('rgba(255,255,255,0.6)', 'rgba(0,0,0,0.25)')
  const socialBgHover = useColorModeValue('rgba(255,255,255,0.9)', 'rgba(0,0,0,0.45)')
  const avatarBorder = useColorModeValue('rgba(0,0,0,0.10)', 'rgba(255,255,255,0.14)')
  const avatarFrameBg = useColorModeValue('rgba(245,245,245,0.6)', 'rgba(0,0,0,0.25)')

  // Avatar transform (preserved from v5 admin GUI)
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v))
  const posX = clamp(Number(home?.hero?.avatarTransform?.x ?? 50), 0, 100)
  const posY = clamp(Number(home?.hero?.avatarTransform?.y ?? 50), 0, 100)
  const scale = clamp(Number(home?.hero?.avatarTransform?.scale ?? 1), 0.5, 3)

  const avatarSrc =
    (home?.hero?.avatarUrl && home.hero.avatarUrl.trim()) ||
    '/images/hikoAvator.png'

  const socials = [
    { name: 'GitHub', icon: <FaGithub />, url: home?.socials?.github || 'https://github.com/HikoPLi' },
    { name: 'GitLab', icon: <FaGitlab />, url: home?.socials?.gitlab || 'https://gitlab.com/HikoPLi' },
    { name: 'LinkedIn', icon: <FaLinkedin />, url: home?.socials?.linkedin || 'https://www.linkedin.com/in/liyanpeihiko/' },
    { name: 'WhatsApp', icon: <FaWhatsapp />, url: home?.socials?.whatsapp || 'https://wa.me/85262040827' },
  ]

  const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

  return (
    <Box position="relative" w="full">
      <HeroAmbient>
        <Box position="relative" overflow="visible" pb={[16, 20]} pt={[24, 28, 36]}>
          <Box mx="auto" maxW="var(--container-content)" px={[4, 6, 8]}>
            <Flex
              direction={isMobile ? 'column' : 'row'}
              alignItems="flex-start"
              justifyContent="space-between"
              gap={[8, 10, 12]}
            >
              {/* Left column: section label + tagline + meta + CTAs */}
              <Box flex={1} minW={0}>
                <Box mb={8}>
                  <SectionLabel n={1}>Introduction</SectionLabel>
                </Box>

                {!isMobile && (
                  <Box mb={6}>
                    <HeroHeadline
                      brand={home?.hero?.brand}
                      tagline={home?.hero?.tagline}
                    />
                  </Box>
                )}

                {/* Name */}
                <Flex direction="column" gap={2} mb={5}>
                  <Text
                    fontSize={['28px', '36px', '42px']}
                    fontWeight={500}
                    lineHeight="1.05"
                    letterSpacing="-0.02em"
                    color={fg}
                  >
                    Li Yanpei
                    <Text as="span" color={fgMuted} fontWeight={300}>
                      {' '}
                      / 李彦霈
                    </Text>
                  </Text>

                  <Flex
                    wrap="wrap"
                    fontFamily={monoFont}
                    fontSize="11px"
                    color={fgMuted}
                    letterSpacing="0.04em"
                    gap={3}
                    mt={1}
                  >
                    <Text as="span">Hong Kong</Text>
                    <Text as="span" opacity={0.5}>/</Text>
                    <Text as="span">Mandarin · Cantonese · English</Text>
                    <Text as="span" opacity={0.5}>/</Text>
                    <Text as="span">Available · {new Date().getFullYear()}</Text>
                  </Flex>
                </Flex>

                {/* Reveal: phone + email (logic preserved from v5) */}
                <Flex direction="column" gap={2} mb={8} fontSize="14px">
                  <Box>
                    <Text as="span" color={fgMuted} fontFamily={monoFont} fontSize="11px" mr={2}>
                      tel
                    </Text>
                    {showPhone ? (
                      <Text as="span" color={fg}>
                        {home?.hero?.phone || ''}
                      </Text>
                    ) : (
                      <Button
                        size="xs"
                        variant="link"
                        color="var(--accent)"
                        fontFamily={monoFont}
                        fontWeight={500}
                        onClick={() => setShowPhone(true)}
                        aria-label="Reveal phone number"
                      >
                        Click to reveal →
                      </Button>
                    )}
                  </Box>
                  <Box>
                    <Text as="span" color={fgMuted} fontFamily={monoFont} fontSize="11px" mr={2}>
                      email
                    </Text>
                    {showEmail ? (
                      home?.hero?.email ? (
                        <Link
                          href={`mailto:${home.hero.email}`}
                          color={fg}
                          _hover={{ color: 'var(--accent)' }}
                        >
                          {home.hero.email}
                        </Link>
                      ) : null
                    ) : (
                      <Button
                        size="xs"
                        variant="link"
                        color="var(--accent)"
                        fontFamily={monoFont}
                        fontWeight={500}
                        onClick={() => setShowEmail(true)}
                        aria-label="Reveal email"
                      >
                        Click to reveal →
                      </Button>
                    )}
                  </Box>
                </Flex>

                {/* CTAs + socials */}
                <Flex direction={['column', 'row']} alignItems={['stretch', 'center']} gap={4}>
                  <Button
                    onClick={() => router.push('/cv')}
                    size="md"
                    h="44px"
                    px={6}
                    bg="var(--accent)"
                    color="white"
                    fontSize="14px"
                    fontWeight={500}
                    _hover={{ bg: '#4f46e5' }}
                    _active={{ bg: '#4338ca' }}
                  >
                    View CV →
                  </Button>

                  <Stack direction="row" spacing={2}>
                    {socials.map((s) => (
                      <Tooltip key={s.name} label={s.name} placement="top" hasArrow>
                        <IconButton
                          aria-label={s.name}
                          onClick={() => window.open(s.url, '_blank')}
                          icon={s.icon}
                          variant="outline"
                          size="md"
                          h="44px"
                          w="44px"
                          borderColor={ctaBorder}
                          color={fg}
                          bg={socialBg}
                          _hover={{ borderColor: ctaBorderHover, bg: socialBgHover }}
                        />
                      </Tooltip>
                    ))}
                  </Stack>
                </Flex>
              </Box>

              {/* Right column: avatar (precision-cropped, transform from admin) */}
              <Box
                flexShrink={0}
                alignSelf={['center', 'flex-start']}
                mt={[6, 0]}
              >
                <Box
                  w={['200px', '220px', '260px']}
                  h={['200px', '220px', '260px']}
                  borderRadius="20px"
                  overflow="hidden"
                  border="1px solid"
                  borderColor={avatarBorder}
                  boxShadow="0 24px 60px rgba(0,0,0,0.30)"
                  position="relative"
                  bg={avatarFrameBg}
                >
                  <Image
                    src={avatarSrc}
                    alt={home?.hero?.brand || 'avatar'}
                    w="100%"
                    h="100%"
                    objectFit="cover"
                    sx={{ objectPosition: `${posX}% ${posY}%` }}
                    transform={`scale(${scale})`}
                    transformOrigin={`${posX}% ${posY}%`}
                    draggable={false}
                    pointerEvents="none"
                    style={{
                      willChange: 'transform',
                      backfaceVisibility: 'hidden',
                      display: 'block',
                    }}
                  />
                </Box>

                {/* Currently-doing chip beneath avatar */}
                <Flex
                  mt={3}
                  direction="column"
                  fontFamily={monoFont}
                  fontSize="10px"
                  letterSpacing="0.04em"
                  color={fgMuted}
                  textAlign={['center', 'left']}
                  gap={0.5}
                >
                  <Text as="span">currently coding</Text>
                  <Text as="span" color={fg}>
                    WeGreen AI · COT
                  </Text>
                  <Text as="span" opacity={0.6}>
                    self-taught · since 2022
                  </Text>
                </Flex>
              </Box>
            </Flex>

            {/* Mobile: HeroHeadline below (different ordering vs desktop) */}
            {isMobile && (
              <Box mt={10}>
                <HeroHeadline
                  brand={home?.hero?.brand}
                  tagline={home?.hero?.tagline}
                />
              </Box>
            )}
          </Box>
        </Box>
      </HeroAmbient>
    </Box>
  )
}

export default PersonalInfo
