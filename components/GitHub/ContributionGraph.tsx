import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Box, Flex, Skeleton, Text } from '@chakra-ui/react'
import { keyframes } from '@emotion/react'
import { useInView, useReducedMotion } from 'framer-motion'

import { useFetchJson } from '../Common/useFetchJson'
import WidgetNotice from '../Common/WidgetNotice'
import {
  calendarFacts,
  calendarLayout,
  calendarMove,
  formatDay,
  monthLabels,
  CALENDAR_ROWS as ROWS,
  type ContributionLevel,
  type ContributionWeek,
  type GhContributions,
} from '../Common/githubEvents'

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'
const CELL = 10
const GAP = 3
const STEP = CELL + GAP
const LABEL_H = 16
const GRID_H = LABEL_H + ROWS * STEP - GAP
const LEVELS: ContributionLevel[] = [0, 1, 2, 3, 4]
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const fadeIn = keyframes`from { opacity: 0; } to { opacity: 1; }`

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * Five steps: the page hairline for no contributions, then brand indigo at
 * increasing opacity — readable on both themes. In forced-colors mode the
 * levels switch to system colours that differ by fill AND outline, never by
 * opacity alone.
 */
const levelSx = {
  '& rect[data-level="0"]': { fill: 'var(--chakra-colors-page-border)' },
  '& rect[data-level="1"]': { fill: 'rgba(99, 102, 241, 0.25)' },
  '& rect[data-level="2"]': { fill: 'rgba(99, 102, 241, 0.45)' },
  '& rect[data-level="3"]': { fill: 'rgba(99, 102, 241, 0.7)' },
  '& rect[data-level="4"]': { fill: 'rgb(99, 102, 241)' },
  '@media (forced-colors: active)': {
    '& svg': { forcedColorAdjust: 'none' },
    '& rect[data-level="0"]': { fill: 'Canvas', stroke: 'GrayText', strokeWidth: 0.5 },
    '& rect[data-level="1"]': { fill: 'Canvas', stroke: 'Highlight', strokeWidth: 1.5 },
    '& rect[data-level="2"]': { fill: 'GrayText', stroke: 'none' },
    '& rect[data-level="3"]': { fill: 'Highlight', stroke: 'none' },
    '& rect[data-level="4"]': { fill: 'CanvasText', stroke: 'none' },
  },
}

const contributionsText = (count: number) => `${count === 0 ? 'No' : count.toLocaleString('en-US')} contribution${count === 1 ? '' : 's'}`

type Tip = { key: string; text: string; x: number; y: number }

