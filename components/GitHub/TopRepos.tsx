import React from 'react'
import { Box, Grid, Link, Text, Flex, Skeleton } from '@chakra-ui/react'
import { motion, useReducedMotion } from 'framer-motion'
import { FaStar, FaCodeBranch } from 'react-icons/fa'

import { safeHref } from '../../lib/cvFormat'
import { useFetchJson } from '../Common/useFetchJson'
import WidgetNotice from '../Common/WidgetNotice'

type Repo = {
  id: number
  name: string
  html_url: string
  description: string | null
  stargazers_count: number
  forks_count: number
  language: string | null
  updated_at: string
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  Java: '#b07219',
  'C++': '#f34b7d',
  Vue: '#41B883',
  Dart: '#00B4AB',
  Swift: '#ffac45',
  Kotlin: '#A97BFF',
}

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'
const COLUMNS = { base: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }
const CARD_H = '132px'
const MotionLink = motion(Link)

/**
 * Top repositories — flat tiles in a 1 / 2 / 3-up grid. Skeleton tiles have
 * the loaded tile height; outages and an empty account get an in-place notice.
 */
export default function TopRepos() {
  const reduce = useReducedMotion()
  const { data, error, retry } = useFetchJson<{ repos?: Repo[]; available?: boolean }>('/api/github/top-repos')

  if (error || data?.available === false) {
    return (
      <WidgetNotice kind="error" onRetry={retry} minH={CARD_H}>
        Repositories couldn’t be loaded from GitHub.
      </WidgetNotice>
    )
  }

  if (!data) {
    return (
      <Grid templateColumns={COLUMNS} gap={4} w="100%" aria-busy="true" aria-label="Loading repositories">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} h={CARD_H} borderRadius="lg" startColor="page.bg-elevated" endColor="page.bg-overlay" />
        ))}
      </Grid>
    )
  }

  const repos = (data.repos || []).filter((r) => safeHref(r.html_url))
  if (!repos.length) {
    return <WidgetNotice kind="empty">No public repositories to show yet.</WidgetNotice>
  }

  return (
    <Grid as="ul" listStyleType="none" templateColumns={COLUMNS} gap={4} w="100%">
      {repos.map((r, i) => {
        const langColor = r.language ? LANG_COLORS[r.language] || 'var(--accent)' : 'var(--accent)'
        return (
          <li key={r.id}>
            <MotionLink
              href={safeHref(r.html_url)}
              isExternal
              display="flex"
              flexDirection="column"
              h="100%"
              minH={CARD_H}
              border="1px solid"
              borderColor="page.border"
              borderRadius="lg"
              p={4}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={reduce ? undefined : { y: -2 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
              // framer owns `transform`; CSS only transitions the border.
              sx={{
                transitionProperty: 'border-color',
                transitionDuration: '250ms',
                transitionTimingFunction: 'var(--ease-out-quart)',
                '&:hover': { borderColor: 'page.border-strong', textDecoration: 'none' },
                '&:focus-visible': { borderColor: 'var(--accent)', outline: 'none', boxShadow: '0 0 0 1px var(--accent)' },
              }}
            >
              <Flex justify="space-between" align="baseline" gap={2} mb={2}>
                <Text as="span" fontWeight={500} fontSize="14px" color="page.fg" noOfLines={1} fontFamily={monoFont}>
                  {r.name}
                </Text>
                <Text as="span" fontFamily={monoFont} fontSize="11px" color="page.fg-secondary" aria-hidden>
                  ↗
                </Text>
                <span className="sr-only"> (opens GitHub in a new tab)</span>
              </Flex>
              <Text fontSize="13px" color="page.fg-secondary" noOfLines={2} lineHeight="1.55" mb={3} minH="40px">
                {r.description || ''}
              </Text>
              <Box flex="1" />
              <Flex align="center" justify="space-between" fontFamily={monoFont} fontSize="11px" color="page.fg-secondary">
                <Flex align="center" gap={3}>
                  <Flex align="center" gap={1}>
                    <FaStar size={10} aria-hidden />
                    <Text as="span">
                      {r.stargazers_count}
                      <span className="sr-only"> stars</span>
                    </Text>
                  </Flex>
                  <Flex align="center" gap={1}>
                    <FaCodeBranch size={10} aria-hidden />
                    <Text as="span">
                      {r.forks_count}
                      <span className="sr-only"> forks</span>
                    </Text>
                  </Flex>
                </Flex>
                {r.language && (
                  <Flex align="center" gap={1.5}>
                    <Box as="span" aria-hidden w="6px" h="6px" borderRadius="full" bg={langColor} />
                    <Text as="span">{r.language}</Text>
                  </Flex>
                )}
              </Flex>
            </MotionLink>
          </li>
        )
      })}
    </Grid>
  )
}
