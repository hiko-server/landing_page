import React, { useEffect, useState } from 'react'
import { Box, Grid, Skeleton, Text } from '@chakra-ui/react'
import { motion, useReducedMotion } from 'framer-motion'

import { useFetchJson } from '../Common/useFetchJson'
import WidgetNotice from '../Common/WidgetNotice'

type Stats = {
  user: string
  public_repos: number
  followers: number
  total_stars: number
  available?: boolean
}

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'
const MotionBox = motion(Box)

/** Eased count-up for the headline number on each stat tile. */
function useCountUp(target: number, ms = 900) {
  const reduce = useReducedMotion()
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!target) {
      setVal(0)
      return
    }
    if (reduce) {
      setVal(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms)
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms, reduce])
  return val
}

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
}

const StatItem = ({ label, value, delay }: { label: string; value: number | null; delay: number }) => {
  const reduce = useReducedMotion()
  const count = useCountUp(value ?? 0)
  return (
    <MotionBox
      minW={0}
      initial={reduce || value === null ? false : { opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {value === null ? (
        <Skeleton h={numberSx.fontSize} w="60%" borderRadius="sm" startColor="page.bg-elevated" endColor="page.bg-overlay" />
      ) : (
        <Text sx={{ ...numberSx, fontVariantNumeric: 'tabular-nums' }} color="page.fg">
          {/* Screen readers get the final value, not every animation frame. */}
          <span aria-hidden>{count.toLocaleString('en-US')}</span>
          <span className="sr-only">{value.toLocaleString('en-US')}</span>
        </Text>
      )}
      <Text sx={labelSx}>{label}</Text>
    </MotionBox>
  )
}

/**
 * GitHub summary row: three big numbers + mono labels between hairlines.
 * Loading keeps the final geometry (skeleton numbers), and an outage or a
 * missing profile becomes an in-place notice rather than "0 · 0 · 0".
 */
export default function StatsBar() {
  const { data, error, retry } = useFetchJson<Stats>('/api/github/stats')
  const failed = error || (data !== null && data.available === false)
  const empty = data !== null && data.available !== false && !data.user

  if (failed || empty) {
    return (
      <WidgetNotice kind={failed ? 'error' : 'empty'} onRetry={failed ? retry : undefined} minH={{ base: '72px', md: '116px' }}>
        {failed ? 'GitHub stats are unavailable right now.' : 'No GitHub profile is linked yet.'}
      </WidgetNotice>
    )
  }

  const loading = data === null
  return (
    <Grid
      as="section"
      aria-label="GitHub stats"
      aria-busy={loading || undefined}
      templateColumns="repeat(3, minmax(0, 1fr))"
      gap={{ base: 3, sm: 8, md: 12 }}
      w="100%"
      borderTop="1px solid"
      borderBottom="1px solid"
      borderColor="page.border"
      py={6}
    >
      <StatItem label="Public repos" value={loading ? null : data.public_repos} delay={0} />
      <StatItem label="Followers" value={loading ? null : data.followers} delay={0.08} />
      <StatItem label="Total stars" value={loading ? null : data.total_stars} delay={0.16} />
    </Grid>
  )
}
