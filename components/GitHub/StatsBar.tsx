import React, { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { Box, Grid, Skeleton, Text } from '@chakra-ui/react'
import { useInView, useReducedMotion } from 'framer-motion'

import { useFetchJson } from '../Common/useFetchJson'
import WidgetNotice from '../Common/WidgetNotice'
import { statColumns, statTiles, type GhStats } from '../Common/githubEvents'

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

const numberSx = {
  fontSize: { base: '28px', sm: '36px', md: '44px' },
  lineHeight: '1',
  fontWeight: 500,
  letterSpacing: '-0.03em',
}

const labelSx = {
  mt: 2,
  fontFamily: monoFont,
  fontSize: { base: '10px', sm: '11px' },
  letterSpacing: { base: '0.06em', sm: '0.14em' },
  textTransform: 'uppercase' as const,
  color: 'page.fg-secondary',
  // Break between words only (the CSS reset's break-word would split
  // "CONTRIBUTIONS" mid-word); statColumns keeps every word within a tile.
  overflowWrap: 'normal' as const,
  wordBreak: 'normal' as const,
}

/**
 * The 0–9 strip of one digit column, as generated content: the digits are
 * painted by CSS, so the DOM text (copy, reader mode, crawlers) is only the
 * real value in the sr-only span next to it.
 */
const stripSx = {
  '&::before': {
    content: '"0\\A 1\\A 2\\A 3\\A 4\\A 5\\A 6\\A 7\\A 8\\A 9"',
    whiteSpace: 'pre',
  },
}

/**
 * Without JavaScript the columns would stay at 0: show the final digits.
 * An author `!important` declaration beats the non-important inline --d.
 */
const NO_SCRIPT_CSS = '.stat-roll .digit>span{--d:var(--f)!important}'

type DigitStyle = React.CSSProperties & { '--d': number; '--f': number; '--i': number }

// useLayoutEffect on the client (runs before paint), a no-op on the server.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * A number that rolls into place: each digit is a `.digit` column whose
 * inner strip translates to the digit (globals.css: 900 ms, 60 ms stagger
 * per column).
 *
 * The server renders the FINAL digits, so crawlers, link previews, slow
 * hydrations and visitors who already see the tile never read "00". Only a
 * tile that is still below the fold when the page hydrates is reset to 0
 * (before paint, while off-screen) and rolls up as it scrolls into view.
 * Reduced motion never animates.
 */
function DigitRoll({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.3 })
  const reduce = useReducedMotion()
  const [rolled, setRolled] = useState(true)
  const armed = useRef(false)
  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el || reduce || armed.current) return
    armed.current = true
    if (el.getBoundingClientRect().top > window.innerHeight) setRolled(false)
  }, [reduce])
  useEffect(() => {
    if (inView || reduce) setRolled(true)
  }, [inView, reduce])

  const text = Math.max(0, Math.floor(value)).toLocaleString('en-US')
  let digitIndex = 0
  return (
    <Text as="span" ref={ref} className="stat-roll tnum" display="inline-flex" sx={{ ...numberSx, fontVariantNumeric: 'tabular-nums' }} color="page.fg">
      <span aria-hidden style={{ display: 'inline-flex' }}>
        {Array.from(text).map((ch, i) => {
          if (ch < '0' || ch > '9') return <span key={i}>{ch}</span>
          const d = Number(ch)
          const style: DigitStyle = { '--d': rolled ? d : 0, '--f': d, '--i': digitIndex++ }
          return (
            <span key={i} className="digit">
              <Box as="span" style={style} sx={stripSx} />
            </span>
          )
        })}
      </span>
      <span className="sr-only">{text}</span>
    </Text>
  )
}

const StatItem = ({ label, value }: { label: string; value: number }) => (
  <Box minW={0}>
    <DigitRoll value={value} />
    <Text sx={labelSx}>{label}</Text>
  </Box>
)

const SKELETON_TILES = 3

/** Loading tile: the loaded geometry, no label text (the set of tiles is not known yet). */
const StatSkeleton = () => (
  <Box minW={0}>
    <Skeleton h={numberSx.fontSize} w="60%" borderRadius="sm" startColor="page.bg-elevated" endColor="page.bg-overlay" />
    <Skeleton mt={2} h={{ base: '12px', sm: '14px' }} w="70%" borderRadius="sm" startColor="page.bg-elevated" endColor="page.bg-overlay" />
  </Box>
)

/**
 * GitHub summary row: big numbers + mono labels between hairlines.
 * Server-rendered when `initialData` is passed; otherwise loading keeps the
 * final geometry (skeleton numbers). An outage or a missing profile becomes
 * an in-place notice rather than "0 · 0 · 0".
 */
export default function StatsBar({ initialData }: { initialData?: GhStats | null }) {
  const { data, error, retry } = useFetchJson<GhStats>('/api/github/stats', { initialData })
  const failed = error || (data !== null && data.available === false)
  const empty = data !== null && data.available !== false && !data.user

  if (failed || empty) {
    return (
      <WidgetNotice kind={failed ? 'error' : 'empty'} onRetry={failed ? retry : undefined} minH={{ base: '72px', md: '116px' }}>
        {failed ? 'GitHub stats are unavailable right now.' : 'No GitHub profile is linked yet.'}
      </WidgetNotice>
    )
  }

  const tiles = data ? statTiles(data) : null
  const count = tiles ? tiles.length : SKELETON_TILES
  return (
    <Grid
      as="section"
      aria-label="GitHub stats"
      aria-busy={!tiles || undefined}
      templateColumns={statColumns(count)}
      columnGap={{ base: 3, sm: 8, md: 12 }}
      rowGap={6}
      w="100%"
      borderTop="1px solid"
      borderBottom="1px solid"
      borderColor="page.border"
      py={6}
    >
      <noscript>
        <style>{NO_SCRIPT_CSS}</style>
      </noscript>
      {tiles
        ? tiles.map((t) => <StatItem key={t.label} label={t.label} value={t.value} />)
        : Array.from({ length: SKELETON_TILES }, (_, i) => <StatSkeleton key={i} />)}
    </Grid>
  )
}
