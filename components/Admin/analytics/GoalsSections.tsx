import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertIcon, Box, SimpleGrid, Skeleton, Text } from '@chakra-ui/react'
import { readJsonObject } from '../shell/http'
import { Panel } from '../shell/ui'
import { formatCount } from '../../../lib/analytics/format'
import { isGoalsReport } from '../../../lib/analytics/goalsFormat'
import type { AnalyticsRange } from '../../../lib/analytics/shared'
import type { GoalsReport } from '../../../lib/analytics/eventsShared'
import GoalsTable from './GoalsTable'
import ConversionCard from './ConversionCard'
import EmptySearchesCard from './EmptySearchesCard'
import { SectionHead } from './ui'

/**
 * Admin → Analytics → goal events (H9, GET /api/admin/goals): the Goals
 * table, the Source → CV → Download conversion and the ⌘K searches that
 * found nothing. Follows the panel's period; `refreshToken` changes when the
 * panel's Refresh button is pressed.
 */

const RANGE_LABEL: Record<AnalyticsRange, string> = { '7d': '7 days', '30d': '30 days', '12m': '12 months' }
const RANGE_DAYS: Record<AnalyticsRange, number> = { '7d': 7, '30d': 30, '12m': 365 }
const PERIOD_LABEL: Record<AnalyticsRange, string> = {
  '7d': 'the previous 7 days',
  '30d': 'the previous 30 days',
  '12m': 'the previous 12 months',
}

const errText = (e: unknown) =>
  e instanceof Error ? (e.message === 'Failed to fetch' ? 'Network error' : e.message) : String(e)

export default function GoalsSections({ range, refreshToken }: { range: AnalyticsRange; refreshToken: number }) {
  const [source, setSource] = useState('')
  const [report, setReport] = useState<GoalsReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const headingId = useId()

  const load = useCallback(async (which: AnalyticsRange, from: string) => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setErr(null)
    try {
      const qs = new URLSearchParams({ range: which })
      if (from) qs.set('source', from)
      const res = await fetch(`/api/admin/goals?${qs}`, { cache: 'no-store', signal: controller.signal })
      const json = await readJsonObject(res)
      if (res.status === 401) throw new Error('Session expired — sign in again.')
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : `HTTP ${res.status}`)
      if (!isGoalsReport(json)) throw new Error('Unexpected response from the goals API.')
      setReport(json)
    } catch (e) {
      if (controller.signal.aborted) return
      setErr(errText(e))
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void load(range, source)
  }, [load, range, source, refreshToken])

  useEffect(() => () => requestRef.current?.abort(), [])

  if (!report) {
    return (
      <Box mb={4} data-goals="">
        {err ? (
          <Alert status="error" variant="left-accent" borderRadius="md" bg="page.bg-elevated" role="alert">
            <AlertIcon />
            <AlertDescription fontSize="sm">Goals could not be loaded: {err}</AlertDescription>
          </Alert>
        ) : loading ? (
          <Box aria-busy="true" aria-label="Loading goals">
            <Skeleton h="240px" borderRadius="xl" mb={4} />
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
              <Skeleton h="220px" borderRadius="xl" />
              <Skeleton h="220px" borderRadius="xl" />
            </SimpleGrid>
          </Box>
        ) : null}
      </Box>
    )
  }

  return (
    <Box aria-busy={loading} opacity={loading ? 0.7 : 1} mb={4} data-goals="">
      {err ? (
        <Alert status="error" variant="left-accent" borderRadius="md" mb={4} bg="page.bg-elevated" role="alert">
          <AlertIcon />
          <AlertDescription fontSize="sm">Goals could not be refreshed: {err}</AlertDescription>
        </Alert>
      ) : null}
      <Panel as="section" aria-labelledby={headingId} mb={4}>
        <SectionHead
          id={headingId}
          title="Goals"
          aside={
            <Text fontSize="xs" color="page.fg-secondary" className="tnum" alignSelf={{ sm: 'flex-end' }}>
              Site: {formatCount(report.siteVisitors)} visitor-day{report.siteVisitors === 1 ? '' : 's'}
            </Text>
          }
        >
          Counted without cookies or identifiers. A visitor-day is one visitor on one UTC day — the visitor hash changes daily, so
          someone who comes back on another day counts again. Conversion rate: a goal&rsquo;s visitor-days ÷ the site&rsquo;s.
        </SectionHead>
        <GoalsTable goals={report.goals} comparable={report.comparable} period={PERIOD_LABEL[range]} rangeLabel={RANGE_LABEL[range]} since={report.since} />
      </Panel>
      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4} alignItems="start">
        <ConversionCard funnel={report.funnel} rangeDays={RANGE_DAYS[range]} onSource={setSource} busy={loading} />
        <EmptySearchesCard searches={report.searches} />
      </SimpleGrid>
    </Box>
  )
}
