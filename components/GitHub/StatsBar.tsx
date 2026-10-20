import { Box, Grid, Skeleton, Text } from '@chakra-ui/react'

import { useFetchJson } from '../Common/useFetchJson'
import WidgetNotice from '../Common/WidgetNotice'
import DigitRoll, { DIGIT_ROLL_NO_SCRIPT_CSS } from '../General-UI/DigitRoll'
import { statColumns, statTiles, type GhStats } from '../Common/githubEvents'
import { useHomeUi } from '../LandingPage/homeUi'

/** Big figures: the fluid `stat` size (28→44px), tight tabular digits (theme/tokens.ts). */
const numberSx = {
  textStyle: 'stat',
  color: 'page.fg',
}

/** Tile labels: the `label` text style, with tighter tracking in the narrow phone tiles. */
const labelSx = {
  mt: 2,
  textStyle: 'label',
  letterSpacing: { base: 'caps-tight', sm: 'caps' },
  color: 'page.fg-secondary',
  // Break between words only (the CSS reset's break-word would split
  // "CONTRIBUTIONS" mid-word); statColumns keeps every word within a tile.
  overflowWrap: 'normal' as const,
  wordBreak: 'normal' as const,
}

const StatItem = ({ label, value }: { label: string; value: number }) => (
  <Box minW={0}>
    <DigitRoll value={value} sx={numberSx} />
    <Text sx={labelSx}>{label}</Text>
  </Box>
)

const SKELETON_TILES = 3

/** Loading tile: the loaded geometry, no label text (the set of tiles is not known yet). */
const StatSkeleton = () => (
  <Box minW={0}>
    <Skeleton h="var(--chakra-fontSizes-stat)" w="60%" borderRadius="sm" startColor="page.bg-elevated" endColor="page.bg-overlay" />
    <Skeleton mt={2} h="calc(var(--chakra-fontSizes-label) * 1.4)" w="70%" borderRadius="sm" startColor="page.bg-elevated" endColor="page.bg-overlay" />
  </Box>
)

/**
 * GitHub summary row: big numbers + mono labels between hairlines.
 * Server-rendered when `initialData` is passed; otherwise loading keeps the
 * final geometry (skeleton numbers). An outage or a missing profile becomes
 * an in-place notice rather than "0 · 0 · 0".
 */
export default function StatsBar({ initialData }: { initialData?: GhStats | null }) {
  const { t } = useHomeUi()
  const { data, error, retry } = useFetchJson<GhStats>('/api/github/stats', { initialData })
  const failed = error || (data !== null && data.available === false)
  const empty = data !== null && data.available !== false && !data.user

  if (failed || empty) {
    return (
      <WidgetNotice kind={failed ? 'error' : 'empty'} onRetry={failed ? retry : undefined} retryLabel={t.tryAgain} minH={{ base: '72px', md: '116px' }}>
        {failed ? t.stats.unavailable : t.stats.noProfile}
      </WidgetNotice>
    )
  }

  const tiles = data ? statTiles(data, t.stats.tiles) : null
  const count = tiles ? tiles.length : SKELETON_TILES
  return (
    <Grid
      as="section"
      aria-label={t.stats.label}
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
        <style>{DIGIT_ROLL_NO_SCRIPT_CSS}</style>
      </noscript>
      {tiles
        ? tiles.map((tile) => <StatItem key={tile.key} label={tile.label} value={tile.value} />)
        : Array.from({ length: SKELETON_TILES }, (_, i) => <StatSkeleton key={i} />)}
    </Grid>
  )
}
