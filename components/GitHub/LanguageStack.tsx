import { useMemo } from 'react'
import { Box, Flex, Grid, Skeleton, Text } from '@chakra-ui/react'

import { useFetchJson } from '../Common/useFetchJson'
import WidgetNotice from '../Common/WidgetNotice'
import { languageStackProp, type GhLanguageStack, type GhLanguages, type LanguageSlice } from '../Common/githubEvents'

/** GitHub's canonical language colours; anything unlisted uses the site accent. */
const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
  HTML: '#e34c26',
  CSS: '#563d7c',
  SCSS: '#c6538c',
  Shell: '#89e051',
  Java: '#b07219',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  PHP: '#4F5D95',
  Swift: '#ffac45',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  Vue: '#41B883',
  Svelte: '#FF3E00',
  Ruby: '#701516',
  Solidity: '#3c3c3d',
  Dockerfile: '#384d54',
  'Jupyter Notebook': '#DA5B0B',
  Tex: '#3D6117',
}

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

/** "Other" is neutral; a language keeps its GitHub colour (else the accent). */
const colorFor = (s: LanguageSlice) => (s.other ? 'var(--chakra-colors-page-fg-subtle)' : LANG_COLORS[s.name] || 'var(--accent)')

/**
 * Language share across the public, non-fork repositories as ONE stacked bar
 * (top five + Other) with a legend underneath. The bar is decorative; the
 * legend carries every name and percentage as text, so colour is never the
 * only cue. Segments are separated by a 2px gap of the page colour, which
 * keeps neighbouring colours apart in both themes.
 *
 * Server-rendered from the trimmed stack in the page props; without it the
 * widget fetches /api/github/languages and derives the same stack.
 */
export default function LanguageStack({ initialData }: { initialData?: GhLanguageStack | null }) {
  const { data, error, retry } = useFetchJson<GhLanguageStack | GhLanguages>('/api/github/languages', { initialData })
  const stack = useMemo(() => languageStackProp(data), [data])

  if (error || stack?.available === false) {
    return (
      <WidgetNotice kind="error" onRetry={retry}>
        Language breakdown is unavailable right now.
      </WidgetNotice>
    )
  }

  if (!stack) {
    return (
      <Box aria-busy="true" aria-label="Loading language breakdown">
        <Skeleton h="10px" borderRadius="full" startColor="page.bg-elevated" endColor="page.bg-overlay" />
        <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={2} mt={4}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} h="18px" borderRadius="sm" startColor="page.bg-elevated" endColor="page.bg-overlay" />
          ))}
        </Grid>
      </Box>
    )
  }

  if (!stack.slices.length) return <WidgetNotice kind="empty">No language data to show yet.</WidgetNotice>

  return (
    <Box>
      <Flex aria-hidden h="10px" w="100%" borderRadius="full" overflow="hidden" gap="2px" bg="page.bg" data-language-bar="">
        {stack.slices.map((s) => (
          <Box
            key={s.name}
            h="100%"
            minW="3px"
            flexGrow={0}
            flexShrink={1}
            flexBasis={`${s.pct}%`}
            bg={colorFor(s)}
            sx={{ '@media (forced-colors: active)': { bg: 'CanvasText', forcedColorAdjust: 'none' } }}
          />
        ))}
      </Flex>
      <Grid
        as="ul"
        listStyleType="none"
        aria-label={`Languages by share of code${stack.count > stack.slices.length ? `, top ${stack.slices.filter((s) => !s.other).length} of ${stack.count}` : ''}`}
        templateColumns="repeat(2, minmax(0, 1fr))"
        columnGap={4}
        rowGap={2}
        mt={4}
      >
        {stack.slices.map((s) => (
          <Flex as="li" key={s.name} align="center" gap={2} minW={0} fontSize="13px">
            <Box as="span" aria-hidden w="8px" h="8px" borderRadius="full" bg={colorFor(s)} flexShrink={0} />
            <Text as="span" color="page.fg" noOfLines={1} minW={0}>
              {s.name}
            </Text>
            <Text as="span" ml="auto" className="tnum" fontFamily={monoFont} fontSize="12px" color="page.fg-secondary" flexShrink={0}>
              {s.pct.toFixed(1)}%
            </Text>
          </Flex>
        ))}
      </Grid>
    </Box>
  )
}
