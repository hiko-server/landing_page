import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Box, Flex, Skeleton, Text } from '@chakra-ui/react'
import { useInView, useReducedMotion } from 'framer-motion'

import { useFetchJson } from '../Common/useFetchJson'
import {
  CALENDAR_CELL as CELL,
  CALENDAR_GAP as GAP,
  CALENDAR_LABEL_H as LABEL_H,
  CALENDAR_ROWS as ROWS,
  CALENDAR_STEP as STEP,
  calendarFacts,
  calendarHighlights,
  calendarLayout,
  calendarPaths,
  compactCalendar,
  expandCalendar,
  formatDay,
  formatMonth,
  monthLabels,
  type CalendarInput,
  type CompactCalendar,
  type ContributionLevel,
} from '../Common/githubEvents'
import { fillUi } from '../../lib/uiStrings'
import type { HomeStrings } from '../../lib/uiStrings/home'
import { useHomeUi } from '../LandingPage/homeUi'

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'
const GRID_H = LABEL_H + ROWS * STEP - GAP
const LEVELS: ContributionLevel[] = [0, 1, 2, 3, 4]

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * Five steps: the page hairline tint for no contributions, then brand indigo
 * at increasing strength — readable on both themes. Each level is one path
 * whose stroke repeats the fill with round joins (rounded cell corners, see
 * calendarPaths). The colours are opaque and the strength is the element's
 * `opacity`, so where stroke and fill overlap nothing darkens into a ring.
 * In forced-colors mode the levels switch to system colours that differ by
 * fill AND outline, never by opacity alone.
 */
const INDIGO = 'rgb(99, 102, 241)'
const levelSx = {
  '& [data-level]': { strokeLinejoin: 'round', strokeWidth: 3, fill: INDIGO, stroke: INDIGO },
  '& [data-level="0"]': {
    fill: 'var(--chakra-colors-page-fg)',
    stroke: 'var(--chakra-colors-page-fg)',
    opacity: 0.08,
    _dark: { opacity: 0.1 },
  },
  '& [data-level="1"]': { opacity: 0.25 },
  '& [data-level="2"]': { opacity: 0.45 },
  '& [data-level="3"]': { opacity: 0.7 },
  '& [data-level="4"]': { opacity: 1 },
  '@media (forced-colors: active)': {
    '& svg': { forcedColorAdjust: 'none' },
    '& [data-level]': { opacity: 1 },
    '& [data-level="0"]': { fill: 'Canvas', stroke: 'GrayText', strokeWidth: 1, opacity: 1 },
    '& [data-level="1"]': { fill: 'Canvas', stroke: 'Highlight', strokeWidth: 2 },
    '& [data-level="2"]': { fill: 'GrayText', stroke: 'GrayText' },
    '& [data-level="3"]': { fill: 'Highlight', stroke: 'Highlight' },
    '& [data-level="4"]': { fill: 'CanvasText', stroke: 'CanvasText' },
  },
}

/** "1,622 contributions" / "1,622 次贡献" in the page's words (lib/uiStrings/home calendar). */
const contributionsText = (count: number, c: HomeStrings['calendar']) => (count === 0 ? c.none : fillUi(count === 1 ? c.one : c.many, { n: count.toLocaleString('en-US') }))

type Tip = { key: string; text: string; x: number; y: number }

