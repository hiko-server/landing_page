import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Flex,
  Icon,
  SimpleGrid,
  Skeleton,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  HStack,
} from '@chakra-ui/react'
import { FaInfoCircle } from 'react-icons/fa'
import VitalsAttribution from './VitalsAttribution'
import { readJsonObject } from './shell/http'
import { Eyebrow, MONO, Panel } from './shell/ui'
import { SCROLL_REGION_FOCUS, useScrollRegion } from './shell/scrollRegion'
import { useAdminCommands } from './shell/useAdminCommands'
import {
  VITAL_NAMES,
  type Kpi,
  type VitalName,
  type VitalP75,
  type VitalRating,
} from '../../lib/analytics/shared'
import { countryName, formatBucket, formatCount, formatDelta, formatVital, ratingLabel } from '../../lib/analytics/format'
import {
  DIMENSION_LABEL,
  EXPLORE_PARAM_KEYS,
  EXPLORE_RAW_DAYS,
  exploreParams,
  exploreSearch,
  parseExploreQuery,
  withFilter,
  type ExploreDimension,
  type ExploreQuery,
} from '../../lib/analytics/exploreShared'
import { formatSpanWithYear, languageName, periodLabel, previousPhrase } from '../../lib/analytics/exploreFormat'
import type { ExploreReport } from '../../lib/analytics/explore'
import type { GoalName } from '../../lib/analytics/eventsShared'
import GoalsSections from './analytics/GoalsSections'
import ExploreBar from './analytics/ExploreBar'
import TrendChart, { type ChartMetric } from './analytics/TrendChart'
import RankCard from './analytics/RankCard'
import PageDetailCard from './analytics/PageDetailCard'
import DigestCard from './analytics/DigestCard'

/**
 * Admin → Analytics (H10 explore): first-party, cookieless page views,
 * real-user Core Web Vitals (GET /api/admin/analytics) and the goal events
 * — Goals, Conversion, Paths to a goal, Searches with no results — in
 * components/Admin/analytics (GET /api/admin/goals), for one view: a
 * period, an optional comparison with the period before, and filters that
 * every number on the page follows. The view lives in the URL
 * (lib/analytics/exploreShared), so it survives a reload, can be
 * bookmarked and is exported (CSV) exactly as shown. Mounted by the
 * dashboard shell with no props.
 */

const errText = (e: unknown) =>
  e instanceof Error ? (e.message === 'Failed to fetch' ? 'Network error' : e.message) : String(e)

function isReport(v: Record<string, unknown>): v is ExploreReport & Record<string, unknown> {
  return Array.isArray(v.series) && !!v.kpis && typeof v.kpis === 'object' && !!v.vitals && typeof v.vitals === 'object' && !!v.window && typeof v.window === 'object'
}

// ── Small pieces ──────────────────────────────────────────────────────────

function MetricTab({
  label,
  value,
  kpi,
  previous,
  selected,
  onSelect,
  comparable,
}: {
  label: string
  value: number
  kpi: Kpi
  previous: string
  selected: boolean
  onSelect: () => void
  comparable: boolean
}) {
  const delta = formatDelta(kpi.delta)
  return (
    <Box
      as="button"
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      textAlign="left"
      minW={0}
      py={2}
      px={3}
      mx={-3}
      borderRadius="lg"
      position="relative"
      transition="background var(--duration-fast) var(--ease-standard)"
      _hover={{ bg: 'page.hover' }}
      _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
      _after={{
        content: '""',
        position: 'absolute',
        left: 3,
        right: 3,
        bottom: 0,
        h: '2px',
        borderRadius: 'full',
        bg: selected ? 'var(--accent)' : 'transparent',
      }}
    >
      <Eyebrow color={selected ? 'accent.text' : undefined}>{label}</Eyebrow>
      <Text className="tnum" fontSize={{ base: '2xl', md: '3xl' }} fontWeight={600} letterSpacing="-0.03em" lineHeight={1.15} mt={1}>
        {formatCount(value)}
      </Text>
      <Text className="tnum" fontSize="xs" color="page.fg-secondary" mt={0.5}>
        {delta && kpi.delta !== null ? (
          <>
            <Box as="span" aria-hidden mr={1}>
              {kpi.delta > 0 ? '↑' : kpi.delta < 0 ? '↓' : '→'}
            </Box>
            {delta} vs {previous}
          </>
        ) : comparable && kpi.previous === 0 && value > 0 ? (
          `New — none in ${previous}`
        ) : (
          `No data for ${previous} to compare`
        )}
      </Text>
    </Box>
  )
}

