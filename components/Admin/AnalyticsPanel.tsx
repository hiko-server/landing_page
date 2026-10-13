import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Flex,
  HStack,
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
} from '@chakra-ui/react'
import { FaSync } from 'react-icons/fa'
import { readJsonObject } from './shell/http'
import { Eyebrow, MONO, Panel } from './shell/ui'
import {
  ANALYTICS_RANGES,
  VITAL_NAMES,
  type AnalyticsRange,
  type AnalyticsReport,
  type CountRow,
  type Kpi,
  type SeriesPoint,
  type VitalName,
  type VitalP75,
  type VitalRating,
} from '../../lib/analytics/shared'
import {
  countryName,
  formatBucket,
  formatCompact,
  formatCount,
  formatDelta,
  formatVital,
  niceMax,
  ratingLabel,
} from '../../lib/analytics/format'

/**
 * Admin → Analytics: first-party, cookieless page views and real-user Core
 * Web Vitals (GET /api/admin/analytics). Mounted by the dashboard shell with
 * no props.
 */

const RANGE_LABEL: Record<AnalyticsRange, string> = { '7d': '7 days', '30d': '30 days', '12m': '12 months' }
const PERIOD_LABEL: Record<AnalyticsRange, string> = {
  '7d': 'the previous 7 days',
  '30d': 'the previous 30 days',
  '12m': 'the previous 12 months',
}

const errText = (e: unknown) =>
  e instanceof Error ? (e.message === 'Failed to fetch' ? 'Network error' : e.message) : String(e)

function isReport(v: Record<string, unknown>): v is AnalyticsReport & Record<string, unknown> {
  return Array.isArray(v.series) && !!v.kpis && typeof v.kpis === 'object' && !!v.vitals && typeof v.vitals === 'object'
}

// ── Small pieces ──────────────────────────────────────────────────────────

function ToggleGroup<K extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Array<{ key: K; label: string }>
  value: K
  onChange: (key: K) => void
}) {
  return (
    <HStack
      role="group"
      aria-label={label}
      spacing={0.5}
      p={0.5}
      border="1px solid"
      borderColor="page.border"
      borderRadius="lg"
      bg="page.bg-elevated"
    >
      {options.map((o) => {
        const active = o.key === value
        return (
          <Button
            key={o.key}
            size="xs"
            minH="28px"
            px={2.5}
            variant="ghost"
            aria-pressed={active}
            onClick={() => onChange(o.key)}
            fontFamily={MONO}
            fontWeight={active ? 600 : 400}
            fontSize="11px"
            bg={active ? 'page.bg' : 'transparent'}
            color={active ? 'page.fg' : 'page.fg-secondary'}
            boxShadow={active ? '0 0 0 1px var(--chakra-colors-page-border)' : 'none'}
            _hover={{ color: 'page.fg', bg: active ? 'page.bg' : 'page.hover' }}
          >
            {o.label}
          </Button>
        )
      })}
    </HStack>
  )
}

function KpiCell({ label, value, kpi, period }: { label: string; value: string; kpi?: Kpi; period?: string }) {
  const delta = kpi ? formatDelta(kpi.delta) : null
  return (
    <Box minW={0} py={1}>
      <Eyebrow>{label}</Eyebrow>
      <Text className="tnum" fontSize={{ base: '2xl', md: '3xl' }} fontWeight={600} letterSpacing="-0.03em" lineHeight={1.15} mt={1}>
        {value}
      </Text>
      {kpi ? (
        <Text className="tnum" fontSize="xs" color="page.fg-secondary" mt={0.5}>
          {delta ? (
            <>
              <Box as="span" aria-hidden mr={1}>
                {kpi.delta !== null && kpi.delta > 0 ? '↑' : kpi.delta !== null && kpi.delta < 0 ? '↓' : '→'}
              </Box>
              {delta} vs {period}
            </>
          ) : (
            `No data for ${period} to compare`
          )}
        </Text>
      ) : null}
    </Box>
  )
}

function useElementWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

// ── Area chart ────────────────────────────────────────────────────────────

const CHART_H = 220
const PAD = { top: 14, right: 12, bottom: 26, left: 40 }