function Calendar({ data }: { data: CompactCalendar }) {
  const { t } = useHomeUi()
  const c = t.calendar
  const w = t.github
  const reduce = useReducedMotion()
  const summaryId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const inView = useInView(svgRef, { once: true, amount: 0.3 })

  const weeks = useMemo(() => expandCalendar(data), [data])
  const { cells, byKey } = useMemo(() => calendarLayout(weeks), [weeks])
  const paths = useMemo(() => calendarPaths(weeks), [weeks])
  const labels = useMemo(() => monthLabels(weeks, 3, w), [weeks, w])
  const facts = useMemo(() => calendarFacts(weeks), [weeks])
  const more = useMemo(() => calendarHighlights(weeks), [weeks])
  const width = weeks.length * STEP - GAP

  const [tip, setTip] = useState<Tip | null>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  // 'static': shown as rendered; 'pending': hidden until scrolled into view; 'in': fades in.
  const [phase, setPhase] = useState<'static' | 'pending' | 'in'>('static')
  const scrollable = edges.left || edges.right

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

  // Fade in only when the graph was below the fold at hydration: decided
  // before the first paint from the real position, so a graph already on
  // screen stays exactly as server-rendered.
  const armed = useRef(false)
  useIsoLayoutEffect(() => {
    const el = svgRef.current
    if (!el || reduce || armed.current) return
    armed.current = true
    if (el.getBoundingClientRect().top > window.innerHeight) setPhase('pending')
  }, [reduce])
  useEffect(() => {
    if (reduce) setPhase('static')
    else if (inView) setPhase((p) => (p === 'pending' ? 'in' : p))
  }, [reduce, inView])

  // Esc dismisses the hover tooltip (WCAG 1.4.13).
  useEffect(() => {
    if (!tip) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTip(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tip])

  /** The day under the pointer, from its position in SVG units (no per-day elements to hit-test). */
  const showTipAt = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    const wrap = wrapRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !wrap || !ctm) return
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    const col = Math.floor(p.x / STEP)
    const row = Math.floor((p.y - LABEL_H) / STEP)
    const inCell = p.x - col * STEP <= CELL && p.y - LABEL_H - row * STEP <= CELL && p.y >= LABEL_H
    const cell = inCell ? byKey.get(`${col}:${row}`) : undefined
    if (!cell) {
      setTip(null)
      return
    }
    if (tip?.key === cell.key) return
    const topLeft = new DOMPoint(col * STEP + CELL / 2, LABEL_H + row * STEP).matrixTransform(ctm)
    const box = wrap.getBoundingClientRect()
    setTip({
      key: cell.key,
      text: `${contributionsText(cell.day.count, c)} · ${formatDay(cell.day.date, false, w)}`,
      x: topLeft.x - box.left,
      y: topLeft.y - box.top,
    })
  }

  // Keep the tooltip inside the wrapper (no page overflow at the edges).
  useIsoLayoutEffect(() => {
    const wrap = wrapRef.current
    const el = tipRef.current
    if (!tip || !wrap || !el) return
    const half = el.offsetWidth / 2
    const x = Math.min(Math.max(tip.x, half), Math.max(half, wrap.clientWidth - half))
    el.style.left = `${x}px`
  }, [tip])

  const fade = (on: boolean) => (on ? '24px' : '0px')
  const first = weeks[0]?.days[0]?.date
  const lastDay = cells[cells.length - 1]?.day.date
  const lower = (text: string) => text.toLowerCase()
  const summary = [
    first && lastDay ? fillUi(c.range, { count: contributionsText(data.total, c), from: formatDay(first, true, w), to: formatDay(lastDay, true, w) }) : '',
    fillUi(c.active, { active: facts.activeDays, days: facts.days }),
    facts.best ? fillUi(c.busiestDay, { day: formatDay(facts.best.date, true, w), count: lower(contributionsText(facts.best.count, c)) }) : '',
    more.bestMonth ? fillUi(c.busiestMonth, { month: formatMonth(more.bestMonth.month, w), count: lower(contributionsText(more.bestMonth.count, c)) }) : '',
    more.longestStreak > 1 ? fillUi(c.streak, { n: more.longestStreak }) : '',
  ]
    .filter(Boolean)
    // Chinese sentences follow each other without a space.
    .join(/[\u3400-\u9fff]/.test(c.active) ? '' : ' ')

  return (
    <Box ref={wrapRef} position="relative" sx={levelSx}>
      <Text className="tnum" fontSize="sm" color="page.fg" mb={3}>
        {fillUi(c.total, { n: data.total.toLocaleString('en-US') })}
      </Text>
      <p id={summaryId} className="sr-only">
        {summary}
      </p>
      {/* Phones: natural 10 px cells, scrolled horizontally (the scroller is
          focusable then, so the keyboard can scroll it). From md up the
          drawing scales to the column (the viewBox keeps the aspect ratio). */}
      <Box w={{ base: 'fit-content', md: '100%' }} maxW="100%">
        <Box
          ref={scrollRef}
          onScroll={() => {
            updateEdges()
            setTip(null)
          }}
          overflowX="auto"
          overflowY="hidden"
          pb={1}
          tabIndex={scrollable ? 0 : undefined}
          role={scrollable ? 'group' : undefined}
          aria-label={scrollable ? c.scroller : undefined}
          sx={{
            scrollbarWidth: 'thin',
            '&:focus-visible': { outline: '2px solid var(--accent)', outlineOffset: '2px', borderRadius: '4px' },
            '@media (min-width: 48em)': { '& .contrib-svg': { width: '100%', height: 'auto' } },
            WebkitMaskImage: `linear-gradient(to right, transparent, #000 ${fade(edges.left)}, #000 calc(100% - ${fade(edges.right)}), transparent)`,
            maskImage: `linear-gradient(to right, transparent, #000 ${fade(edges.left)}, #000 calc(100% - ${fade(edges.right)}), transparent)`,
          }}
        >
          <svg
            ref={svgRef}
            role="img"
            aria-label={c.label}
            aria-describedby={summaryId}
            width={width}
            height={GRID_H}
            viewBox={`0 0 ${width} ${GRID_H}`}
            preserveAspectRatio="xMinYMin meet"
            className="contrib-svg"
            data-phase={phase}
            onPointerMove={(e) => showTipAt(e.clientX, e.clientY)}
            onPointerDown={(e) => showTipAt(e.clientX, e.clientY)}
            onPointerLeave={() => setTip(null)}
            style={{ display: 'block', overflow: 'visible' }}
          >
            <Box as="g" aria-hidden fontFamily={monoFont} fontSize="10px" sx={{ fill: 'var(--chakra-colors-page-fg-secondary)' }}>
              {labels.map((l) => (
                <text key={`${l.col}-${l.label}`} x={l.col * STEP} y={10}>
                  {l.label}
                </text>
              ))}
            </Box>
            <Box
              as="g"
              aria-hidden
              sx={{
                '[data-phase="pending"] &': { opacity: 0 },
                '[data-phase="in"] &': { opacity: 1, transition: 'opacity 500ms var(--ease-out-quart)' },
                '@media (prefers-reduced-motion: reduce)': { '[data-phase] &': { opacity: 1, transition: 'none' } },
              }}
            >
              {LEVELS.map((level) => (paths[level] ? <path key={level} data-level={level} d={paths[level]} /> : null))}
            </Box>
          </svg>
        </Box>
        <Flex align="center" justify="flex-end" gap={1.5} mt={2} fontFamily={monoFont} fontSize="11px" color="page.fg-secondary" aria-hidden>
          <span>{c.less}</span>
          <svg width={LEVELS.length * STEP - GAP} height={CELL} style={{ display: 'block' }}>
            {LEVELS.map((level) => (
              <rect key={level} data-level={level} x={level * STEP + 1.5} y={1.5} width={CELL - 3} height={CELL - 3} />
            ))}
          </svg>
          <span>{c.more}</span>
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
 * GitHub contribution calendar for the last year as one inline SVG in brand
 * indigo (no third-party image): a path per contribution level, the month
 * labels, and a text summary for screen readers (total, active days,
 * busiest day and month, longest streak) instead of one element per day.
 * Pointer users get a per-day tooltip from the pointer position.
 *
 * Server-rendered from the compact calendar in the page props; without it
 * (not ready in the server's budget) it fetches /api/github/contributions.
 * Renders nothing when the calendar is unavailable.
 */
export default function ContributionGraph({ initialData }: { initialData?: CompactCalendar | { available: false } | null }) {
  const { t } = useHomeUi()
  const { data, error } = useFetchJson<CalendarInput>('/api/github/contributions', { initialData })
  const calendar = useMemo(() => compactCalendar(data), [data])

  if (error || (data && !calendar)) return null

  if (!calendar) {
    return (
      <Box aria-busy="true" aria-label={t.calendar.loading} h={SKELETON_H}>
        <Skeleton h="14px" w="260px" maxW="70%" mb={3} borderRadius="sm" startColor="page.bg-elevated" endColor="page.bg-overlay" />
        <Skeleton h={`${GRID_H}px`} w="100%" borderRadius="md" startColor="page.bg-elevated" endColor="page.bg-overlay" />
      </Box>
    )
  }

  return <Calendar data={calendar} />
}
