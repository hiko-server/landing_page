import React from 'react'
import { Box, Flex, Table, TableContainer, Text } from '@chakra-ui/react'
import { MONO } from '../shell/ui'
import { SCROLL_REGION_FOCUS, useScrollRegion } from '../shell/scrollRegion'

/**
 * Small building blocks of the Analytics panel's goal sections, matching
 * the panel's hairline cards and tables (components/Admin/AnalyticsPanel).
 */

/** Hairline table with a screen-reader caption; cells may wrap (`wrap`) instead of scrolling sideways. */
export function HairTable({ caption, children, wrap = false }: { caption: string; children: React.ReactNode; wrap?: boolean }) {
  const [ref, region] = useScrollRegion(caption)
  return (
    <TableContainer ref={ref} {...region} border="1px solid" borderColor="page.border" borderRadius="md" whiteSpace={wrap ? 'normal' : undefined} _focusVisible={SCROLL_REGION_FOCUS}>
      <Table
        size="sm"
        variant="simple"
        sx={{
          'th, td': { borderColor: 'page.border', px: { base: 2.5, md: 4 } },
          th: { fontFamily: MONO, fontSize: 'label', letterSpacing: 'caps', color: 'page.fg-secondary', whiteSpace: 'normal' },
          // The last visible row has no rule of its own (a closed breakdown row after it is hidden).
          'tr:last-of-type td, tr:has(+ tr[hidden]:last-of-type) td': { borderBottom: 'none' },
          td: { fontVariantNumeric: 'tabular-nums', verticalAlign: 'top' },
        }}
      >
        <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{caption}</caption>
        {children}
      </Table>
    </TableContainer>
  )
}

/** Card heading (h3) with a one-paragraph explanation and an optional control at the far end. */
export function SectionHead({
  id,
  title,
  children,
  aside,
}: {
  id: string
  title: string
  children?: React.ReactNode
  aside?: React.ReactNode
}) {
  return (
    <Flex align={{ base: 'stretch', sm: 'flex-start' }} justify="space-between" gap={3} flexWrap="wrap" mb={3}>
      <Box minW={0} flex="1 1 240px">
        <Text as="h3" id={id} fontSize="sm" fontWeight={600}>
          {title}
        </Text>
        {children ? (
          <Text fontSize="xs" color="page.fg-secondary" mt={0.5} maxW="62ch">
            {children}
          </Text>
        ) : null}
      </Box>
      {aside}
    </Flex>
  )
}

/** Truthful empty state inside a card. */
export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <Text fontSize="sm" color="page.fg-secondary" py={2}>
      {children}
    </Text>
  )
}