function AreaChart({ series, bucket }: { series: SeriesPoint[]; bucket: 'day' | 'month' }) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const [focusIndex, setFocusIndex] = useState(series.length - 1)
  const pointRefs = useRef<Array<SVGGElement | null>>([])
  const titleId = useId()

  useEffect(() => {
    setActive(null)
    setFocusIndex(series.length - 1)
  }, [series])

  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = CHART_H - PAD.top - PAD.bottom
  const max = niceMax(Math.max(0, ...series.map((p) => Math.max(p.views, p.visitors))))
  const n = series.length
  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH
  const baseline = PAD.top + innerH

  const line = (key: 'views' | 'visitors') => series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join('')
  const viewsLine = line('views')
  const area = n ? `${viewsLine}L${x(n - 1).toFixed(1)},${baseline}L${x(0).toFixed(1)},${baseline}Z` : ''
  const ticks = [0, max / 2, max]
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 64))))

  const describe = (p: SeriesPoint) =>
    `${formatBucket(p.key)}: ${formatCount(p.views)} view${p.views === 1 ? '' : 's'}, ${formatCount(p.visitors)} visitor${p.visitors === 1 ? '' : 's'}`

  const onPointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (!n || innerW <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const rel = (e.clientX - rect.left) / Math.max(1, rect.width)
    setActive(Math.min(n - 1, Math.max(0, Math.round(rel * (n - 1)))))
  }

  const onPointKeyDown = (e: React.KeyboardEvent, i: number) => {
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(n - 1, i + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, i - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    if (next < 0) return
    e.preventDefault()
    setFocusIndex(next)
    setActive(next)
    pointRefs.current[next]?.focus()
  }

  const shown = active !== null ? series[active] : null
  const tooltipLeft = active !== null ? Math.min(Math.max(x(active), 80), Math.max(80, width - 80)) : 0

  return (
    <Box as="figure" m={0} aria-labelledby={titleId}>
      <Text as="figcaption" id={titleId} srOnly>
        Views and visitors per {bucket}. Use the arrow keys on a point to move between {bucket}s.
      </Text>
      <Box
        ref={wrapRef}
        position="relative"
        h={`${CHART_H}px`}
        sx={{
          '@media (forced-colors: active)': {
            '.chart-area': { fill: 'none' },
            '.chart-views, .chart-crosshair': { stroke: 'CanvasText' },
            '.chart-visitors': { stroke: 'GrayText' },
            '.chart-dot': { fill: 'CanvasText', stroke: 'Canvas' },
          },
        }}
      >
        {width > 0 ? (
          <svg width={width} height={CHART_H} role="group" aria-label={`Views and visitors per ${bucket}`}>
            {ticks.map((t) => (
              <g key={t} aria-hidden>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--chakra-colors-page-border)"
                  strokeDasharray={t === 0 ? undefined : '2 4'}
                />
                <text
                  x={PAD.left - 8}
                  y={y(t)}
                  dy="0.32em"
                  textAnchor="end"
                  fontSize="10"
                  fontFamily={MONO}
                  fill="var(--chakra-colors-page-fg-secondary)"
                  className="tnum"
                >
                  {formatCompact(t)}
                </text>
              </g>
            ))}
            {series.map((p, i) =>
              i % labelEvery === 0 || i === n - 1 ? (
                <text
                  key={p.key}
                  aria-hidden
                  x={x(i)}
                  y={CHART_H - 8}
                  textAnchor={i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'}
                  fontSize="10"
                  fontFamily={MONO}
                  fill="var(--chakra-colors-page-fg-secondary)"
                >
                  {formatBucket(p.key)}
                </text>
              ) : null,
            )}
            <path className="chart-area" d={area} fill="var(--accent-soft)" aria-hidden />
            <path
              className="chart-visitors"
              d={line('visitors')}
              fill="none"
              stroke="var(--chakra-colors-page-fg-secondary)"
              strokeWidth={1.25}
              strokeDasharray="4 3"
              aria-hidden
            />
            <path className="chart-views" d={viewsLine} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" aria-hidden />
            {active !== null ? (
              <line
                className="chart-crosshair"
                x1={x(active)}
                x2={x(active)}
                y1={PAD.top}
                y2={baseline}
                stroke="var(--chakra-colors-page-border-strong)"
                aria-hidden
              />
            ) : null}
            <rect
              x={PAD.left}
              y={PAD.top}
              width={innerW}
              height={innerH}
              fill="transparent"
              onPointerMove={onPointerMove}
              onPointerLeave={() => setActive(null)}
              aria-hidden
            />
            {series.map((p, i) => (
              <g
                key={p.key}
                ref={(el) => {
                  pointRefs.current[i] = el
                }}
                tabIndex={i === focusIndex ? 0 : -1}
                role="img"
                aria-label={describe(p)}
                onFocus={() => {
                  setFocusIndex(i)
                  setActive(i)
                }}
                onBlur={() => setActive(null)}
                onKeyDown={(e) => onPointKeyDown(e, i)}
                style={{ outline: 'none' }}
              >
                <circle cx={x(i)} cy={y(p.views)} r={10} fill="transparent" />
                <circle
                  className="chart-dot"
                  cx={x(i)}
                  cy={y(p.views)}
                  r={active === i ? 4 : n <= 31 ? 2.5 : 0}
                  fill="var(--accent)"
                  stroke="var(--chakra-colors-page-bg)"
                  strokeWidth={1.5}
                />
                {active === i ? (
                  <circle className="chart-crosshair" cx={x(i)} cy={y(p.views)} r={7} fill="none" stroke="var(--accent)" strokeWidth={2} />
                ) : null}
              </g>
            ))}
          </svg>
        ) : null}
        {shown ? (
          <Box
            aria-hidden
            position="absolute"
            top={0}
            left={`${tooltipLeft}px`}
            transform="translateX(-50%)"
            pointerEvents="none"
            px={2.5}
            py={1.5}
            borderRadius="md"
            border="1px solid"
            borderColor="page.border"
            bg="page.bg-elevated"
            boxShadow="sm"
            whiteSpace="nowrap"
            className="tnum"
          >
            <Text fontFamily={MONO} fontSize="10px" color="page.fg-secondary">
              {formatBucket(shown.key)}
            </Text>
            <Text fontSize="xs" fontWeight={600}>
              {formatCount(shown.views)} views · {formatCount(shown.visitors)} visitors
            </Text>
          </Box>
        ) : null}
      </Box>
      <HStack spacing={4} mt={2} fontSize="xs" color="page.fg-secondary" aria-hidden>
        <HStack spacing={1.5}>
          <Box w="14px" h="2px" bg="var(--accent)" />
          <Text>Views</Text>
        </HStack>
        <HStack spacing={1.5}>
          <Box w="14px" h="0" borderTop="1.5px dashed" borderColor="page.fg-secondary" />
          <Text>Visitors</Text>
        </HStack>
      </HStack>
    </Box>
  )
}

