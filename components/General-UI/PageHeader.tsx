import type React from 'react'
import { Box, Flex, Heading, Text } from '@chakra-ui/react'
import { textStyleProps } from '../../theme/tokens'

/**
 * The one header every standalone page opens with (/blog, /work, /now,
 * /uses, /cv, /contact, /colophon, articles):
 *
 *   EYEBROW ──────────────────────────
 *   Page title (the page's only h1)
 *   Optional lede paragraph
 *   [optional actions]
 *
 * The eyebrow is a short mono, uppercase kicker with a trailing rule — plain
 * words, never an index number or brackets; the page's sections below use
 * SectionHeading.
 * Typography is token-driven (theme/tokens.ts): the eyebrow is the `label`
 * text style, the title `display` (fluid clamp, no breakpoints), the lede
 * `lede`; `titleLang` marks a
 * title in another language than the page, `vtName` gives the h1 a view
 * transition name for a shared-element morph.
 */
export default function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
  titleLang,
  vtName,
}: {
  eyebrow: React.ReactNode
  title: React.ReactNode
  lede?: React.ReactNode
  actions?: React.ReactNode
  titleLang?: string
  vtName?: string
}) {
  return (
    <Box as="header" maxW="var(--container-content)" mb={[8, 12]}>
      <Text className="eyebrow-rule" textStyle="label" color="page.fg-subtle" m={0}>
        {eyebrow}
      </Text>
      <Heading
        as="h1"
        mt={6}
        // Fluid 36→56px, tight tracking (theme/tokens.ts `display`), as
        // explicit props so Heading's own responsive size never wins.
        {...textStyleProps('display')}
        color="page.fg"
        lang={titleLang}
        style={vtName ? ({ viewTransitionName: vtName } as React.CSSProperties) : undefined}
      >
        {title}
      </Heading>
      {lede ? (
        <Text className="lede" mt={4} maxW="62ch" textStyle="lede" color="page.fg-secondary" sx={{ textWrap: 'pretty' }}>
          {lede}
        </Text>
      ) : null}
      {actions ? (
        <Flex mt={6} gap={3} flexWrap="wrap" align="center">
          {actions}
        </Flex>
      ) : null}
    </Box>
  )
}