function Calendar({ total, weeks }: { total: number; weeks: ContributionWeek[] }) {
  const reduce = useReducedMotion()
  const summaryId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const inView = useInView(svgRef, { once: true, amount: 0.3 })

  const { cells, byKey } = useMemo(() => calendarLayout(weeks), [weeks])
  const labels = useMemo(() => monthLabels(weeks), [weeks])
  const facts = useMemo(() => calendarFacts(weeks), [weeks])
  const width = weeks.length * STEP - GAP
  const lastKey = cells[cells.length - 1]?.key ?? ''

  const [active, setActive] = useState(lastKey)
  const [tip, setTip] = useState<Tip | null>(null)
  const [focused, setFocused] = useState<string | null>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  // 'static': shown as rendered; 'pending': hidden until scrolled into view; 'in': columns fade in.
  const [phase, setPhase] = useState<'static' | 'pending' | 'in'>('static')

  const activeKey = byKey.has(active) ? active : lastKey

  const updateEdges = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const left = el.scrollLeft > 1
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }))
  }, [])

  // Start at the newest weeks on narrow screens.
  useIsoLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
    updateEdges()
  }, [updateEdges, weeks])

  useEffect(() => {
    window.addEventListener('resize', updateEdges)
    return () => window.removeEventListener('resize', updateEdges)
  }, [updateEdges])

  // Fade the columns in only when the graph was below the fold at hydration.
  useEffect(() => {
    if (reduce) setPhase('static')
    else if (inView) setPhase((p) => (p === 'pending' ? 'in' : p))
    else setPhase((p) => (p === 'static' ? 'pending' : p))
  }, [reduce, inView])

  const placeTip = useCallback(
    (key: string) => {
      const wrap = wrapRef.current
      const cell = byKey.get(key)
      const el = svgRef.current?.querySelector<SVGRectElement>(`rect[data-cell="${key}"]`)
      if (!wrap || !cell || !el) return
      const w = wrap.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      setTip({
        key,
        text: `${contributionsText(cell.day.count)} · ${formatDay(cell.day.date)}`,
        x: r.left - w.left + r.width / 2,
        y: r.top - w.top,
      })
    },
    [byKey],
  )

  // Keep the tooltip inside the wrapper (no page overflow at the edges).
  useIsoLayoutEffect(() => {
    const wrap = wrapRef.current
    const el = tipRef.current
    if (!tip || !wrap || !el) return
    const half = el.offsetWidth / 2
    const x = Math.min(Math.max(tip.x, half), Math.max(half, wrap.clientWidth - half))
    el.style.left = `${x}px`
  }, [tip])

  const cellKeyOf = (target: EventTarget | null) =>
    target instanceof Element ? target.closest('rect[data-cell]')?.getAttribute('data-cell') ?? null : null

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const from = byKey.get(activeKey)
    if (!from) return
    const next = calendarMove(from, e.key, e.ctrlKey || e.metaKey, byKey, weeks.length, cells)
    if (next === null) return
    e.preventDefault()
    setActive(next)
    svgRef.current?.querySelector<SVGRectElement>(`rect[data-cell="${next}"]`)?.focus()
  }

  const onScroll = () => {
    updateEdges()
    if (focused) placeTip(focused)
    else setTip(null)
  }

  const fade = (on: boolean) => (on ? '24px' : '0px')
  const first = weeks[0]?.days[0]?.date
  const lastDay = cells[cells.length - 1]?.day.date

  return (
    <Box ref={wrapRef} position="relative" sx={levelSx}>
      <Text className="tnum" fontSize="sm" color="page.fg" mb={3}>
        {total.toLocaleString('en-US')} contributions in the last year
      </Text>
      <p id={summaryId} className="sr-only">
        {first && lastDay ? `${contributionsText(total)} between ${formatDay(first, true)} and ${formatDay(lastDay, true)}. ` : ''}
        {`Active on ${facts.activeDays} of ${facts.days} days.`}
        {facts.best ? ` Busiest day: ${formatDay(facts.best.date, true)}, with ${contributionsText(facts.best.count).toLowerCase()}.` : ''}
        {' Use the arrow keys to move between days.'}
      </p>
      {/* Fits the graph, so the legend lines up with its right edge on wide screens. */}
      <Box w="fit-content" maxW="100%">
        <Box
          ref={scrollRef}
          onScroll={onScroll}
          overflowX="auto"
          overflowY="hidden"
          pb={1}
          sx={{
            scrollbarWidth: 'thin',
            WebkitMaskImage: `linear-gradient(to right, transparent, #000 ${fade(edges.left)}, #000 calc(100% - ${fade(edges.right)}), transparent)`,
            maskImage: `linear-gradient(to right, transparent, #000 ${fade(edges.left)}, #000 calc(100% - ${fade(edges.right)}), transparent)`,
          }}
        >
          <svg
            ref={svgRef}
            role="grid"
            aria-label="Contribution calendar"
            aria-describedby={summaryId}
            width={width}
            height={GRID_H}
            viewBox={`0 0 ${width} ${GRID_H}`}
            data-phase={phase}
            onKeyDown={onKeyDown}
            onPointerOver={(e) => {
              const key = cellKeyOf(e.target)
              if (key) placeTip(key)
            }}
            onPointerLeave={() => (focused ? placeTip(focused) : setTip(null))}
            style={{ display: 'block', overflow: 'visible' }}
          >
            <Box
              as="g"
              aria-hidden
              fontFamily={monoFont}
              fontSize="10px"
              sx={{ fill: 'var(--chakra-colors-page-fg-secondary)' }}
            >
              {labels.map((l) => (
                <text key={`${l.col}-${l.label}`} x={l.col * STEP} y={10}>
                  {l.label}
                </text>
              ))}
            </Box>
            <Box
              as="g"
              sx={{
                '& rect': { outline: 'none' },
                '& rect:focus-visible': { stroke: 'var(--chakra-colors-page-fg)', strokeWidth: 1.5 },
                '[data-phase="pending"] & rect': { opacity: 0 },
                '[data-phase="in"] & rect': {
                  animation: `${fadeIn} 300ms var(--ease-out-quart) both`,
                  animationDelay: 'calc(var(--c) * 4ms)',
                },
                '@media (prefers-reduced-motion: reduce)': {
                  '[data-phase] & rect': { animation: 'none', opacity: 1 },
                },
              }}
            >
              {Array.from({ length: ROWS }, (_, row) => (
                <g role="row" key={row}>
                  {cells
                    .filter((c) => c.row === row)
                    .map((c) => (
                      <rect
                        key={c.key}
                        role="gridcell"
                        data-cell={c.key}
                        data-level={c.day.level}
                        tabIndex={c.key === activeKey ? 0 : -1}
                        aria-label={`${contributionsText(c.day.count)} on ${WEEKDAYS[c.row]}, ${formatDay(c.day.date, true)}`}
                        x={c.col * STEP}
                        y={LABEL_H + c.row * STEP}
                        width={CELL}
                        height={CELL}
                        rx={2}
                        style={{ ['--c' as string]: c.col }}
                        onFocus={() => {
                          setActive(c.key)
                          setFocused(c.key)
                          placeTip(c.key)
                        }}
                        onBlur={() => {
                          setFocused(null)
                          setTip(null)
                        }}
                      />
                    ))}
                </g>
              ))}
            </Box>
          </svg>
        </Box>
        <Flex align="center" justify="flex-end" gap={1.5} mt={2} fontFamily={monoFont} fontSize="11px" color="page.fg-secondary" aria-hidden>
          <span>Less</span>
          <svg width={LEVELS.length * STEP - GAP} height={CELL} style={{ display: 'block' }}>
            {LEVELS.map((level) => (
              <rect key={level} data-level={level} x={level * STEP} y={0} width={CELL} height={CELL} rx={2} />
            ))}
          </svg>
          <span>More</span>
        </Flex>
      </Box>
      {tip ? (
        <span
          ref={tipRef}
          aria-hidden
          className="hint tnum"
          style={{ left: tip.x, top: tip.y, opacity: 1, transform: 'translate(-50%, calc(-100% - 6px))', transitionDelay: '0ms' }}
        >
          {tip.text}
        </span>
      ) : null}
    </Box>
  )
}

