import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertIcon, Box, SimpleGrid, Skeleton, Text } from '@chakra-ui/react'
import { readJsonObject } from '../shell/http'
import { Panel } from '../shell/ui'
import { formatCount } from '../../../lib/analytics/format'
import { isGoalsReport } from '../../../lib/analytics/goalsFormat'
import { utcDay } from '../../../lib/analytics/shared'
import { exploreSearch, resolvePeriod, spanDays, type ExploreQuery } from '../../../lib/analytics/exploreShared'
import { periodPhrase, previousPhrase } from '../../../lib/analytics/exploreFormat'
import type { GoalName, GoalsReport } from '../../../lib/analytics/eventsShared'
import GoalsTable from './GoalsTable'
import ConversionCard from './ConversionCard'
import PathsCard from './PathsCard'
import EmptySearchesCard from './EmptySearchesCard'
import { SectionHead } from './ui'

/**
 * Admin → Analytics → goal events (H9, H10; GET /api/admin/goals): the
 * Goals table, the Source → CV → Download conversion, the paths to a goal
 * and the ⌘K searches that found nothing — for the panel's view (period,
 * comparison, filters). The conversion's source and the paths' goal are the
 * panel's state (the export uses them too); `refreshToken` changes when the
 * panel's Refresh button is pressed.
 */

const errText = (e: unknown) =>
  e instanceof Error ? (e.message === 'Failed to fetch' ? 'Network error' : e.message) : String(e)

export default function GoalsSections({
  query,
  source,
  goal,
  onSource,
  onGoal,
  refreshToken,
}: {
  query: ExploreQuery
  source: string
  goal: GoalName
  onSource: (source: string) => void
  onGoal: (goal: GoalName) => void
  refreshToken: number
}) {
  const [report, setReport] = useState<GoalsReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const headingId = useId()
  const search = exploreSearch(query, [
    ...(source ? ([['source', source]] as Array<[string, string]>) : []),
    ['goal', goal],
  ])

  const load = useCallback(async (qs: string) => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setErr(null)
    try {
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
    void load(search)
  }, [load, search, refreshToken])

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

  const filtered = report.mode === 'raw'
  const span = report.window ?? { from: report.from, to: report.to, days: 0, clipped: false }
  const when = periodPhrase(query, span, !!report.window?.clipped)
  const periodDays = spanDays(resolvePeriod(query, utcDay(report.generatedAt)))

  return (
    <Box aria-busy={loading} opacity={loading ? 0.7 : 1} transition="opacity var(--duration-fast)" mb={4} data-goals="">
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
              {filtered ? 'Matching' : 'Site'}: {formatCount(report.siteVisitors)} visitor-day{report.siteVisitors === 1 ? '' : 's'}
            </Text>
          }
        >
          Counted without cookies or identifiers. A visitor-day is one visitor on one UTC day — the visitor hash changes daily, so
          someone who comes back on another day counts again. Conversion rate: a goal&rsquo;s visitor-days ÷ the {filtered ? 'matching' : 'site’s'}
          {filtered ? ' visitor-days (those with a page view that matches the filters)' : ''}.
        </SectionHead>
        <GoalsTable
          goals={report.goals}
          comparable={report.comparable}
          period={report.window?.clipped ? `the previous ${report.window.days} days` : previousPhrase(query)}
          when={when}
          since={report.since}
        />
      </Panel>
      {/* Two columns from lg: the conversion with the searches under it, the paths beside both. */}
      <Box
        display="grid"
        gap={4}
        alignItems="start"
        gridTemplateColumns={{ base: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' }}
        gridTemplateRows={{ lg: 'auto 1fr' }}
        gridTemplateAreas={{ base: '"conversion" "paths" "searches"', lg: '"conversion paths" "searches paths"' }}
      >
        <Box gridArea="conversion" minW={0}>
          <ConversionCard funnel={report.funnel} rangeDays={periodDays} onSource={onSource} busy={loading} filtered={filtered} />
        </Box>
        {report.paths ? (
          <Box gridArea="paths" minW={0}>
            <PathsCard paths={report.paths} onGoal={onGoal} busy={loading} />
          </Box>
        ) : null}
        <Box gridArea="searches" minW={0}>
          <EmptySearchesCard searches={report.searches} />
        </Box>
      </Box>
    </Box>
  )
}
