import React, { useMemo } from 'react'
import { Box, Flex, Skeleton, Text } from '@chakra-ui/react'
import { motion, useReducedMotion } from 'framer-motion'

import { useFetchJson } from '../Common/useFetchJson'
import WidgetNotice from '../Common/WidgetNotice'

type LangData = { total: number; breakdown: Record<string, number>; available?: boolean }

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
}

const colorFor = (lang: string) => LANG_COLORS[lang] || 'var(--accent)'
const MotionBox = motion(Box)
const ROWS = 10

/**
 * Language share across public, non-fork repositories (bytes, top 10).
 * The skeleton uses the loaded row geometry; outages and "no code yet" get
 * an in-place notice instead of an empty gap.
 */
export default function LanguageBars() {
  const reduce = useReducedMotion()
  const { data, error, retry } = useFetchJson<LangData>('/api/github/languages')

  const items = useMemo(() => {
    if (!data?.total) return [] as Array<{ name: string; pct: number }>
    return Object.entries(data.breakdown || {})
      .map(([name, bytes]) => ({ name, pct: (bytes / data.total) * 100 }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 10)
  }, [data])

  if (error || data?.available === false) {
    return (
      <WidgetNotice kind="error" onRetry={retry}>
        Language breakdown is unavailable right now.
      </WidgetNotice>
    )
  }

  if (!data) {
    return (
      <Flex direction="column" gap={3} aria-busy="true" aria-label="Loading language breakdown">
        {Array.from({ length: ROWS }).map((_, i) => (
          <Box key={i}>
            <Flex justify="space-between" mb={1} h="21px" align="center">
              <Skeleton h="12px" w={`${80 + (i % 3) * 20}px`} borderRadius="sm" startColor="page.bg-elevated" endColor="page.bg-overlay" />
              <Skeleton h="10px" w="36px" borderRadius="sm" startColor="page.bg-elevated" endColor="page.bg-overlay" />
            </Flex>
            <Skeleton h="6px" borderRadius="full" startColor="page.bg-elevated" endColor="page.bg-overlay" />
          </Box>
        ))}
      </Flex>
    )
  }

  if (!items.length) {
    return <WidgetNotice kind="empty">No language data to show yet.</WidgetNotice>
  }

  return (
    <Flex as="ul" listStyleType="none" direction="column" gap={3} aria-label="Languages by share of code">
      {items.map(({ name, pct }, idx) => (
        <MotionBox
          as="li"
          key={name}
          initial={reduce ? false : { opacity: 0, x: -10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.35, delay: idx * 0.05, ease: [0.22, 1, 0.36, 1] }}
        >
          <Flex align="center" justify="space-between" mb={1} h="21px">
            <Flex align="center" gap={2}>
              <Box as="span" aria-hidden w="8px" h="8px" borderRadius="full" bg={colorFor(name)} flexShrink={0} />
              <Text as="span" fontSize="sm" fontWeight={500} color="page.fg">
                {name}
              </Text>
            </Flex>
            <Text as="span" fontFamily="var(--font-geist-mono), monospace" fontSize="12px" color="page.fg-secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {pct.toFixed(1)}%
            </Text>
          </Flex>
          <Box aria-hidden w="100%" h="6px" bg="page.bg-overlay" borderRadius="full" overflow="hidden">
            {/* scaleX (compositor-only) instead of animating width (layout). */}
            <MotionBox
              initial={reduce ? false : { scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: idx * 0.05, ease: [0.22, 1, 0.36, 1] }}
              w={`${Math.max(pct, 0.5)}%`}
              h="100%"
              bg={colorFor(name)}
              borderRadius="full"
              style={{ transformOrigin: 'left center' }}
            />
          </Box>
        </MotionBox>
      ))}
    </Flex>
  )
}
