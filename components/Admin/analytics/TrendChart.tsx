import React, { useEffect, useId, useRef, useState } from 'react'
import { Box, HStack, Text } from '@chakra-ui/react'
import { MONO } from '../shell/ui'
import { formatCompact, formatCount } from '../../../lib/analytics/format'
import { bucketKey, type Bucket } from '../../../lib/analytics/exploreShared'
import { bucketLabel, bucketTick, chartScale } from '../../../lib/analytics/exploreFormat'
import type { SeriesPoint } from '../../../lib/analytics/shared'
import type { Annotation } from '../../../lib/analytics/explore'

/**
 * The Analytics trend: one metric (visitors or views) per day / week /
 * month as an area with a line, the previous period as a thin muted line
 * when comparing (aligned bucket by bucket), and a mark under the days a
 * post or case study was published. A crosshair follows the pointer;
 * every point is reachable from the keyboard (one tab stop, arrow keys,
 * Home / End) and names its numbers. Solid hairline grid, one axis.
 */

export type ChartMetric = 'visitors' | 'views'

const CHART_H = 232
const PAD = { top: 14, right: 12, bottom: 30, left: 40 }
const METRIC_WORD: Record<ChartMetric, [string, string]> = { visitors: ['visitor', 'visitors'], views: ['view', 'views'] }

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

const count = (n: number, metric: ChartMetric) => `${formatCount(n)} ${METRIC_WORD[metric][n === 1 ? 0 : 1]}`