function HairlineTable({ caption, children }: { caption: string; children: React.ReactNode }) {
  const [ref, region] = useScrollRegion(caption)
  return (
    <TableContainer ref={ref} {...region} border="1px solid" borderColor="page.border" borderRadius="md" _focusVisible={SCROLL_REGION_FOCUS}>
      <Table
        size="sm"
        variant="simple"
        sx={{
          'th, td': { borderColor: 'page.border' },
          th: { fontFamily: MONO, fontSize: '10px', letterSpacing: '0.12em', color: 'page.fg-secondary' },
          'tr:last-of-type td': { borderBottom: 'none' },
          td: { fontVariantNumeric: 'tabular-nums' },
        }}
      >
        <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{caption}</caption>
        {children}
      </Table>
    </TableContainer>
  )
}

const RATING_COLOR: Record<VitalRating, { light: string; dark: string }> = {
  good: { light: 'green.700', dark: 'green.300' },
  'needs-improvement': { light: 'orange.700', dark: 'orange.300' },
  poor: { light: 'red.600', dark: 'red.300' },
}

function RatingCell({ entry }: { entry: VitalP75 | undefined }) {
  if (!entry) {
    return (
      <Td isNumeric fontSize="xs" color="page.fg-secondary">
        —
      </Td>
    )
  }
  const c = RATING_COLOR[entry.rating]
  return (
    <Td isNumeric fontSize="xs" title={`${entry.samples} sample${entry.samples === 1 ? '' : 's'}`}>
      <Text as="span" display="block" fontWeight={600} className="tnum">
        {formatVital(entry.name, entry.p75)}
      </Text>
      <Text as="span" display="block" fontSize="11px" color={c.light} _dark={{ color: c.dark }} whiteSpace="nowrap">
        <Box
          as="span"
          aria-hidden
          display="inline-block"
          w="6px"
          h="6px"
          borderRadius="full"
          bg="currentColor"
          mr={1}
          verticalAlign="middle"
          sx={{ '@media (forced-colors: active)': { display: 'none' } }}
        />
        {ratingLabel(entry.rating)}
      </Text>
    </Td>
  )
}

function VitalsTable({ entries }: { entries: VitalP75[] }) {
  const routes = Array.from(new Set(entries.map((e) => e.route)))
  const lookup = new Map(entries.map((e) => [`${e.route}\u0000${e.name}`, e]))
  return (
    <HairlineTable caption="Web Vitals at the 75th percentile, per page">
      <Thead>
        <Tr>
          <Th>Page</Th>
          {VITAL_NAMES.map((name) => (
            <Th key={name} isNumeric>
              {name}
            </Th>
          ))}
        </Tr>
      </Thead>
      <Tbody>
        {routes.map((route) => (
          <Tr key={route}>
            <Td fontSize="xs" fontWeight={route === '*' ? 600 : 400}>
              {route === '*' ? 'All pages' : route}
            </Td>
            {VITAL_NAMES.map((name: VitalName) => (
              <RatingCell key={name} entry={lookup.get(`${route}\u0000${name}`)} />
            ))}
          </Tr>
        ))}
      </Tbody>
    </HairlineTable>
  )
}

