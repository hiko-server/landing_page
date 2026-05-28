import React from 'react'
import { Box, Text, useColorModeValue } from '@chakra-ui/react'

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
 */
export default function SectionLabel({
  n,
  children,
  mb = 10,
  id,
}: {
  n: number | string
  children: React.ReactNode
  mb?: number | string
  id?: string
}) {
  const muted = useColorModeValue('gray.600', 'gray.500')
  const padded = typeof n === 'number' ? String(n).padStart(2, '0') : n

  return (
    <Box
      id={id}
      className="section-label-rule"
      mb={mb}
      fontFamily="var(--font-geist-mono), monospace"
      fontSize="11px"
      letterSpacing="0.12em"
      textTransform="uppercase"
      color={muted}
    >
      <Text as="span" whiteSpace="nowrap">
        [{padded}] {children}
      </Text>
    </Box>
  )
}
