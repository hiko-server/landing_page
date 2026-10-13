import type React from 'react'
import { Box, Text } from '@chakra-ui/react'

/**
 * v6 signature: monospace section marker with trailing rule.
 *
 *   <SectionLabel n={1}>Introduction</SectionLabel>
 *   →  [01] INTRODUCTION ────────────────────
 *
 * The trailing horizontal line is painted via `.section-label-rule::after`
 * defined in styles/globals.css (so it inherits the theme rule color).
 *
 * Props:
 *   - n: section number (0–9 → zero-padded, otherwise rendered as-is)
 *   - children: label text (will be uppercased visually via tracking)
 *   - mb: optional margin-bottom override (default: 10 = 40px)
 *   - hideBelow: 'md' hides the label on phones (the hero, where the
 *     headline must lead)
 */
export default function SectionLabel({
  n,
  children,
  mb = 10,
  id,
  as = 'h2',
  hideBelow,
}: {
  n: number | string
  children: React.ReactNode
  mb?: number | string
  id?: string
  /** Heading level for the document outline (visual style is identical). */
  as?: 'h1' | 'h2' | 'h3' | 'p'
  /** Hide the label below this breakpoint. */
  hideBelow?: 'md'
}) {
  const padded = typeof n === 'number' ? String(n).padStart(2, '0') : n

  return (
    <Box
      id={id}
      className="section-label-rule"
      mb={mb}
      // The `label` text style (theme/tokens.ts): mono caps, 11→12px fluid.
      textStyle="label"
      // AA-contrast subtle token (CSS variable): legible at 11px in both modes
      // and correct on the first paint.
      color="page.fg-subtle"
      // Doubled class selector: beats `.section-label-rule { display: flex }`.
      sx={hideBelow === 'md' ? { '@media screen and (max-width: 47.99em)': { '&&': { display: 'none' } } } : undefined}
    >
      <Text as={as} whiteSpace="nowrap" fontSize="inherit" fontWeight="inherit" letterSpacing="inherit" lineHeight="inherit" m={0}>
        <Text as="span" aria-hidden>
          [{padded}]
        </Text>{' '}
        {children}
      </Text>
    </Box>
  )
}
