import React, { useMemo } from 'react'
// Type-only import from the pure shape module — never lib/home (server-only).
import type { HomeData } from '../../lib/homeShape'
import { CODING_LABEL, STUDYING_LABEL, mergeCurrentlyCoding, type CurrentlyCoding } from '../../lib/currentlyCoding'
import { safeHref } from '../../lib/cvFormat'
import { Box, Button, Flex, Grid, IconButton, Text } from '@chakra-ui/react'
import NextLink from 'next/link'

import HeroHeadline from './HeroHeadline'
import HeroAmbient from '../Background/HeroAmbient'
import Hint, { HintGroup } from '../General-UI/Hint'
import { GitHubIcon, GitLabIcon, LinkedInIcon, WhatsAppIcon } from '../Icons/brand'
import { heroCopy, portraitAlt, type HeroIdentity, type HeroMeta } from './heroIdentity'
import { resolveSocialLinks, type SocialName } from '../Chrome/chrome'
import { revealSx, settleSx } from './heroReveal'
import { portraitFrameSx } from './portraitFrame'
import Picture from '../Common/Picture'
import { useImageReveal } from '../Common/useImageReveal'
import { useHomeUi } from './homeUi'

/**
 * The home hero.
 *
 * One composition for every width, laid out with responsive props only (no
 * JS media queries, so the server HTML is final and nothing jumps after
 * hydration). Reading order is the same everywhere:
 *
 *   brand eyebrow → h1 (name + role) → rotating phrases → meta → CTAs → portrait
 *
 * ≥ md the portrait card sits in a right-hand column with the "currently
 * coding" note under it. Below md the portrait is a 64px avatar beside the
 * h1, the CTAs share one row and the note closes the hero under a hairline.
 * The headline leads at every width: no section label above it.
 */

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

const SOCIAL_ICONS: Record<SocialName, React.ReactElement> = {
  GitHub: <GitHubIcon />,
  GitLab: <GitLabIcon />,
  LinkedIn: <LinkedInIcon />,
  WhatsApp: <WhatsAppIcon />,
}

/** Server-side facts about the portrait file (intrinsic size, variants, blur placeholder — lib/uploadVariants imageSources). */
export type AvatarMeta = { srcSet?: string; avifSrcSet?: string; placeholder?: string; width?: number; height?: number }

/**
 * The portrait, cropped and scaled as the owner set it in the Home editor.
 * WebP / AVIF candidates; the blurred placeholder is the image's own
 * background (so the owner's scale and focal point apply to it too) until the
 * file has loaded — no fade: the portrait is in the first viewport.
 */
function Portrait({ src, avatar, sizes, alt, posX, posY, scale }: { src: string; avatar?: AvatarMeta; sizes: string; alt: string; posX: number; posY: number; scale: number }) {
  const position = `${posX}% ${posY}%`
  const reveal = useImageReveal(avatar?.placeholder, { fade: false, width: avatar?.width, height: avatar?.height, fit: 'cover', position })
  return (
    <Picture avifSrcSet={avatar?.srcSet ? avatar.avifSrcSet : null} sizes={sizes}>
      <Box
        as="img"
        ref={reveal.ref}
        {...reveal.imgProps}
        src={src}
        srcSet={avatar?.srcSet}
        sizes={avatar?.srcSet ? sizes : undefined}
        width={avatar?.width}
        height={avatar?.height}
        alt={alt}
        // Lazy: each copy is display:none at the other widths, and a lazy image
        // that is not rendered is never fetched. Both sit in the first viewport
        // where they show, so they load right after layout.
        loading="lazy"
        decoding="async"
        draggable={false}
        position="absolute"
        inset={0}
        w="100%"
        h="100%"
        maxW="none"
        style={{
          objectFit: 'cover',
          objectPosition: position,
          transform: `scale(${scale})`,
          transformOrigin: position,
          pointerEvents: 'none',
          ...reveal.boxStyle,
        }}
      />
    </Picture>
  )
}

/** Separator width of the meta list (see the `metaSx` comment). */
const META_GAP = '1.6em'

const metaSx = {
  // Every item carries a leading "/" in a fixed-width slot; the list is
  // pulled left by that width inside a clipping wrapper, so the slash of
  // whichever item starts a line is cut off — a separator never begins a row.
  ml: `-${META_GAP}`,
  '& > li::before': {
    // Decorative: empty alt text where supported (fallback first).
    content: ['"/"', '"/" / ""'],
    display: 'inline-block',
    width: META_GAP,
    textAlign: 'center',
    color: 'page.fg-subtle',
  },
} as const

