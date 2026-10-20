import { useCallback, useRef } from 'react'
import { Box, Grid, Link, Text, Flex, Skeleton } from '@chakra-ui/react'
import { m, useReducedMotion, type Variants } from 'framer-motion'
import { GitForkIcon, StarIcon } from '../Icons/ui/content'
import { motionTransition } from '../../theme/tokens'

import { safeHref } from '../../lib/cvFormat'
import { revealVariant } from '../../lib/reveal'
import { useFetchJson, useRenderNow } from '../Common/useFetchJson'
import WidgetNotice from '../Common/WidgetNotice'
import { useScrollReveal } from '../General-UI/useScrollReveal'
import { useSpotlight } from '../General-UI/useSpotlight'
import { relativeTime, repoCard, type GhRepoCard, type GhRepoCards, type GhTopRepos } from '../Common/githubEvents'
import { fillUi } from '../../lib/uiStrings'
import type { HomeStrings } from '../../lib/uiStrings/home'
import { langWithin } from '../../lib/toc'
import { useHomeUi } from '../LandingPage/homeUi'

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

const MotionGrid = m(Grid)
const MotionLi = m(Box)
/**
 * One parent stagger, played only when the grid scrolls up from below the
 * fold (lib/reveal.ts): the server, the first frame and a grid already on
 * screen show the tiles; reduced motion never hides them.
 */
const staggerVariants = (reduce: boolean | null): { list: Variants; item: Variants } => ({
  list: { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.03 } } },
  item: {
    hidden: { opacity: 0, y: 6 },
    show: { opacity: 1, y: 0, transition: motionTransition('base', !!reduce) },
  },
})

/** Card body: the owner's blurb, else GitHub's description, else what we do know. */
function repoSummary(r: GhRepoCard, now: number, t: HomeStrings): string {
  const text = (r.blurb || r.description || '').trim()
  if (text) return text
  const when = relativeTime(r.pushed_at, now, t.github)
  return [r.language, when ? fillUi(t.repos.updated, { when }) : ''].filter(Boolean).join(' · ')
}

/**
 * Repositories: the owner's pinned ones first, then the rest of their own
 * work — flat tiles in a 1 / 2 / 3-up grid with a cursor-lit border, at most
 * `limit`. Server-rendered when `initialData` is passed (card fields only);
 * skeleton tiles otherwise keep the loaded height. Outages and an empty
 * account get an in-place notice.
 */
export default function TopRepos({ initialData, limit = 6 }: { initialData?: GhRepoCards | null; limit?: number }) {
  const { t } = useHomeUi()
  const { data, error, retry } = useFetchJson<GhRepoCards | GhTopRepos>('/api/github/top-repos', { initialData })

  if (error || data?.available === false) {
    return (
      <WidgetNotice kind="error" onRetry={retry} retryLabel={t.tryAgain} minH={CARD_H}>
        {t.repos.unavailable}
      </WidgetNotice>
    )
  }

  if (!data) {
    return (
      <Grid templateColumns={COLUMNS} gap={4} w="100%" aria-busy="true" aria-label={t.repos.loading}>
        {Array.from({ length: limit }).map((_, i) => (
          <Skeleton key={i} h={CARD_H} borderRadius="lg" startColor="page.bg-elevated" endColor="page.bg-overlay" />
        ))}
      </Grid>
    )
  }

  const repos = (data.repos || [])
    .filter((r) => safeHref(r.html_url))
    .slice(0, limit)
    .map(repoCard)
  if (!repos.length) {
    return <WidgetNotice kind="empty">{t.repos.empty}</WidgetNotice>
  }

  return <RepoGrid repos={repos} asOf={data.asOf} />
}

/** The loaded grid (its own component so the spotlight attaches once the list exists). */
function RepoGrid({ repos, asOf }: { repos: GhRepoCard[]; asOf?: number }) {
  const { t, lang } = useHomeUi()
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
      data-reveal-list=""
      className="hover-list"
      listStyleType="none"
      templateColumns={COLUMNS}
      gap={4}
      w="100%"
      aria-label={t.repos.label}
      variants={variants.list}
      initial={false}
      animate={revealVariant(reveal.phase)}
    >
      {repos.map((r) => {
        const langColor = r.language ? LANG_COLORS[r.language] || 'var(--accent)' : 'var(--accent)'
        const summary = repoSummary(r, now, t)
        const fromText = !!(r.blurb || r.description)
        return (
          <MotionLi as="li" key={r.id} variants={variants.item} data-reveal-item="" display="flex">
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
                <span className="sr-only">{t.repos.newTab}</span>
              </Flex>
              <Text
                fontSize="13px"
                color="page.fg-secondary"
                fontFamily={fromText ? undefined : monoFont}
                // The owner's blurb or GitHub's description, in their own language.
                lang={fromText ? langWithin(summary, lang) : undefined}
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
                    <StarIcon size="xs" />
                    <Text as="span">
                      {r.stargazers_count}
                      <span className="sr-only">{t.repos.stars}</span>
                    </Text>
                  </Flex>
                  <Flex align="center" gap={1}>
                    <GitForkIcon size="xs" />
                    <Text as="span">
                      {r.forks_count}
                      <span className="sr-only">{t.repos.forks}</span>
                    </Text>
                  </Flex>
                  {r.featured ? (
                    <Text as="span" letterSpacing="0.08em" textTransform="uppercase" color="accent.text">
                      {t.repos.featured}
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