// ── Tables ────────────────────────────────────────────────────────────────

function HairlineTable({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <TableContainer border="1px solid" borderColor="page.border" borderRadius="md">
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

function RankCard({
  title,
  keyLabel,
  rows,
  showViews,
  renderKey,
  empty,
}: {
  title: string
  keyLabel: string
  rows: CountRow[]
  showViews?: boolean
  renderKey?: (key: string) => React.ReactNode
  empty: string
}) {
  const total = rows.reduce((n, r) => n + r.visitors, 0)
  return (
    <Panel minW={0}>
      <Text as="h3" fontSize="sm" fontWeight={600} mb={3}>
        {title}
      </Text>
      {rows.length ? (
        <HairlineTable caption={title}>
          <Thead>
            <Tr>
              <Th>{keyLabel}</Th>
              <Th isNumeric>Visitors</Th>
              {showViews ? <Th isNumeric>Views</Th> : <Th isNumeric>Share</Th>}
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((r) => (
              <Tr key={r.key}>
                <Td fontSize="xs" maxW={{ base: '160px', md: '260px' }} overflow="hidden" textOverflow="ellipsis" title={r.key}>
                  {renderKey ? renderKey(r.key) : r.key}
                </Td>
                <Td isNumeric fontSize="xs">
                  {formatCount(r.visitors)}
                </Td>
                <Td isNumeric fontSize="xs" color={showViews ? undefined : 'page.fg-secondary'}>
                  {showViews ? formatCount(r.views || 0) : total ? `${Math.round((r.visitors / total) * 100)}%` : '—'}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </HairlineTable>
      ) : (
        <Text fontSize="sm" color="page.fg-secondary">
          {empty}
        </Text>
      )}
    </Panel>
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

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

// ── Panel ─────────────────────────────────────────────────────────────────

export default function AnalyticsPanel() {
  const [range, setRange] = useState<AnalyticsRange>('30d')
  const [vitalsWindow, setVitalsWindow] = useState<'7d' | '28d'>('28d')
  const [report, setReport] = useState<AnalyticsReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  const load = useCallback(async (which: AnalyticsRange) => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch(`/api/admin/analytics?range=${which}`, { cache: 'no-store', signal: controller.signal })
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
    void load(range)
  }, [load, range])

  useEffect(() => () => requestRef.current?.abort(), [])

  const period = PERIOD_LABEL[range]
  const hasViews = !!report && report.kpis.views.value > 0
  const vitals = report ? report.vitals[vitalsWindow] : []

  return (
    <Box>
      <Flex justify="space-between" align={{ base: 'stretch', md: 'flex-end' }} mb={5} flexWrap="wrap" gap={4}>
        <Box maxW="62ch">
          <Eyebrow accent color="accent.text">
            [analytics]
          </Eyebrow>
          <Text as="h2" fontSize="lg" fontWeight={600} letterSpacing="-0.02em" mt={1}>
            Analytics
          </Text>
          <Text fontSize="sm" color="page.fg-secondary" mt={1}>
            First-party and cookieless. IP addresses and user agents are never stored; visitors are counted
            with a hash that changes every day. Do Not Track, Global Privacy Control, bots and your own
            visits are not recorded.
          </Text>
        </Box>
        <HStack spacing={2} flexWrap="wrap">
          <ToggleGroup
            label="Period"
            options={ANALYTICS_RANGES.map((r) => ({ key: r, label: RANGE_LABEL[r] }))}
            value={range}
            onChange={setRange}
          />
          <Button
            size="sm"
            leftIcon={<Icon as={FaSync} aria-hidden />}
            onClick={() => void load(range)}
            isLoading={loading}
            loadingText="Loading"
            variant="ghost"
            color="page.fg-secondary"
          >
            Refresh
          </Button>
        </HStack>
      </Flex>

      {err ? (
        <Alert status="error" variant="left-accent" borderRadius="md" mb={4} bg="page.bg-elevated" role="alert">
          <AlertIcon />
          <AlertDescription fontSize="sm">{err}</AlertDescription>
        </Alert>
      ) : null}

      {!report && loading ? (
        <Box aria-busy="true" aria-label="Loading analytics">
          <Skeleton h="96px" borderRadius="xl" mb={4} />
          <Skeleton h="280px" borderRadius="xl" />
        </Box>
      ) : null}

      {report ? (
        <Box aria-busy={loading} opacity={loading ? 0.7 : 1}>
          <Panel mb={4}>
            <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={{ base: 3, md: 6 }} mb={5}>
              <KpiCell label="Views" value={formatCount(report.kpis.views.value)} kpi={report.kpis.views} period={period} />
              <KpiCell label="Visitors" value={formatCount(report.kpis.visitors.value)} kpi={report.kpis.visitors} period={period} />
              <Box minW={0} py={1}>
                <Eyebrow>Live</Eyebrow>
                <Text className="tnum" fontSize={{ base: '2xl', md: '3xl' }} fontWeight={600} letterSpacing="-0.03em" lineHeight={1.15} mt={1}>
                  {formatCount(report.live)}
                </Text>
                <Text fontSize="xs" color="page.fg-secondary" mt={0.5}>
                  visitor{report.live === 1 ? '' : 's'} in the last 5 minutes
                </Text>
              </Box>
            </SimpleGrid>
            {hasViews ? (
              <AreaChart series={report.series} bucket={report.bucket} />
            ) : (
              <Text fontSize="sm" color="page.fg-secondary" py={6} textAlign="center">
                No page views recorded in the last {RANGE_LABEL[range]} yet.
              </Text>
            )}
          </Panel>

          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4} mb={4}>
            <RankCard title="Top pages" keyLabel="Page" rows={report.topPages} showViews empty="No page views in this period." />
            <RankCard
              title="Referrers"
              keyLabel="Site"
              rows={report.referrers}
              empty="No visits from other sites in this period."
            />
            <RankCard
              title="Countries"
              keyLabel="Country"
              rows={report.countries}
              renderKey={(code) => `${countryName(code)} (${code})`}
              empty="No country information in this period."
            />
            <RankCard
              title="Devices"
              keyLabel="Device"
              rows={report.devices}
              renderKey={capitalize}
              empty="No visits in this period."
            />
            <RankCard title="Browsers" keyLabel="Browser" rows={report.browsers} empty="No visits in this period." />
          </SimpleGrid>

          <Panel>
            <Flex align={{ base: 'flex-start', sm: 'center' }} justify="space-between" gap={3} flexWrap="wrap" mb={3}>
              <Box>
                <Text as="h3" fontSize="sm" fontWeight={600}>
                  Web Vitals (real users)
                </Text>
                <Text fontSize="xs" color="page.fg-secondary" mt={0.5} maxW="60ch">
                  75th percentile of what visitors experienced, rated with the web.dev thresholds (LCP 2.5 s / 4 s,
                  INP 200 ms / 500 ms, CLS 0.1 / 0.25).
                </Text>
              </Box>
              <ToggleGroup
                label="Web Vitals window"
                options={[
                  { key: '7d' as const, label: '7 days' },
                  { key: '28d' as const, label: '28 days' },
                ]}
                value={vitalsWindow}
                onChange={setVitalsWindow}
              />
            </Flex>
            {vitals.length ? (
              <VitalsTable entries={vitals} />
            ) : (
              <Text fontSize="sm" color="page.fg-secondary">
                No Web Vitals measured in the last {vitalsWindow === '7d' ? '7' : '28'} days yet.
              </Text>
            )}
          </Panel>
        </Box>
      ) : null}
    </Box>
  )
}
