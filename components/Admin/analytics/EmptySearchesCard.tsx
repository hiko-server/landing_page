import { useId, useState } from 'react'
import { Box, Button, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react'
import { formatBucket, formatCount } from '../../../lib/analytics/format'
import { formatSpan } from '../../../lib/analytics/goalsFormat'
import { SEARCH_MAX_CHARS, SEARCH_MAX_DIGITS, SEARCH_RETENTION_DAYS, type GoalsReport } from '../../../lib/analytics/eventsShared'
import { Panel, outlineButtonProps } from '../shell/ui'
import { EmptyNote, HairTable, SectionHead } from './ui'

/**
 * ⌘K searches that found nothing (search_empty): the normalised text,
 * visitor-days, events and the last day it was seen. Kept 35 days.
 */

const COLLAPSED = 10

export default function EmptySearchesCard({ searches }: { searches: GoalsReport['searches'] }) {
  const headingId = useId()
  const tableId = useId()
  const [all, setAll] = useState(false)
  const rows = all ? searches.rows : searches.rows.slice(0, COLLAPSED)
  const more = searches.rows.length - COLLAPSED

  return (
    <Panel as="section" aria-labelledby={headingId} minW={0}>
      <SectionHead id={headingId} title="Searches with no results">
        What visitors typed in the ⌘K palette and did not find, {formatSpan(searches.from, searches.to)}. Stored lowercased and at most{' '}
        {SEARCH_MAX_CHARS} characters long; a search with an &ldquo;@&rdquo; or {SEARCH_MAX_DIGITS} or more digits is never stored. Kept {SEARCH_RETENTION_DAYS} days.
      </SectionHead>
      {rows.length ? (
        <>
          <Box id={tableId}>
            <HairTable caption="Searches with no results" wrap>
              <Thead>
                <Tr>
                  <Th>Search</Th>
                  <Th isNumeric>Visitor-days</Th>
                  <Th isNumeric>Last seen</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rows.map((r) => (
                  <Tr key={r.query}>
                    <Td fontSize="xs" overflowWrap="anywhere" dir="auto">
                      {r.query}
                    </Td>
                    <Td isNumeric fontSize="xs" title={`${formatCount(r.events)} search${r.events === 1 ? '' : 'es'}`}>
                      {formatCount(r.visitors)}
                    </Td>
                    <Td isNumeric fontSize="xs" whiteSpace="nowrap" color="page.fg-secondary">
                      <time dateTime={r.lastSeen}>{formatBucket(r.lastSeen)}</time>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </HairTable>
          </Box>
          {more > 0 ? (
            <Button size="sm" mt={3} {...outlineButtonProps} aria-expanded={all} aria-controls={tableId} onClick={() => setAll((v) => !v)}>
              {all ? 'Show fewer' : `Show all ${formatCount(searches.rows.length)}`}
            </Button>
          ) : null}
        </>
      ) : (
        <EmptyNote>
          No searches without results in the last {searches.days} day{searches.days === 1 ? '' : 's'}.
        </EmptyNote>
      )}
    </Panel>
  )
}