function WindowToggle({ value, onChange }: { value: '7d' | '28d'; onChange: (v: '7d' | '28d') => void }) {
  return (
    <HStack role="group" aria-label="Web Vitals window" spacing={0.5} p={0.5} border="1px solid" borderColor="page.border" borderRadius="lg" bg="page.bg-elevated">
      {(['7d', '28d'] as const).map((k) => {
        const active = k === value
        return (
          <Button
            key={k}
            size="xs"
            minH="28px"
            px={2.5}
            variant="ghost"
            aria-pressed={active}
            onClick={() => onChange(k)}
            fontFamily={MONO}
            fontWeight={active ? 600 : 400}
            fontSize="11px"
            bg={active ? 'page.bg' : 'transparent'}
            color={active ? 'page.fg' : 'page.fg-secondary'}
            boxShadow={active ? '0 0 0 1px var(--chakra-colors-page-border)' : 'none'}
            _hover={{ color: 'page.fg', bg: active ? 'page.bg' : 'page.hover' }}
          >
            {k === '7d' ? '7 days' : '28 days'}
          </Button>
        )
      })}
    </HStack>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <Flex gap={2} align="flex-start" fontSize="sm" color="page.fg-secondary" mb={4} px={3} py={2.5} borderRadius="md" border="1px solid" borderColor="page.border" bg="page.bg-elevated" role="status" data-explore-note="">
      <Icon as={FaInfoCircle} aria-hidden mt="3px" flexShrink={0} color="accent.text" />
      <Box>{children}</Box>
    </Flex>
  )
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

// ── Panel ─────────────────────────────────────────────────────────────────

export default function AnalyticsPanel() {
  const router = useRouter()
  const urlQuery = useMemo(() => parseExploreQuery(router.query), [router.query])
  // The view just chosen, until the URL has caught up (a shallow replace is
  // not synchronous): controls answer at once, and Back / Forward still win.
  const [pending, setPending] = useState<ExploreQuery | null>(null)
  useEffect(() => setPending(null), [router.query])
  const query = pending ?? urlQuery
  const search = exploreSearch(query)
  const [metric, setMetric] = useState<ChartMetric>('visitors')
  const [vitalsWindow, setVitalsWindow] = useState<'7d' | '28d'>('28d')
  const [source, setSource] = useState('')
  const [goal, setGoal] = useState<GoalName>('cv_download')
  const [report, setReport] = useState<ExploreReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const requestRef = useRef<AbortController | null>(null)

  const setQuery = useCallback(
    (next: ExploreQuery) => {
      const rest: Record<string, string | string[]> = {}
      for (const [k, v] of Object.entries(router.query)) {
        if (v !== undefined && !(EXPLORE_PARAM_KEYS as readonly string[]).includes(k)) rest[k] = v
      }
      const own: Record<string, string | string[]> = {}
      for (const [k, v] of exploreParams(next)) {
        const cur = own[k]
        own[k] = cur === undefined ? v : Array.isArray(cur) ? [...cur, v] : [cur, v]
      }
      setPending(next)
      void router.replace({ pathname: router.pathname, query: { ...rest, ...own } }, undefined, { shallow: true, scroll: false })
    },
    [router],
  )

  const load = useCallback(async (qs: string) => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch(`/api/admin/analytics?${qs}`, { cache: 'no-store', signal: controller.signal })
      const json = await readJsonObject(res)
      if (res.status === 401) throw new Error('Session expired — sign in again.')
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : `HTTP ${res.status}`)
      if (!isReport(json)) throw new Error('Unexpected response from the analytics API.')
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
    if (!router.isReady) return
    void load(search)
  }, [load, search, refreshToken, router.isReady])

  useEffect(() => () => requestRef.current?.abort(), [])

  const addFilter = useCallback((dim: ExploreDimension, value: string) => setQuery({ ...query, filters: withFilter(query.filters, { dim, op: 'is', value }) }), [query, setQuery])
  const refresh = useCallback(() => setRefreshToken((n) => n + 1), [])

  // ⌘K: this view's actions.
  useAdminCommands(
    'analytics',
    [
      { id: 'compare', label: query.compare ? 'Analytics: stop comparing' : 'Analytics: compare with the previous period', keywords: 'compare previous period chart', run: () => setQuery({ ...query, compare: !query.compare }) },
      ...(query.filters.length ? [{ id: 'clear', label: 'Analytics: clear the filters', hint: `${query.filters.length} active`, keywords: 'filter reset remove', run: () => setQuery({ ...query, filters: [] }) }] : []),
      {
        id: 'export',
        label: 'Analytics: export this view (.zip of CSV)',
        keywords: 'csv download export spreadsheet',
        run: () => {
          window.location.assign(`/api/admin/analytics/export?${exploreSearch(query, [...(source ? ([['source', source]] as Array<[string, string]>) : []), ['goal', goal], ['table', 'all']])}`)
        },
      },
    ],
    `${search}|${source}|${goal}`,
  )

  const exportExtra = useMemo<Array<[string, string]>>(() => [...(source ? ([['source', source]] as Array<[string, string]>) : []), ['goal', goal]], [source, goal])
  const active = (dim: ExploreDimension) => query.filters.find((f) => f.dim === dim)
  const r = report
  const previous = r && r.mode === 'raw' && r.window.clipped ? `the previous ${r.window.days} days` : previousPhrase(query)
  const vitals = r ? r.vitals[vitalsWindow] : []
  const hasData = !!r && r.series.some((p) => p.views > 0)
  const ignoredByVitals = r ? query.filters.filter((f) => !r.vitalsScope.includes(f.dim)).map((f) => DIMENSION_LABEL[f.dim].toLowerCase()) : []
  const windowText = r && !r.window.empty ? formatSpanWithYear(r.window) : ''

  return (
    <Box>
      <Flex justify="space-between" align={{ base: 'stretch', md: 'flex-end' }} mb={5} flexWrap="wrap" gap={4}>
        <Box maxW="66ch">
          <Eyebrow accent color="accent.text">
            [analytics]
          </Eyebrow>
          <Text as="h2" fontSize="lg" fontWeight={600} letterSpacing="-0.02em" mt={1}>
            Analytics
          </Text>
          <Text fontSize="sm" color="page.fg-secondary" mt={1}>
            First-party and cookieless. IP addresses and user agents are never stored; visitors are counted with a hash that changes every day. Do Not Track,
            Global Privacy Control, bots and your own visits are not recorded. Click any name in a table to filter the whole page by it.
          </Text>
        </Box>
      </Flex>

      <ExploreBar query={query} onChange={setQuery} onRefresh={refresh} loading={loading} exportExtra={exportExtra} />

      {err ? (
        <Alert status="error" variant="left-accent" borderRadius="md" mb={4} bg="page.bg-elevated" role="alert">
          <AlertIcon />
          <AlertDescription fontSize="sm">{err}</AlertDescription>
        </Alert>
      ) : null}

      {r && r.mode === 'raw' && r.window.empty ? (
        <Note>
          This period ended before the detailed records begin ({formatBucket(r.rawFrom)}): filters need them, and they are kept {EXPLORE_RAW_DAYS} days. Remove the
          filters to see the period&rsquo;s daily totals.
        </Note>
      ) : r && r.mode === 'raw' && r.window.clipped ? (
        <Note>
          Filtered views use the detailed records, kept {EXPLORE_RAW_DAYS} days: showing <strong>{windowText}</strong> of {periodLabel(query, r.period).toLowerCase()}.
          Without filters, the whole period comes from the daily totals.
        </Note>
      ) : null}

      {!r && loading ? (
        <Box aria-busy="true" aria-label="Loading analytics">
          <Skeleton h="96px" borderRadius="xl" mb={4} />
          <Skeleton h="280px" borderRadius="xl" />
        </Box>
      ) : null}

      {r ? (
        <Box aria-busy={loading} opacity={loading ? 0.7 : 1} transition="opacity var(--duration-fast)">
          {r.page ? <PageDetailCard page={r.page} visitors={r.kpis.visitors} vitals={r.vitals['28d']} windowLabel={windowText || formatSpanWithYear(r.period)} /> : null}

          <Panel mb={4}>
            <SimpleGrid role="group" aria-label="Chart metric" columns={{ base: 2, sm: 3 }} spacingX={{ base: 6, md: 6 }} spacingY={2} mb={5}>
              <MetricTab label="Visitors" value={r.kpis.visitors.value} kpi={r.kpis.visitors} previous={previous} selected={metric === 'visitors'} onSelect={() => setMetric('visitors')} comparable={r.previous.available} />
              <MetricTab label="Views" value={r.kpis.views.value} kpi={r.kpis.views} previous={previous} selected={metric === 'views'} onSelect={() => setMetric('views')} comparable={r.previous.available} />
              <Box minW={0} py={2}>
                <Eyebrow>Live</Eyebrow>
                <Text className="tnum" fontSize={{ base: '2xl', md: '3xl' }} fontWeight={600} letterSpacing="-0.03em" lineHeight={1.15} mt={1}>
                  {formatCount(r.live)}
                </Text>
                <Text fontSize="xs" color="page.fg-secondary" mt={0.5}>
                  visitor{r.live === 1 ? '' : 's'} in the last 5 minutes
                </Text>
              </Box>
            </SimpleGrid>
            {hasData ? (
              <TrendChart series={r.series} previous={r.previousSeries} bucket={r.bucket} metric={metric} annotations={r.annotations} />
            ) : (
              <Text fontSize="sm" color="page.fg-secondary" py={6} textAlign="center">
                {r.window.empty ? 'No detailed records for this period.' : `No page views ${query.filters.length ? 'match the filters' : 'recorded'} ${windowText ? `from ${windowText}` : 'in this period'}.`}
              </Text>
            )}
            {query.compare && !r.previous.available && hasData ? (
              <Text fontSize="xs" color="page.fg-secondary" mt={2}>
                Nothing to compare with: {r.mode === 'raw' ? `the detailed records do not reach back to ${formatBucket(r.previous.from)}` : `no data for ${formatSpanWithYear(r.previous)} yet`}.
              </Text>
            ) : null}
          </Panel>

          <GoalsSections query={query} source={source} goal={goal} onSource={setSource} onGoal={setGoal} refreshToken={refreshToken} />

          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4} mb={4}>
            <RankCard
              title="Top pages"
              dim="page"
              keyLabel="Page"
              rows={r.topPages}
              showViews
              active={active('page')}
              onFilter={addFilter}
              renderKey={(path) =>
                r.titles[path] ? (
                  <>
                    <Box as="span">{r.titles[path]}</Box>
                    <Box as="span" fontFamily={MONO} color="page.fg-secondary" ml={1.5} fontSize="11px">
                      {path}
                    </Box>
                  </>
                ) : (
                  path
                )
              }
              empty="No page views in this period."
            />
            <RankCard title="Referrers" dim="source" keyLabel="Site" rows={r.referrers} active={active('source')} onFilter={addFilter} empty="No visits from other sites in this period." />
            <RankCard
              title="Countries"
              dim="country"
              keyLabel="Country"
              rows={r.countries}
              showViews
              active={active('country')}
              onFilter={addFilter}
              renderKey={(code) => `${countryName(code)} (${code})`}
              empty="No country information in this period."
            />
            <RankCard title="Devices" dim="device" keyLabel="Device" rows={r.devices} showViews active={active('device')} onFilter={addFilter} renderKey={capitalize} empty="No visits in this period." />
            <RankCard title="Browsers" dim="browser" keyLabel="Browser" rows={r.browsers} showViews active={active('browser')} onFilter={addFilter} empty="No visits in this period." />
            <RankCard
              title="Page languages"
              dim="lang"
              keyLabel="Language"
              rows={r.languages}
              showViews
              active={active('lang')}
              onFilter={addFilter}
              renderKey={(tag) => {
                const name = languageName(tag)
                return name === tag ? tag : `${name} (${tag})`
              }}
              empty="No page languages in this period."
              note={
                <>
                  The language of the page read, not of the visitor.
                  {r.mode === 'rollup' && r.langsSince && r.period.from < r.langsSince ? ` Counted from ${formatBucket(r.langsSince)}, ${r.langsSince.slice(0, 4)}.` : ''}
                </>
              }
            />
          </SimpleGrid>

          <Panel id="vitals" scrollMarginTop="96px">
            <Flex align={{ base: 'flex-start', sm: 'center' }} justify="space-between" gap={3} flexWrap="wrap" mb={3}>
              <Box>
                <Text as="h3" fontSize="sm" fontWeight={600}>
                  Web Vitals (real users)
                </Text>
                <Text fontSize="xs" color="page.fg-secondary" mt={0.5} maxW="62ch">
                  75th percentile of what visitors experienced, rated with the web.dev thresholds (LCP 2.5 s / 4 s, INP 200 ms / 500 ms, CLS 0.1 / 0.25).
                  {ignoredByVitals.length
                    ? ` Filtered by ${r.vitalsScope.length ? r.vitalsScope.map((d) => DIMENSION_LABEL[d].toLowerCase()).join(' and ') : 'nothing'} only: measurements carry the page and device class, no ${ignoredByVitals.join(', ')}.`
                    : ''}
                </Text>
              </Box>
              <WindowToggle value={vitalsWindow} onChange={setVitalsWindow} />
            </Flex>
            {vitals.length ? (
              <VitalsTable entries={vitals} />
            ) : (
              <Text fontSize="sm" color="page.fg-secondary">
                No Web Vitals measured in the last {vitalsWindow === '7d' ? '7' : '28'} days{r.vitalsScope.length ? ' for these filters' : ''} yet.
              </Text>
            )}
            {vitals.length && r.attribution ? (
              <VitalsAttribution rows={r.attribution[vitalsWindow]} windowLabel={vitalsWindow === '7d' ? '7 days' : '28 days'} />
            ) : null}
          </Panel>

          <DigestCard />
        </Box>
      ) : null}
    </Box>
  )
}
