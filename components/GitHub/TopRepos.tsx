import React, { useCallback, useRef } from 'react'
import { Box, Grid, Link, Text, Flex, Skeleton } from '@chakra-ui/react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { FaStar, FaCodeBranch } from 'react-icons/fa'

import { safeHref } from '../../lib/cvFormat'
import { revealVariant } from '../../lib/reveal'
import { useFetchJson, useRenderNow } from '../Common/useFetchJson'
import WidgetNotice from '../Common/WidgetNotice'
import { useScrollReveal } from '../General-UI/useScrollReveal'
import { useSpotlight } from '../General-UI/useSpotlight'
import { relativeTime, type GhRepo, type GhTopRepos } from '../Common/githubEvents'

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

const MotionGrid = motion(Grid)
const MotionLi = motion(Box)
/**
 * One parent stagger, played only when the grid scrolls up from below the
 * fold (lib/reveal.ts): the server, the first frame and a grid already on
 * screen show the tiles; reduced motion never hides them.
 */
const staggerVariants = (reduce: boolean | null): { list: Variants; item: Variants } => ({
  list: { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.03 } } },
  item: {
    hidden: { opacity: 0, y: 6 },
    show: { opacity: 1, y: 0, transition: reduce ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
  },
})

/** Card body: the owner's blurb, else GitHub's description, else what we do know. */
function repoSummary(r: GhRepo, now: number): string {
  const text = (r.blurb || r.description || '').trim()
  if (text) return text
  const when = relativeTime(r.pushed_at || r.updated_at, now)
  return [r.language, when ? `updated ${when}` : ''].filter(Boolean).join(' · ')
}

/**
 * Repositories: the owner's featured ones first, then the rest of their own
 * work — flat tiles in a 1 / 2 / 3-up grid with a cursor-lit border. Server-
 * rendered when `initialData` is passed; skeleton tiles otherwise keep the
 * loaded height. Outages and an empty account get an in-place notice.
 */
export default function TopRepos({ initialData }: { initialData?: GhTopRepos | null }) {
  const { data, error, retry } = useFetchJson<GhTopRepos>('/api/github/top-repos', { initialData })

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

  return <RepoGrid repos={repos} asOf={data.asOf} />
}

/** The loaded grid (its own component so the spotlight attaches once the list exists). */
function RepoGrid({ repos, asOf }: { repos: GhRepo[]; asOf?: number }) {
  const reduce = useReducedMotion()
  const listRef = useRef<HTMLElement | null>(null)
  const reveal = useScrollReveal<HTMLElement>()
  const revealRef = reveal.ref
  const setListRef = useCallback(
    (el: HTMLElement | null) => {
      listRef.current = el
      revealRef(el)
    },
    [revealRef],
  )
  useSpotlight(listRef)
  const now = useRenderNow(asOf)
  const variants = staggerVariants(reduce)

  return (
    <MotionGrid
      as="ul"
      ref={setListRef}
      className="hover-list"
      listStyleType="none"
      templateColumns={COLUMNS}
      gap={4}
      w="100%"
      aria-label="Repositories"
      variants={variants.list}
      initial={false}
      animate={revealVariant(reveal.phase)}
    >
      {repos.map((r) => {
        const langColor = r.language ? LANG_COLORS[r.language] || 'var(--accent)' : 'var(--accent)'
        const summary = repoSummary(r, now)
        const fromText = !!(r.blurb || r.description)
        return (
          <MotionLi as="li" key={r.id} variants={variants.item} display="flex">
            <Link
              href={safeHref(r.html_url)}
              isExternal
              className="spotlight hover-item"
              data-spotlight=""
              display="flex"
              flexDirection="column"
              w="100%"
              minH={CARD_H}
              border="1px solid"
              borderColor="page.border"
              borderRadius="lg"
              p={4}
              sx={{
                transitionProperty: 'border-color, opacity',
                transitionDuration: '200ms',
                transitionTimingFunction: 'var(--ease-out-quart)',
                '&:hover': { borderColor: 'page.border-strong', textDecoration: 'none' },
                '&:focus-visible': { borderColor: 'var(--accent)', outline: 'none', boxShadow: '0 0 0 1px var(--accent)' },
              }}
            >
              <Flex justify="space-between" align="baseline" gap={2} mb={2}>
                <Text as="span" fontWeight={500} fontSize="14px" color="page.fg" noOfLines={1} fontFamily={monoFont}>
                  {r.name}
                </Text>
                <Text as="span" className="nudge-ne" fontFamily={monoFont} fontSize="11px" color="page.fg-secondary" aria-hidden>
                  ↗
                </Text>
                <span className="sr-only"> (opens GitHub in a new tab)</span>
              </Flex>
              <Text
                fontSize="13px"
                color="page.fg-secondary"
                fontFamily={fromText ? undefined : monoFont}
                noOfLines={2}
                lineHeight="1.55"
                mb={3}
                minH="40px"
              >
                {summary}
              </Text>
              <Box flex="1" />
              <Flex align="center" justify="space-between" gap={3} fontFamily={monoFont} fontSize="11px" color="page.fg-secondary">
                <Flex align="center" gap={3} className="tnum">
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
                  {r.featured ? (
                    <Text as="span" letterSpacing="0.08em" textTransform="uppercase" color="accent.text">
                      Featured
                    </Text>
                  ) : null}
                </Flex>
                {r.language && (
                  <Flex align="center" gap={1.5} minW={0}>
                    <Box as="span" aria-hidden w="6px" h="6px" borderRadius="full" bg={langColor} flexShrink={0} />
                    <Text as="span" noOfLines={1}>
                      {r.language}
                    </Text>
                  </Flex>
                )}
              </Flex>
            </Link>
          </MotionLi>
        )
      })}
    </MotionGrid>
  )
}
