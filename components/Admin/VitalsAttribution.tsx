import React, { useState } from 'react'
import { Box, Button, Flex, HStack, Table, TableContainer, Tbody, Td, Text, Th, Thead, Tr } from '@chakra-ui/react'
import { MONO } from './shell/ui'
import { SCROLL_REGION_FOCUS, useScrollRegion } from './shell/scrollRegion'
import { rateVital, type VitalRating } from '../../lib/analytics/shared'
import { formatVital, ratingLabel } from '../../lib/analytics/format'
import {
  ATTRIBUTED_VITALS,
  ATTRIBUTION_PHASES,
  LOAD_STATE_LABEL,
  PHASE_LABEL,
  dominantPhase,
  lcpKindLabel,
  phaseSegments,
  type AttributedVital,
  type VitalAttributionRow,
} from '../../lib/analytics/attribution'

/**
 * Admin → Analytics → Web Vitals: where LCP, INP and CLS come from (G6).
 *
 * Per metric, the page × element groups of real-user samples that carried
 * attribution (lib/analytics/query.ts vitalAttributionSince): the worst
 * first, each with its p75, how many samples were poor and — for LCP and
 * INP — the p75 of every phase as a stacked bar (composition) with the
 * values written out beside it (the bar is decorative; the text is the
 * data). Selectors name the site's own markup only.
 *
 * Phase colours: the first categorical slots of the data-viz reference
 * palette in a fixed order, stepped per mode and validated for colour-vision
 * deficiency on both admin surfaces; identity never rests on colour alone
 * (legend + labelled values).
 */

const PHASE_COLORS: Array<{ light: string; dark: string }> = [
  { light: '#2a78d6', dark: '#3987e5' },
  { light: '#eb6834', dark: '#d95926' },
  { light: '#1baf7a', dark: '#199e70' },
  { light: '#eda100', dark: '#c98500' },
]

const RATING_COLOR: Record<VitalRating, { light: string; dark: string }> = {
  good: { light: 'green.700', dark: 'green.300' },
  'needs-improvement': { light: 'orange.700', dark: 'orange.300' },
  poor: { light: 'red.600', dark: 'red.300' },
}

const METRIC_HINT: Record<AttributedVital, string> = {
  LCP: 'The largest element painted while the page loaded, and how long each step before it took: server response, the wait before its file started loading, the download, and the render after it.',
  INP: 'The element visitors interacted with when the page answered slowest, split into the delay before the handlers ran, the handlers themselves and the paint after them.',
  CLS: 'The element that moved most in the largest burst of layout shifts, and when it happened.',
}

const pct = (n: number) => `${Math.round(n * 100)}%`

function Swatch({ index }: { index: number }) {
  const c = PHASE_COLORS[index % PHASE_COLORS.length]
  return <Box as="span" aria-hidden display="inline-block" w="10px" h="10px" borderRadius="2px" bg={c.light} _dark={{ bg: c.dark }} flexShrink={0} />
}

function Legend({ metric }: { metric: AttributedVital }) {
  if (metric === 'CLS') return null
  return (
    <HStack as="ul" listStyleType="none" spacing={4} flexWrap="wrap" rowGap={1} mb={3} fontSize="xs" color="page.fg-secondary" aria-label="Phases">
      {ATTRIBUTION_PHASES[metric].map((key, i) => (
        <HStack as="li" key={key} spacing={1.5}>
          <Swatch index={i} />
          <Text as="span">{PHASE_LABEL[key]}</Text>
        </HStack>
      ))}
    </HStack>
  )
}

