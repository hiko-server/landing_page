import { useId, useState } from 'react'
import { Box, Button, Flex, Icon, Tbody, Td, Text, Th, Thead, Tr, VisuallyHidden } from '@chakra-ui/react'
import { keyframes } from '@emotion/react'
import { FaChevronRight } from 'react-icons/fa'
import { cssTransition } from '../../../theme/tokens'
import { formatBucket, formatCount, formatDelta } from '../../../lib/analytics/format'
import { formatRate } from '../../../lib/analytics/goalsFormat'
import { GOAL_HINT, GOAL_LABEL, GOAL_PROP_LABEL, propLabel, type GoalRow } from '../../../lib/analytics/eventsShared'
import { EmptyNote, HairTable } from './ui'

/**
 * Goals table: one row per goal — visitor-days with the change vs the
 * previous period, events, and the conversion rate (the goal's visitor-days
 * ÷ the site's). A goal with a property opens a breakdown (file, page, site
 * or topic) below its row.
 */

const reveal = keyframes`from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: none; }`

function Trend({ row, comparable, period }: { row: GoalRow; comparable: boolean; period: string }) {
  const { value, previous, delta } = row.visitors
  const text = formatDelta(delta)
  if (text && delta !== null) {
    return (
      <>
        <Box as="span" aria-hidden mr={1}>
          {delta > 0 ? '↑' : delta < 0 ? '↓' : '→'}
        </Box>
        {text}
        <VisuallyHidden> vs {period}</VisuallyHidden>
      </>
    )
  }
  if (comparable && previous === 0 && value > 0) return <>new</>
  return (
    <>
      <span aria-hidden>—</span>
      <VisuallyHidden>{comparable ? `none in ${period}` : 'nothing to compare with yet'}</VisuallyHidden>
    </>
  )
}

function GoalTableRow({ row, comparable, period }: { row: GoalRow; comparable: boolean; period: string }) {
  const [open, setOpen] = useState(false)
  const detailId = useId()
  const label = GOAL_LABEL[row.name]
  const expandable = row.props.length > 0
  return (
    <>
      <Tr>
        <Td whiteSpace="normal" minW={{ base: '8rem', md: '14rem' }}>
          {expandable ? (
            <Button
              variant="unstyled"
              display="inline-flex"
              alignItems="center"
              gap={2}
              h="auto"
              minH="24px"
              fontSize="sm"
              fontWeight={500}
              textAlign="left"
              whiteSpace="normal"
              aria-expanded={open}
              aria-controls={detailId}
              onClick={() => setOpen((v) => !v)}
              _hover={{ color: 'accent.text' }}
              _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px', borderRadius: 'sm' }}
            >
              <Icon
                as={FaChevronRight}
                aria-hidden
                boxSize="10px"
                color="page.fg-secondary"
                transform={open ? 'rotate(90deg)' : 'none'}
                transition={cssTransition('transform', 'fast')}
              />
              {label}
            </Button>
          ) : (
            <Text fontSize="sm" fontWeight={500} pl="18px">
              {label}
            </Text>
          )}
          <Text fontSize="xs" color="page.fg-secondary" mt={0.5} pl="18px">
            {GOAL_HINT[row.name]}
            <Box as="span" display={{ base: 'inline', sm: 'none' }} className="tnum">
              {' '}
              · {formatCount(row.events)} event{row.events === 1 ? '' : 's'}
            </Box>
          </Text>
        </Td>
        <Td isNumeric>
          <Text fontSize="sm" fontWeight={600} className="tnum">
            {formatCount(row.visitors.value)}
          </Text>
          <Text fontSize="xs" color="page.fg-secondary" className="tnum" whiteSpace="nowrap">
            <Trend row={row} comparable={comparable} period={period} />
          </Text>
        </Td>
        <Td isNumeric display={{ base: 'none', sm: 'table-cell' }} fontSize="sm">
          {formatCount(row.events)}
        </Td>
        <Td isNumeric fontSize="sm">
          {formatRate(row.rate)}
        </Td>
      </Tr>
      {expandable ? (
        <Tr id={detailId} hidden={!open}>
          <Td colSpan={4} bg="page.bg-elevated" whiteSpace="normal" py={3}>
            <Box
              sx={{ animation: open ? `${reveal} var(--duration-base) var(--ease-standard)` : undefined }}
              pl={{ base: 0, sm: '18px' }}
            >
              <Text fontSize="xs" fontWeight={600} mb={1.5}>
                {label} by {GOAL_PROP_LABEL[row.name].toLowerCase()}
              </Text>
              <Box as="ul" listStyleType="none" m={0} p={0}>
                {row.props.map((p) => (
                  <Flex as="li" key={p.key} justify="space-between" gap={4} py={1} fontSize="xs" borderTop="1px solid" borderColor="page.border" _first={{ borderTop: 'none' }}>
                    <Text minW={0} overflowWrap="anywhere" dir="auto">
                      {propLabel(row.name, p.key)}
                    </Text>
                    <Text flexShrink={0} color="page.fg-secondary" className="tnum">
                      {formatCount(p.visitors)} visitor-day{p.visitors === 1 ? '' : 's'} · {formatCount(p.events)} event{p.events === 1 ? '' : 's'}
                    </Text>
                  </Flex>
                ))}
              </Box>
            </Box>
          </Td>
        </Tr>
      ) : null}
    </>
  )
}

export default function GoalsTable({
  goals,
  comparable,
  period,
  when,
  since,
}: {
  goals: GoalRow[]
  comparable: boolean
  /** "the previous 30 days" */
  period: string
  /** The period in a sentence: "in the last 30 days", "this month", "from Oct 1 to Oct 7". */
  when: string
  since: string | null
}) {
  const nothing = goals.every((g) => g.events === 0)
  return (
    <>
      <HairTable caption={`Goal events ${when}`}>
        <Thead>
          <Tr>
            <Th>Goal</Th>
            <Th isNumeric>Visitor-days</Th>
            <Th isNumeric display={{ base: 'none', sm: 'table-cell' }}>
              Events
            </Th>
            <Th isNumeric>
              <Box as="span" display={{ base: 'none', sm: 'inline' }}>
                Conversion rate
              </Box>
              <Box as="span" display={{ base: 'inline', sm: 'none' }}>
                Rate
              </Box>
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {goals.map((row) => (
            <GoalTableRow key={row.name} row={row} comparable={comparable} period={period} />
          ))}
        </Tbody>
      </HairTable>
      {nothing ? (
        <EmptyNote>
          No goal events {when}
          {since ? ` (goals are counted from ${formatBucket(since)}, ${since.slice(0, 4)} on)` : ''}.
        </EmptyNote>
      ) : null}
    </>
  )
}
