import NextLink from 'next/link'
import { Box, Grid, Link, Text } from '@chakra-ui/react'

import DigitRoll, { DIGIT_ROLL_NO_SCRIPT_CSS } from '../General-UI/DigitRoll'
import { isExternalHighlight, splitLeadingNumber } from '../../lib/highlights'
import type { HomeHighlight } from '../../lib/homeShape'

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

const valueSx = {
  fontSize: { base: '19px', md: '22px', lg: '24px' },
  lineHeight: '1.15',
  fontWeight: 600,
  letterSpacing: '-0.02em',
  color: 'page.fg',
}

/** Headlines this short ("18th", "8 patents") sit two to a row on phones. */
const SHORT_VALUE = 16

/**
 * Columns: all in one row from lg; below it two per row (an odd last tile
 * spans both) when every headline is short, else one per row so a long
 * headline is not squeezed into a narrow column. Decided from the data, so
 * the server HTML is final.
 */
function columns(highlights: readonly HomeHighlight[]) {
  const count = Math.max(1, Math.min(4, highlights.length))
  const pairs = count > 1 && highlights.every((h) => h.value.length <= SHORT_VALUE)
  return {
    base: pairs ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
    md: count === 1 ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))',
    lg: `repeat(${count}, minmax(0, 1fr))`,
  }
}

/** The headline: a whole number with a suffix rolls up ("18th"); anything else is plain text. */
function Value({ value }: { value: string }) {
  const parts = splitLeadingNumber(value)
  if (!parts) {
    return (
      <Text as="span" display="block" sx={valueSx}>
        {value}
      </Text>
    )
  }
  return (
    <Text as="span" display="block" sx={valueSx}>
      <DigitRoll value={parts.number} sx={valueSx} />
      {parts.suffix}
    </Text>
  )
}

/**
 * The proof strip under the home hero: the owner's saved highlights (2–4
 * tiles), each a link to where the claim comes from (a CV entry, a case
 * study or an external page). Renders nothing without highlights — the Home
 * editor only suggests tiles, it never publishes them.
 *
 * Plain links in a list: the headline and description are the link text,
 * the arrow is decorative and an external source says it opens a new tab.
 * Responsive values only (no layout shift); no entrance animation beyond the
 * number roll, which reduced motion turns off.
 */
export default function ProofStrip({
  highlights,
  label = 'Highlights',
  newTab = ' (opens in a new tab)',
}: {
  /** On /zh each tile carries its Chinese words, or its English ones marked `lang` (pages/index, F3). */
  highlights: Array<HomeHighlight & { lang?: string }>
  /** The strip's name and the new-tab note, in the page's language. */
  label?: string
  newTab?: string
}) {
  if (!highlights.length) return null
  return (
    <Box as="section" aria-label={label} w="100%" maxW="var(--container-content)" mx="auto" px={{ base: 4, md: 6, lg: 8 }}>
      <noscript>
        <style>{DIGIT_ROLL_NO_SCRIPT_CSS}</style>
      </noscript>
      <Grid
        as="ul"
        listStyleType="none"
        templateColumns={columns(highlights)}
        gap={{ base: 3, md: 4 }}
        sx={{
          // Two-up rows: an odd tile out spans the row instead of leaving a hole.
          '@media screen and (max-width: 61.99em)': {
            '& > li:last-child:nth-of-type(odd)': { gridColumn: '1 / -1' },
          },
        }}
      >
        {highlights.map((h, i) => {
          const external = isExternalHighlight(h.href)
          return (
            <Box as="li" key={`${i}-${h.href}`} display="flex" minW={0}>
              <Link
                as={external ? undefined : NextLink}
                href={h.href}
                isExternal={external}
                data-highlight=""
                position="relative"
                display="flex"
                flexDirection="column"
                gap={2}
                w="100%"
                minH={{ base: '92px', md: '120px' }}
                px={{ base: 4, md: 5 }}
                py={{ base: 3.5, md: 4 }}
                border="1px solid"
                borderColor="page.border"
                borderRadius="lg"
                bg="page.surface"
                color="page.fg"
                textDecoration="none"
                sx={{
                  transitionProperty: 'border-color, background-color',
                  transitionDuration: '200ms',
                  transitionTimingFunction: 'var(--ease-out-quart)',
                  '&:hover': { borderColor: 'page.border-strong', bg: 'page.float-bg', textDecoration: 'none' },
                  '&:focus-visible': { outline: '2px solid var(--accent)', outlineOffset: '2px' },
                  '&:hover .proof-arrow': { color: 'accent.text' },
                }}
              >
                <Box pr={6} lang={h.lang}>
                  <Value value={h.value} />
                </Box>
                <Text as="span" fontSize={{ base: '13px', md: '14px' }} lineHeight="1.45" color="page.fg-secondary" lang={h.lang}>
                  {h.label}
                </Text>
                <Text
                  as="span"
                  aria-hidden
                  className={`proof-arrow ${external ? 'nudge-ne' : 'nudge'}`}
                  position="absolute"
                  top={{ base: 3, md: 4 }}
                  right={{ base: 3.5, md: 4 }}
                  fontFamily={monoFont}
                  fontSize="12px"
                  color="page.fg-secondary"
                  sx={{ transition: 'color 200ms var(--ease-out-quart)' }}
                >
                  {external ? '↗' : '→'}
                </Text>
                {external ? <span className="sr-only">{newTab}</span> : null}
              </Link>
            </Box>
          )
        })}
      </Grid>
    </Box>
  )
}