/** Stacked bar (decorative: aria-hidden) + the phase values as text. */
function Breakdown({ row }: { row: VitalAttributionRow }) {
  const segments = phaseSegments(row)
  if (!segments.length) return <Text color="page.fg-secondary">—</Text>
  const lead = dominantPhase(row)
  return (
    <Box minW="220px">
      <Flex aria-hidden h="8px" borderRadius="4px" overflow="hidden" gap="2px" bg="page.border" mb={1.5}>
        {segments.map((s, i) =>
          s.share > 0 ? (
            <Box
              key={s.key}
              title={`${s.label}: ${formatVital(row.name, s.ms)} (p75)`}
              flexBasis={pct(s.share)}
              flexGrow={0}
              flexShrink={1}
              minW="2px"
              bg={PHASE_COLORS[i].light}
              _dark={{ bg: PHASE_COLORS[i].dark }}
            />
          ) : null,
        )}
      </Flex>
      <Text as="span" display="block" fontSize="11px" color="page.fg-secondary" lineHeight="1.5">
        {segments.map((s, i) => (
          <React.Fragment key={s.key}>
            {i > 0 ? ' · ' : ''}
            <Text as="span" fontWeight={lead?.key === s.key ? 600 : 400} color={lead?.key === s.key ? 'page.fg' : undefined}>
              {s.label} {formatVital(row.name, s.ms)}
            </Text>
          </React.Fragment>
        ))}
      </Text>
    </Box>
  )
}

function ElementCell({ row }: { row: VitalAttributionRow }) {
  const notes: string[] = []
  if (row.name === 'LCP') {
    const kind = lcpKindLabel(row.imageShare)
    if (kind) notes.push(kind)
  }
  if (row.name === 'INP' && row.type) notes.push(row.type)
  if (row.name !== 'LCP' && row.state) notes.push(LOAD_STATE_LABEL[row.state])
  return (
    <Td fontSize="xs" minW="180px" maxW={{ base: '220px', md: '320px' }}>
      {row.el ? (
        // Breaks between the selector's parts first (after each ">"), inside a part only when it must.
        <Text as="code" display="block" fontFamily={MONO} fontSize="11px" sx={{ overflowWrap: 'anywhere' }} title={row.el}>
          {row.el.split('>').map((part, i) => (
            <React.Fragment key={i}>
              {i > 0 ? (
                <>
                  {'>'}
                  <wbr />
                </>
              ) : null}
              {part}
            </React.Fragment>
          ))}
        </Text>
      ) : (
        <Text as="span" color="page.fg-secondary">
          Element not named
        </Text>
      )}
      {notes.length ? (
        <Text as="span" display="block" fontSize="11px" color="page.fg-secondary" mt={0.5}>
          {notes.join(' · ')}
        </Text>
      ) : null}
    </Td>
  )
}

function P75Cell({ row }: { row: VitalAttributionRow }) {
  const rating = rateVital(row.name, row.p75)
  const c = RATING_COLOR[rating]
  return (
    <Td isNumeric fontSize="xs" whiteSpace="nowrap">
      <Text as="span" display="block" fontWeight={600} className="tnum">
        {formatVital(row.name, row.p75)}
      </Text>
      <Text as="span" display="block" fontSize="11px" color={c.light} _dark={{ color: c.dark }}>
        {ratingLabel(rating)}
      </Text>
    </Td>
  )
}