const clamp = (v: number, min: number, max: number, fallback: number) =>
  Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback

const PersonalInfo = ({
  home,
  identity,
  autoCoding,
  avatar,
  meta,
  zh = false,
}: {
  home?: HomeData
  identity: HeroIdentity
  /** CV-derived "currently coding" chip (lib/currentlyCoding), merged with the owner's lines. */
  autoCoding: CurrentlyCoding
  avatar?: AvatarMeta
  /** Location and languages from the public CV (heroMeta); a blank item is not shown. */
  meta?: HeroMeta
  /** /zh (F3): the Chinese name leads, the page's words and links are Chinese. */
  zh?: boolean
}) => {
  const { t, links } = useHomeUi()
  // Memoised so the phrase list keeps its identity across re-renders (e.g. a
  // colour-mode toggle) instead of restarting the rotation.
  const tagline = home?.hero?.tagline
  const { role, rotating } = useMemo(() => heroCopy(tagline), [tagline])

  const posX = clamp(Number(home?.hero?.avatarTransform?.x ?? 50), 0, 100, 50)
  const posY = clamp(Number(home?.hero?.avatarTransform?.y ?? 50), 0, 100, 50)
  const scale = clamp(Number(home?.hero?.avatarTransform?.scale ?? 1), 0.5, 3, 1)
  const avatarSrc = safeHref(home?.hero?.avatarUrl) || '/images/avatar-placeholder.png'
  const alt = portraitAlt(identity, zh)

  // A channel the owner cleared in the Home editor is removed; the built-in
  // links are used only when the home document has no socials at all.
  const socials = resolveSocialLinks(home?.socials)

  // The owner's stated availability; nothing is shown when it is not set.
  const availability = home?.availability
  const availabilityText = availability ? (availability.label || '').trim() || t.hero.availability[availability.status] : ''

  // The owner's lines and the CV-derived chip, combined exactly as /now does;
  // the built-in labels in the page's words (F3: "正在就读" on /zh).
  const merged = mergeCurrentlyCoding(home?.hero?.currentlyCoding, autoCoding)
  const builtIn: Record<string, string> = { [CODING_LABEL]: t.hero.coding, [STUDYING_LABEL]: t.hero.studying }
  const coding = { ...merged, label: Object.hasOwn(builtIn, merged.label) ? builtIn[merged.label] : merged.label }
  const hasCoding = Boolean(coding.label || coding.project || coding.note)
  const location = (meta?.location || '').trim()
  const languages = (meta?.languages || '').trim()
  const hasMeta = Boolean(location || languages || (availability && availabilityText))

  const portrait = (sizes: string, imgAlt: string) => (
    <Portrait src={avatarSrc} avatar={avatar} sizes={sizes} alt={imgAlt} posX={posX} posY={posY} scale={scale} />
  )

  // The phone avatar repeats the portrait beside the h1; the card (≥ md)
  // carries the description, so only one copy is announced at each width.
  const phoneAvatar = (
    <Box
      position="relative"
      w="64px"
      h="64px"
      borderRadius="16px"
      overflow="hidden"
      border="1px solid"
      borderColor="page.border-strong"
      bg="page.bg-elevated"
      sx={{ ...settleSx(2), ...portraitFrameSx('avatar') }}
    >
      {portrait('64px', alt)}
    </Box>
  )

  return (
    <HeroAmbient>
      <Box pt={{ base: 12, md: 24, lg: 32 }} pb={{ base: 12, md: 20 }}>
        <Box mx="auto" maxW="var(--container-content)" px={{ base: 4, md: 6, lg: 8 }}>
          <Flex
            direction={{ base: 'column', md: 'row' }}
            align={{ base: 'stretch', md: 'flex-start' }}
            justify="space-between"
            gap={{ base: 10, md: 12, lg: 16 }}
          >
            {/* Copy column */}
            <Box flex="1" minW={0}>
              <HeroHeadline brand={home?.hero?.brand} identity={identity} role={role} rotating={rotating} startStep={1} avatar={phoneAvatar} zh={zh} />

              {hasMeta && (
                <Box overflow="hidden" mt={{ base: 6, md: 8 }} sx={revealSx(5)}>
                  <Flex
                    as="ul"
                    className="hero-meta"
                    listStyleType="none"
                    wrap="wrap"
                    align="center"
                    rowGap={1}
                    fontFamily={monoFont}
                    fontSize="12px"
                    letterSpacing="0.04em"
                    color="page.fg-secondary"
                    sx={metaSx}
                  >
                    {location && <li data-meta="location">{location}</li>}
                    {languages && <li data-meta="languages">{languages}</li>}
                    {availability && availabilityText && (
                      <li>
                        <Box
                          as="span"
                          aria-hidden
                          display="inline-block"
                          w="6px"
                          h="6px"
                          mr={2}
                          borderRadius="full"
                          verticalAlign="middle"
                          bg={`status.${availability.status}`}
                          sx={{ '@media (forced-colors: active)': { bg: 'CanvasText' } }}
                        />
                        {availabilityText}
                      </li>
                    )}
                  </Flex>
                </Box>
              )}

              <Flex
                direction={{ base: 'column', sm: 'row' }}
                align={{ base: 'stretch', sm: 'center' }}
                wrap="wrap"
                gap={3}
                mt={{ base: 8, md: 10 }}
                sx={revealSx(6)}
              >
                <Grid templateColumns={{ base: '1fr 1fr', sm: 'auto auto' }} gap={{ base: 2, sm: 3 }}>
                  <Button
                    as={NextLink}
                    href={links.cv}
                    h="44px"
                    px={{ base: 3, sm: 6 }}
                    bg="accent.solid"
                    color="accent.fg"
                    fontSize="14px"
                    fontWeight={500}
                    _hover={{ bg: 'accent.solid-hover' }}
                    _active={{ bg: 'accent.solid-active' }}
                    _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '3px' }}
                  >
                    {t.hero.viewCv}&nbsp;<span className="nudge" aria-hidden>→</span>
                  </Button>
                  <Button
                    as={NextLink}
                    href={links.contact}
                    h="44px"
                    px={{ base: 3, sm: 6 }}
                    variant="outline"
                    borderColor="page.border-strong"
                    color="page.fg"
                    bg="page.surface"
                    fontSize="14px"
                    fontWeight={500}
                    _hover={{ borderColor: 'page.fg-secondary', bg: 'page.surface' }}
                    _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '3px' }}
                  >
                    {t.hero.getInTouch}
                  </Button>
                </Grid>

                {socials.length > 0 && (
                  <HintGroup>
                    <Flex as="ul" listStyleType="none" gap={2} ml={{ sm: 1 }} aria-label={t.hero.profiles}>
                      {socials.map((s) => (
                        <li key={s.name}>
                          <Hint label={s.name} placement="top">
                            <IconButton
                              as="a"
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`${s.name}${t.newTab}`}
                              icon={SOCIAL_ICONS[s.name]}
                              variant="outline"
                              h="44px"
                              w="44px"
                              minW="44px"
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
                )}
              </Flex>
            </Box>

            {/* Portrait card ≥ md; below md only the "currently coding" note remains */}
            <Flex
              display={{ base: hasCoding ? 'flex' : 'none', md: 'flex' }}
              direction="column"
              align="flex-start"
              gap={4}
              flexShrink={0}
              pt={{ base: 8, md: 0 }}
              borderTop={{ base: '1px solid', md: 'none' }}
              borderColor="page.border"
              sx={settleSx(3)}
            >
              <Box
                display={{ base: 'none', md: 'block' }}
                position="relative"
                flexShrink={0}
                w={{ md: '220px', lg: '260px' }}
                h={{ md: '220px', lg: '260px' }}
                borderRadius="20px"
                overflow="hidden"
                border="1px solid"
                borderColor="page.border-strong"
                bg="page.bg-elevated"
                boxShadow="0 24px 60px rgba(0,0,0,0.22)"
                sx={portraitFrameSx('card')}
              >
                {portrait('(min-width: 62em) 260px, 220px', alt)}
              </Box>

              {hasCoding && (
                <Flex
                  className="hero-currently"
                  direction="column"
                  gap={0.5}
                  minW={0}
                  // ≥ md the note sits under the portrait: wrap at its width
                  // instead of widening the column.
                  maxW={{ md: '220px', lg: '260px' }}
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
