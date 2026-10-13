import React from 'react'
import NextLink from 'next/link'
import { Box, Flex, Grid } from '@chakra-ui/react'
import { labelLang } from '../../lib/toc'

/**
 * Labelled article metadata as a description list:
 *
 *   ROLE            TIMELINE        STACK                 READ
 *   Main developer  2025 – 2026     [Next.js] [YOLO] …    6 min
 *
 * Two columns on phones (wide items such as the stack span both), one row
 * of auto-sized columns from md. Labels are mono 11px caps in the subtle
 * token; values 14px. Replaces the old dot-joined meta line, which screen
 * readers announced as one run-on string.
 */

export type MetaItem = {
  label: string
  value: React.ReactNode
  /** Spans both columns on phones (chip lists). */
  wide?: boolean
}

const MONO = 'var(--font-geist-mono), monospace'

const chipStyle = {
  fontFamily: MONO,
  fontSize: '11px',
  lineHeight: '1.4',
  px: 2,
  py: 0.5,
  borderRadius: 'full',
  border: '1px solid',
  borderColor: 'page.border-strong',
  color: 'page.fg-secondary',
} as const

/**
 * Tag / stack chips. With `hrefFor`, each chip links to the list filtered by
 * it (`/blog?tag=…`, `/work?tag=…` — D8), with a 24px hit area.
 */
export function MetaChips({ items, label, hrefFor }: { items: readonly string[]; label: string; hrefFor?: (item: string) => string }) {
  return (
    <Flex as="ul" aria-label={label} listStyleType="none" m={0} p={0} gap={1.5} wrap="wrap">
      {items.map((t) =>
        hrefFor ? (
          <Box as="li" key={t} lang={labelLang(t)} display="flex">
            <Box
              as={NextLink}
              href={hrefFor(t)}
              {...chipStyle}
              display="inline-flex"
              alignItems="center"
              minH="24px"
              textDecoration="none"
              transition="border-color 150ms var(--ease-out-quart), color 150ms var(--ease-out-quart)"
              _hover={{ borderColor: 'page.fg', color: 'page.fg', textDecoration: 'none' }}
              _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
            >
              {t}
            </Box>
          </Box>
        ) : (
          <Box as="li" key={t} lang={labelLang(t)} {...chipStyle}>
            {t}
          </Box>
        ),
      )}
    </Flex>
  )
}

export default function MetaGrid({ items }: { items: readonly MetaItem[] }) {
  const shown = items.filter((it) => it.value !== null && it.value !== undefined && it.value !== '' && it.value !== false)
  if (!shown.length) return null
  return (
    <Grid
      as="dl"
      m={0}
      templateColumns={{ base: '1fr 1fr', md: 'repeat(4, auto)' }}
      justifyContent="start"
      columnGap="32px"
      rowGap={5}
    >
      {shown.map((it) => (
        <Box key={it.label} gridColumn={it.wide ? { base: '1 / -1', md: 'auto' } : undefined} minW={0}>
          <Box
            as="dt"
            fontFamily={MONO}
            fontSize="11px"
            letterSpacing="0.1em"
            textTransform="uppercase"
            color="page.fg-subtle"
            mb={1.5}
          >
            {it.label}
          </Box>
          <Box as="dd" m={0} fontSize="14px" lineHeight="1.5" color="page.fg">
            {it.value}
          </Box>
        </Box>
      ))}
    </Grid>
  )
}