export default function TrendChart({
  series,
  previous,
  bucket,
  metric,
  annotations,
}: {
  series: SeriesPoint[]
  /** The previous period, bucket by bucket (null = not comparing). */
  previous: SeriesPoint[] | null
  bucket: Bucket
  metric: ChartMetric
  annotations: Annotation[]
}) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const [focusIndex, setFocusIndex] = useState(series.length - 1)
  const pointRefs = useRef<Array<SVGGElement | null>>([])
  const titleId = useId()

  useEffect(() => {
    setActive(null)
    setFocusIndex(series.length - 1)
  }, [series])

  const marks = new Map<string, Annotation[]>()
  for (const a of annotations) {
    const key = bucketKey(a.day, bucket)
    marks.set(key, [...(marks.get(key) || []), a])
  }

  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = CHART_H - PAD.top - PAD.bottom
  const values = series.map((p) => p[metric])
  const prevValues = previous ? previous.map((p) => p[metric]) : []
  const scale = chartScale(Math.max(0, ...values, ...prevValues))
  const max = scale.max
  const n = series.length
  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH
  const baseline = PAD.top + innerH

  const path = (list: number[]) => list.slice(0, n).map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const line = path(values)
  const area = n ? `${line}L${x(n - 1).toFixed(1)},${baseline}L${x(0).toFixed(1)},${baseline}Z` : ''
  const prevLine = previous ? path(prevValues) : ''
  const ticks = scale.ticks
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 68))))
  // Every labelEvery-th bucket and the last one — never one so close to the last that the two collide.
  const labelled = (i: number) => i === n - 1 || (i % labelEvery === 0 && n - 1 - i >= Math.max(1, labelEvery * 0.75))

  const describe = (i: number) => {
    const p = series[i]
    const q = previous?.[i]
    const parts = [`${bucketLabel(p.key, bucket)}: ${count(p[metric], metric)}`]
    if (q) parts.push(`previous period, ${bucketLabel(q.key, bucket)}: ${count(q[metric], metric)}`)
    const published = marks.get(p.key)
    if (published?.length) parts.push(`published: ${published.map((a) => a.title).join('; ')}`)
    return parts.join('; ')
  }

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
  const shownPrev = active !== null ? previous?.[active] : undefined
  const shownMarks = shown ? marks.get(shown.key) : undefined
  const tooltipLeft = active !== null ? Math.min(Math.max(x(active), 96), Math.max(96, width - 96)) : 0
  const unit = bucket === 'day' ? 'day' : bucket === 'week' ? 'week' : 'month'

  return (
    <Box as="figure" m={0} aria-labelledby={titleId}>
      <Text as="figcaption" id={titleId} srOnly>
        {METRIC_WORD[metric][1][0].toUpperCase() + METRIC_WORD[metric][1].slice(1)} per {unit}
        {previous ? ', with the previous period' : ''}. Use the arrow keys on a point to move between {unit}s.
        {annotations.length ? ` Published in this period: ${annotations.map((a) => a.title).join('; ')}.` : ''}
      </Text>
      <Box
        ref={wrapRef}
        position="relative"
        h={`${CHART_H}px`}
        sx={{
          '@media (forced-colors: active)': {
            '.chart-area': { fill: 'none' },
            '.chart-line, .chart-crosshair, .chart-mark': { stroke: 'CanvasText' },
            '.chart-prev': { stroke: 'GrayText' },
            '.chart-dot': { fill: 'CanvasText', stroke: 'Canvas' },
          },
        }}
      >
        {width > 0 ? (
          <svg width={width} height={CHART_H} role="group" aria-label={`${METRIC_WORD[metric][1]} per ${unit}`}>
            {ticks.map((t) => (
              <g key={t} aria-hidden>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--chakra-colors-page-border)" />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fontFamily={MONO} fill="var(--chakra-colors-page-fg-secondary)" className="tnum">
                  {formatCompact(t)}
                </text>
              </g>
            ))}
            {series.map((p, i) =>
              labelled(i) ? (
                <text
                  key={p.key}
                  aria-hidden
                  x={x(i)}
                  y={CHART_H - 6}
                  textAnchor={i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'}
                  fontSize="10"
                  fontFamily={MONO}
                  fill="var(--chakra-colors-page-fg-secondary)"
                >
                  {bucketTick(p.key, bucket)}
                </text>
              ) : null,
            )}
            <path className="chart-area" d={area} fill="var(--accent-soft)" aria-hidden />
            {prevLine ? (
              <path className="chart-prev" d={prevLine} fill="none" stroke="var(--chakra-colors-page-fg-secondary)" strokeWidth={1.5} strokeLinejoin="round" aria-hidden />
            ) : null}
            <path className="chart-line" d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" aria-hidden />
            {series.map((p, i) =>
              marks.has(p.key) ? (
                <g key={`m-${p.key}`} aria-hidden>
                  <line className="chart-mark" x1={x(i)} x2={x(i)} y1={baseline - 6} y2={baseline} stroke="var(--accent)" strokeWidth={2} />
                  <circle className="chart-mark" cx={x(i)} cy={baseline + 7} r={3.5} fill="var(--chakra-colors-page-bg)" stroke="var(--accent)" strokeWidth={2} />
                </g>
              ) : null,
            )}
            {active !== null ? (
              <line className="chart-crosshair" x1={x(active)} x2={x(active)} y1={PAD.top} y2={baseline} stroke="var(--chakra-colors-page-border-strong)" aria-hidden />
            ) : null}
            <rect
              x={PAD.left}
              y={PAD.top}
              width={innerW}
              height={innerH + 14}
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
                aria-label={describe(i)}
                onFocus={() => {
                  setFocusIndex(i)
                  setActive(i)
                }}
                onBlur={() => setActive(null)}
                onKeyDown={(e) => onPointKeyDown(e, i)}
                style={{ outline: 'none' }}
              >
                <circle cx={x(i)} cy={y(p[metric])} r={12} fill="transparent" />
                {active === i && previous?.[i] ? (
                  <circle className="chart-dot" cx={x(i)} cy={y(previous[i][metric])} r={3} fill="var(--chakra-colors-page-fg-secondary)" stroke="var(--chakra-colors-page-bg)" strokeWidth={1.5} />
                ) : null}
                <circle
                  className="chart-dot"
                  cx={x(i)}
                  cy={y(p[metric])}
                  r={active === i ? 4 : n <= 31 ? 2.5 : 0}
                  fill="var(--accent)"
                  stroke="var(--chakra-colors-page-bg)"
                  strokeWidth={1.5}
                />
                {active === i ? <circle className="chart-crosshair" cx={x(i)} cy={y(p[metric])} r={7} fill="none" stroke="var(--accent)" strokeWidth={2} /> : null}
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
            maxW="240px"
            className="tnum"
            zIndex={1}
          >
            <Text fontFamily={MONO} fontSize="10px" color="page.fg-secondary" whiteSpace="nowrap">
              {bucketLabel(shown.key, bucket)}
            </Text>
            <HStack spacing={1.5} align="baseline">
              <Box w="10px" h="2px" bg="var(--accent)" flexShrink={0} alignSelf="center" />
              <Text fontSize="sm" fontWeight={600} whiteSpace="nowrap">
                {formatCount(shown[metric])}
              </Text>
              <Text fontSize="xs" color="page.fg-secondary" whiteSpace="nowrap">
                {METRIC_WORD[metric][shown[metric] === 1 ? 0 : 1]}
              </Text>
            </HStack>
            {shownPrev ? (
              <HStack spacing={1.5} align="baseline">
                <Box w="10px" h="1.5px" bg="page.fg-secondary" flexShrink={0} alignSelf="center" />
                <Text fontSize="sm" fontWeight={600} whiteSpace="nowrap">
                  {formatCount(shownPrev[metric])}
                </Text>
                <Text fontSize="xs" color="page.fg-secondary" whiteSpace="nowrap">
                  {bucketLabel(shownPrev.key, bucket)}
                </Text>
              </HStack>
            ) : null}
            {shownMarks?.map((a) => (
              <Text key={a.path} fontSize="xs" mt={1} noOfLines={2}>
                <Box as="span" color="accent.text" fontWeight={600}>
                  Published
                </Box>{' '}
                {a.title}
              </Text>
            ))}
          </Box>
        ) : null}
      </Box>
      <HStack spacing={4} mt={2} fontSize="xs" color="page.fg-secondary" aria-hidden flexWrap="wrap" rowGap={1}>
        <HStack spacing={1.5}>
          <Box w="14px" h="2px" bg="var(--accent)" />
          <Text>{previous ? 'This period' : METRIC_WORD[metric][1][0].toUpperCase() + METRIC_WORD[metric][1].slice(1)}</Text>
        </HStack>
        {previous ? (
          <HStack spacing={1.5}>
            <Box w="14px" h="1.5px" bg="page.fg-secondary" />
            <Text>Previous period</Text>
          </HStack>
        ) : null}
        {annotations.length ? (
          <HStack spacing={1.5}>
            <Box w="8px" h="8px" borderRadius="full" border="2px solid" borderColor="var(--accent)" />
            <Text>Published</Text>
          </HStack>
        ) : null}
      </HStack>
    </Box>
  )
}