export default function VitalsAttribution({ rows, windowLabel }: { rows: VitalAttributionRow[]; windowLabel: string }) {
  const [metric, setMetric] = useState<AttributedVital>('LCP')
  const shown = rows.filter((r) => r.name === metric)
  const counts = Object.fromEntries(ATTRIBUTED_VITALS.map((m) => [m, rows.filter((r) => r.name === m).length])) as Record<AttributedVital, number>
  const caption = `${metric} by page and element, worst first (${windowLabel})`
  // Wider than a phone: a focusable, labelled region the keyboard can scroll.
  const [tableRef, scrollRegion] = useScrollRegion(caption)

  return (
    <Box mt={6} pt={5} borderTop="1px solid" borderColor="page.border" data-testid="vitals-attribution">
      <Flex align={{ base: 'flex-start', sm: 'center' }} justify="space-between" gap={3} flexWrap="wrap" mb={2}>
        <Box>
          <Text as="h4" fontSize="sm" fontWeight={600}>
            What makes it slow
          </Text>
          <Text fontSize="xs" color="page.fg-secondary" mt={0.5} maxW="64ch">
            {METRIC_HINT[metric]} Elements are named by the site’s own markup (tag, id, classes) — never by
            text or anything a visitor typed.
          </Text>
        </Box>
        <HStack role="group" aria-label="Metric" spacing={0.5} p={0.5} border="1px solid" borderColor="page.border" borderRadius="lg" bg="page.bg-elevated">
          {ATTRIBUTED_VITALS.map((m) => {
            const active = m === metric
            return (
              <Button
                key={m}
                size="xs"
                minH="28px"
                px={2.5}
                variant="ghost"
                aria-pressed={active}
                onClick={() => setMetric(m)}
                fontFamily={MONO}
                fontWeight={active ? 600 : 400}
                fontSize="11px"
                bg={active ? 'page.bg' : 'transparent'}
                color={active ? 'page.fg' : 'page.fg-secondary'}
                boxShadow={active ? '0 0 0 1px var(--chakra-colors-page-border)' : 'none'}
                _hover={{ color: 'page.fg', bg: active ? 'page.bg' : 'page.hover' }}
              >
                {m}
                {counts[m] ? (
                  <Text as="span" ml={1.5} color="page.fg-secondary" fontWeight={400} className="tnum">
                    {counts[m]}
                  </Text>
                ) : null}
              </Button>
            )
          })}
        </HStack>
      </Flex>

      {shown.length ? (
        <>
          <Legend metric={metric} />
          <TableContainer ref={tableRef} {...scrollRegion} border="1px solid" borderColor="page.border" borderRadius="md" _focusVisible={SCROLL_REGION_FOCUS}>
            <Table
              size="sm"
              variant="simple"
              sx={{
                'th, td': { borderColor: 'page.border', verticalAlign: 'top' },
                th: { fontFamily: MONO, fontSize: '10px', letterSpacing: '0.12em', color: 'page.fg-secondary' },
                'tr:last-of-type td': { borderBottom: 'none' },
                td: { fontVariantNumeric: 'tabular-nums' },
              }}
            >
              <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                {caption}
              </caption>
              <Thead>
                <Tr>
                  <Th>Page</Th>
                  <Th>Element</Th>
                  <Th isNumeric>p75</Th>
                  <Th isNumeric>Poor</Th>
                  {metric === 'CLS' ? null : <Th>Phases (p75)</Th>}
                </Tr>
              </Thead>
              <Tbody>
                {shown.map((row) => (
                  <Tr key={`${row.route}\u0000${row.el ?? ''}`}>
                    <Td fontSize="xs" whiteSpace="nowrap">
                      {row.route === '*' ? 'All pages' : row.route}
                    </Td>
                    <ElementCell row={row} />
                    <P75Cell row={row} />
                    <Td isNumeric fontSize="xs" whiteSpace="nowrap" title={`${row.poor} of ${row.samples} sample${row.samples === 1 ? '' : 's'} rated poor`}>
                      <Text as="span" display="block" className="tnum">
                        {row.poor} / {row.samples}
                      </Text>
                      <Text as="span" display="block" fontSize="11px" color="page.fg-secondary">
                        {pct(row.samples ? row.poor / row.samples : 0)} poor
                      </Text>
                    </Td>
                    {metric === 'CLS' ? null : (
                      <Td fontSize="xs">
                        <Breakdown row={row} />
                      </Td>
                    )}
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </>
      ) : (
        <Text fontSize="sm" color="page.fg-secondary">
          No {metric} measurement with attribution in the last {windowLabel} yet. Attribution is recorded for visits from
          this release on.
        </Text>
      )}
    </Box>
  )
}
