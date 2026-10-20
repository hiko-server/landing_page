import React, { useId } from 'react'
import { Box, Button, Flex, Icon, Tbody, Td, Text, Th, Thead, Tr } from '@chakra-ui/react'
import { FaFilter } from 'react-icons/fa'
import { Panel } from '../shell/ui'
import { formatCount } from '../../../lib/analytics/format'
import { OTHER_KEY, type CountRow } from '../../../lib/analytics/shared'
import { DIMENSION_LABEL, type ExploreDimension, type ExploreFilter } from '../../../lib/analytics/exploreShared'
import { filterValueLabel } from '../../../lib/analytics/exploreFormat'
import { HairTable } from './ui'

/**
 * One breakdown of the Analytics view (pages, referrers, countries, …): a
 * hairline table whose rows carry a bar of their share, and whose names are
 * buttons that filter the whole view by that value (Plausible-style). The
 * row of an active filter is marked; "(other)" sums names and cannot be
 * filtered by.
 */
export default function RankCard({
  title,
  dim,
  keyLabel,
  rows,
  showViews,
  renderKey,
  empty,
  note,
  active,
  onFilter,
}: {
  title: string
  dim: ExploreDimension
  keyLabel: string
  rows: CountRow[]
  showViews?: boolean
  renderKey?: (key: string) => React.ReactNode
  empty: string
  note?: React.ReactNode
  /** The view's filter on this dimension, if any. */
  active?: ExploreFilter
  onFilter: (dim: ExploreDimension, value: string) => void
}) {
  const headingId = useId()
  const total = rows.reduce((n, r) => n + r.visitors, 0)
  const max = rows.reduce((m, r) => Math.max(m, r.visitors), 0)
  return (
    <Panel as="section" aria-labelledby={headingId} minW={0}>
      <Flex justify="space-between" align="baseline" gap={2} mb={3}>
        <Text as="h3" id={headingId} fontSize="sm" fontWeight={600}>
          {title}
        </Text>
        {active ? (
          <Text fontSize="xs" color="accent.text" fontWeight={500} noOfLines={1}>
            {active.op === 'is' ? 'Filtered' : 'Excluding one'}
          </Text>
        ) : null}
      </Flex>
      {rows.length ? (
        <HairTable caption={title}>
          <Thead>
            <Tr>
              <Th>{keyLabel}</Th>
              <Th isNumeric>Visitors</Th>
              {showViews ? <Th isNumeric>Views</Th> : <Th isNumeric>Share</Th>}
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((r) => {
              const label = renderKey ? renderKey(r.key) : r.key
              const plain = filterValueLabel(dim, r.key)
              const isActive = active?.op === 'is' && active.value === r.key
              const filterable = r.key !== OTHER_KEY && !isActive
              const share = max ? (r.visitors / max) * 100 : 0
              return (
                <Tr key={r.key} aria-current={isActive ? 'true' : undefined}>
                  <Td fontSize="xs" maxW={{ base: '170px', md: '280px' }} position="relative" py={0} h="34px">
                    <Box
                      aria-hidden
                      position="absolute"
                      insetY="5px"
                      left={0}
                      w={`${Math.max(share, r.visitors ? 1.5 : 0)}%`}
                      bg={isActive ? 'var(--accent-ring)' : 'var(--accent-soft)'}
                      borderRadius="sm"
                      transition="width var(--duration-slow) var(--ease-standard)"
                      sx={{ '@media (forced-colors: active)': { display: 'none' } }}
                    />
                    {filterable ? (
                      <Button
                        variant="unstyled"
                        position="relative"
                        display="flex"
                        alignItems="center"
                        gap={1.5}
                        h="34px"
                        minW={0}
                        maxW="100%"
                        fontSize="xs"
                        fontWeight={400}
                        textAlign="left"
                        onClick={() => onFilter(dim, r.key)}
                        title={`Show only ${plain}`}
                        aria-label={`${plain} — show only this ${DIMENSION_LABEL[dim].toLowerCase()}`}
                        sx={{ '&:hover .rank-filter, &:focus-visible .rank-filter': { opacity: 1 } }}
                        _hover={{ textDecoration: 'underline', textUnderlineOffset: '3px' }}
                        _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '1px', borderRadius: 'sm' }}
                      >
                        <Box as="span" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" minW={0}>
                          {label}
                        </Box>
                        <Icon as={FaFilter} className="rank-filter" aria-hidden boxSize="9px" color="page.fg-secondary" opacity={0} flexShrink={0} />
                      </Button>
                    ) : (
                      <Box
                        as="span"
                        position="relative"
                        display="block"
                        lineHeight="34px"
                        overflow="hidden"
                        textOverflow="ellipsis"
                        whiteSpace="nowrap"
                        fontWeight={isActive ? 600 : 400}
                        title={plain}
                      >
                        {label}
                      </Box>
                    )}
                  </Td>
                  <Td isNumeric fontSize="xs">
                    {formatCount(r.visitors)}
                  </Td>
                  <Td isNumeric fontSize="xs" color={showViews ? undefined : 'page.fg-secondary'}>
                    {showViews ? formatCount(r.views || 0) : total ? `${Math.round((r.visitors / total) * 100)}%` : '—'}
                  </Td>
                </Tr>
              )
            })}
          </Tbody>
        </HairTable>
      ) : (
        <Text fontSize="sm" color="page.fg-secondary">
          {empty}
        </Text>
      )}
      {note ? (
        <Text fontSize="xs" color="page.fg-secondary" mt={2}>
          {note}
        </Text>
      ) : null}
    </Panel>
  )
}
