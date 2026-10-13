import React from 'react'
import { Box, Flex, Heading, Text } from '@chakra-ui/react'

/**
 * The one header every standalone page opens with (/blog, /work, /now,
 * /uses, /cv, /contact, /colophon, articles):
 *
 *   EYEBROW ──────────────────────────
 *   Page title (the page's only h1)
 *   Optional lede paragraph
 *   [optional actions]
 *
 * The eyebrow uses the SectionLabel look (mono, uppercase, trailing rule)
 * without a section number: numbering belongs to the home page's sections.
 * The title scales fluidly (clamp, no breakpoints); `titleLang` marks a
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
      <Text
        className="section-label-rule"
        fontFamily="var(--font-geist-mono), monospace"
        fontSize="11px"
        letterSpacing="0.12em"
        textTransform="uppercase"
        color="page.fg-subtle"
        m={0}
      >
        {eyebrow}
      </Text>
      <Heading
        as="h1"
        mt={6}
        fontSize="clamp(2.25rem, 4vw + 1rem, 3.5rem)"
        lineHeight="1.05"
        letterSpacing="-0.025em"
        fontWeight={500}
        color="page.fg"
        lang={titleLang}
        style={vtName ? ({ viewTransitionName: vtName } as React.CSSProperties) : undefined}
      >
        {title}
      </Heading>
      {lede ? (
        <Text
          className="lede"
          mt={4}
          maxW="62ch"
          fontSize="17px"
          lineHeight="1.6"
          color="page.fg-secondary"
          sx={{ textWrap: 'pretty' }}
        >
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
