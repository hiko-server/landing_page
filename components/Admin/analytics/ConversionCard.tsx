import { useId } from 'react'
import { Box, Flex, FormControl, FormLabel, Select, Text } from '@chakra-ui/react'
import { cssTransition } from '../../../theme/tokens'
import { formatCount } from '../../../lib/analytics/format'
import { barWidth, formatRate, formatSpan, shareOf } from '../../../lib/analytics/goalsFormat'
import type { GoalsFunnel } from '../../../lib/analytics/eventsShared'
import { Panel, inputProps } from '../shell/ui'
import { EmptyNote, SectionHead } from './ui'

/**
 * Source → CV → Download, per visitor-day (lib/analytics/goalsQuery
 * conversionSteps). The source is "every visitor" or one referrer host of
 * the window. Raw rows only, so never more than the last 35 days.
 */
export default function ConversionCard({
  funnel,
  rangeDays,
  onSource,
  busy,
  filtered = false,
}: {
  funnel: GoalsFunnel
  /** Days of the selected period (the window is shorter when the period reaches past the raw data). */
  rangeDays: number
  /** The view is filtered: only the visitor-days with a matching page view count. */
  filtered?: boolean
  onSource: (source: string) => void
  busy: boolean
}) {
  const headingId = useId()
  const selectId = useId()
  const [first] = funnel.steps
  const clipped = funnel.days < rangeDays
  const sources = funnel.source && !funnel.sources.some((s) => s.key === funnel.source) ? [{ key: funnel.source, visitors: 0 }, ...funnel.sources] : funnel.sources

  return (
    <Panel as="section" aria-labelledby={headingId} minW={0}>
      <SectionHead
        id={headingId}
        title="Conversion"
        aside={
          <FormControl w={{ base: '100%', sm: 'auto' }} minW={{ sm: '200px' }}>
            <FormLabel htmlFor={selectId} fontSize="xs" color="page.fg-secondary" mb={1}>
              Source
            </FormLabel>
            <Select id={selectId} size="sm" {...inputProps} value={funnel.source ?? ''} onChange={(e) => onSource(e.target.value)}>
              <option value="">All visitors</option>
              {sources.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.key}
                  {s.visitors ? ` (${formatCount(s.visitors)})` : ''}
                </option>
              ))}
            </Select>
          </FormControl>
        }
      >
        Per visitor-day, in order: arrived, then opened /cv or /cv/zh, then downloaded a CV file. {formatSpan(funnel.from, funnel.to)}
        {clipped ? ` — the last ${funnel.days} days only: linking the steps needs the daily visitor hash, which is kept with the raw data for 35 days.` : '.'}
        {filtered ? ' Filtered: only visitor-days with a page view matching the filters.' : ''}
      </SectionHead>

      {!first || first.visitors === 0 ? (
        <EmptyNote>
          {funnel.source ? `No visits from ${funnel.source}` : 'No visits'} in the last {funnel.days} day{funnel.days === 1 ? '' : 's'}.
        </EmptyNote>
      ) : (
        <Box as="ol" listStyleType="none" m={0} p={0} aria-busy={busy}>
          {funnel.steps.map((step, i) => {
            const prev = i > 0 ? funnel.steps[i - 1].visitors : null
            return (
              <Box as="li" key={step.label} py={2.5} borderTop={i ? '1px solid' : 'none'} borderColor="page.border">
                <Flex justify="space-between" align="baseline" gap={3}>
                  <Text fontSize="sm" minW={0}>
                    <Box as="span" color="page.fg-secondary" className="tnum" mr={2} aria-hidden>
                      {i + 1}
                    </Box>
                    {step.label}
                  </Text>
                  <Text fontSize="sm" fontWeight={600} className="tnum" flexShrink={0}>
                    {formatCount(step.visitors)}
                    <Box as="span" fontWeight={400} fontSize="xs" color="page.fg-secondary" ml={1}>
                      visitor-day{step.visitors === 1 ? '' : 's'}
                    </Box>
                  </Text>
                </Flex>
                <Box aria-hidden h="6px" mt={2} borderRadius="full" bg="page.bg-elevated" border="1px solid" borderColor="page.border" overflow="hidden">
                  <Box
                    h="100%"
                    w={`${barWidth(step.visitors, first.visitors)}%`}
                    bg="var(--accent)"
                    borderRadius="full"
                    transition={cssTransition('width', 'slow')}
                    sx={{ '@media (forced-colors: active)': { bg: 'CanvasText' } }}
                  />
                </Box>
                {prev !== null ? (
                  <Text fontSize="xs" color="page.fg-secondary" mt={1.5} className="tnum">
                    {formatRate(shareOf(step.visitors, prev))} of the step before · {formatRate(shareOf(step.visitors, first.visitors))} of all
                  </Text>
                ) : null}
              </Box>
            )
          })}
        </Box>
      )}

      {funnel.directDownloads > 0 ? (
        <Text fontSize="xs" color="page.fg-secondary" mt={3} pt={3} borderTop="1px solid" borderColor="page.border">
          Not in the steps: {formatCount(funnel.directDownloads)} visitor-day{funnel.directDownloads === 1 ? '' : 's'} opened a CV file without viewing
          any page that day — a direct link to the file, e.g. from a profile or an e-mail.
        </Text>
      ) : null}
    </Panel>
  )
}
