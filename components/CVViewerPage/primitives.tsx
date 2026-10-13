import React from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { cleanList } from '../../lib/cvFormat'
import { bullets, entries, field } from './fields'

/**
 * Building blocks of the A4 sheet. Every section renders through these so the
 * printed CV has one rhythm: an uppercase heading sitting on the accent rule,
 * entries with a left content column and a right-aligned italic meta column,
 * and hanging-indent bullets.
 *
 * Outline: the page h1 is the /cv PageHeader, section titles are h2 and
 * entry titles h3 (the name at the top of the sheet is not a heading).
 * Sections and entries carry the stable anchor ids from ./fields
 * (cvSectionAnchor / cvEntryAnchor) with a scroll margin that clears the
 * sticky site header.
 *
 * Inputs are normally pruned (lib/cvVisibility.ts); sections read their
 * values through ./fields, which also honours `redacted` / hiddenFields, so
 * a hidden value is "empty" here and every block quietly renders nothing —
 * MetaLine only draws its "|" when both sides are present.
 */

/** Extra air above an anchored section / entry when the page scrolls to it (html { scroll-padding-top } in globals.css clears the sticky header). */
export const ANCHOR_SCROLL_MARGIN = '24px'

export function SheetSection({ title, id, children }: { title?: string; id?: string; children: React.ReactNode }) {
  return (
    <Box as="section" className="cv-sheet-section" id={id} sx={id ? { scrollMarginTop: ANCHOR_SCROLL_MARGIN } : undefined}>
      {title ? (
        <Box
          px="10px"
          borderBottom="3px solid var(--cv-separator-color, blue)"
          sx={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}
        >
          <Text as="h2" fontWeight={800} fontSize="12px" letterSpacing="0.02em" lineHeight="1.5">
            {title.toUpperCase()}
          </Text>
        </Box>
      ) : null}
      <Box px="10px" pt="6px" pb="18px">
        {children}
      </Box>
    </Box>
  )
}

/** Vertical stack of entries with the sheet's standard gap. */
export function EntryStack({ children, gap = '14px' }: { children: React.ReactNode; gap?: string }) {
  return (
    <Flex direction="column" gap={gap}>
      {children}
    </Flex>
  )
}

/** One entry: left column (title / subtitle), right column (meta), body below. */
export function SheetEntry({
  id,
  left,
  right,
  children,
}: {
  id?: string
  left: React.ReactNode
  right?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <Box
      className="cv-entry"
      id={id}
      sx={{ breakInside: 'avoid', pageBreakInside: 'avoid', ...(id ? { scrollMarginTop: ANCHOR_SCROLL_MARGIN } : null) }}
    >
      <Flex justify="space-between" align="flex-start" gap="16px">
        <Box flex="1" minW={0}>
          {left}
        </Box>
        {right ? (
          <Box flexShrink={0} maxW="62%" textAlign="right">
            {right}
          </Box>
        ) : null}
      </Flex>
      {children}
    </Box>
  )
}

/** "Sep 2024 – Jun 2026 | Hong Kong" — italic date, bold upright place. Parts may be empty. */
export function MetaLine({ date, place }: { date?: string; place?: React.ReactNode }) {
  const hasDate = !!date
  const hasPlace = place !== undefined && place !== null && place !== ''
  if (!hasDate && !hasPlace) return null
  return (
    <Text fontSize="12px" lineHeight="1.5" whiteSpace="normal">
      {hasDate ? (
        <Text as="span" fontStyle="italic">
          {date}
        </Text>
      ) : null}
      {hasDate && hasPlace ? (
        <Text as="span" px="5px">
          |
        </Text>
      ) : null}
      {hasPlace ? (
        <Text as="span" fontWeight={800}>
          {place}
        </Text>
      ) : null}
    </Text>
  )
}

export function EntryTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text as="h3" fontWeight={800} fontSize="14px" lineHeight="1.35">
      {children}
    </Text>
  )
}

export function EntryText({
  children,
  muted,
  italic,
}: {
  children: React.ReactNode
  muted?: boolean
  italic?: boolean
}) {
  if (children === '' || children === null || children === undefined) return null
  return (
    <Text fontSize="12px" lineHeight="1.5" color={muted ? '#4a4a4a' : undefined} fontStyle={italic ? 'italic' : undefined}>
      {children}
    </Text>
  )
}

/** Bold-ish bullet lines with optional sub-points (features[] shape). Hidden parts are skipped. */
export function FeatureBullets({ items }: { items?: readonly unknown[] }) {
  const list = entries(items)
    .map((f) => ({ text: field(f, 'description'), sub: bullets(f, 'furtherExplanation') }))
    .filter((f) => f.text || f.sub.length)
  if (!list.length) return null
  return (
    <Box as="ul" mt="3px" listStyleType="none">
      {list.map((f, i) => (
        <Box as="li" key={i}>
          {f.text ? <Bullet weight={600}>{f.text}</Bullet> : null}
          {f.sub.map((d, j) => (
            <Bullet key={j} sub>
              {d}
            </Bullet>
          ))}
        </Box>
      ))}
    </Box>
  )
}

/** Plain string bullets. */
export function PlainBullets({ items, weight }: { items?: string[]; weight?: number }) {
  const list = cleanList(items)
  if (!list.length) return null
  return (
    <Box as="ul" mt="3px" listStyleType="none">
      {list.map((t, i) => (
        <Box as="li" key={i}>
          <Bullet weight={weight}>{t}</Bullet>
        </Box>
      ))}
    </Box>
  )
}

function Bullet({ children, weight, sub }: { children: React.ReactNode; weight?: number; sub?: boolean }) {
  return (
    <Flex fontSize="12px" lineHeight="1.5" pl={sub ? '14px' : 0} fontWeight={sub ? 400 : weight}>
      <Box as="span" w={sub ? '12px' : '10px'} flexShrink={0} aria-hidden>
        {sub ? '–' : '•'}
      </Box>
      <Box as="span" flex="1" minW={0}>
        {children}
      </Box>
    </Flex>
  )
}