const SKELETON_H = `${GRID_H + 52}px`

/**
 * GitHub contribution calendar for the last year as an inline SVG in brand
 * indigo (no third-party image). Keyboard: one tab stop, arrow keys move by
 * day / week, Home / End to the row's ends (Ctrl/⌘ for the whole year).
 * Server-rendered when `initialData` is passed.
 *
 * When the calendar is unavailable it renders nothing (`whenUnavailable:
 * 'hide'`, the home page) or an in-place notice with a retry ('notice', /about).
 */
export default function ContributionGraph({
  initialData,
  whenUnavailable = 'hide',
}: {
  initialData?: GhContributions | null
  whenUnavailable?: 'hide' | 'notice'
}) {
  const { data, error, retry } = useFetchJson<GhContributions>('/api/github/contributions', { initialData })

  if (error || (data && (!data.available || !data.weeks?.length))) {
    if (whenUnavailable === 'hide') return null
    return (
      <WidgetNotice kind="error" onRetry={retry} minH={SKELETON_H}>
        The contribution calendar couldn’t be loaded from GitHub.
      </WidgetNotice>
    )
  }

  if (!data) {
    return (
      <Box aria-busy="true" aria-label="Loading contribution calendar" h={SKELETON_H}>
        <Skeleton h="14px" w="260px" maxW="70%" mb={3} borderRadius="sm" startColor="page.bg-elevated" endColor="page.bg-overlay" />
        <Skeleton h={`${GRID_H}px`} w="100%" borderRadius="md" startColor="page.bg-elevated" endColor="page.bg-overlay" />
      </Box>
    )
  }

  return <Calendar total={data.total ?? 0} weeks={data.weeks as ContributionWeek[]} />
}
