import React, { useId, useState } from 'react'
import { Box, Flex, Link, Skeleton, Text } from '@chakra-ui/react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { FaBolt, FaChevronDown, FaCode, FaCodeBranch, FaExclamationCircle, FaPlus } from 'react-icons/fa'

import { revealVariant } from '../../lib/reveal'
import { useFetchJson, useRenderNow } from '../Common/useFetchJson'
import WidgetNotice from '../Common/WidgetNotice'
import Collapse from '../General-UI/Collapse'
import { useScrollReveal } from '../General-UI/useScrollReveal'
import {
  absoluteTime,
  eventAction,
  eventKind,
  groupEvents,
  relativeTime,
  repoUrl,
  splitRepo,
  summarizeGroup,
  type EventGroup,
  type EventKind,
  type GhEvent,
  type GhEventsPayload,
} from '../Common/githubEvents'

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'
const ROW_H = '44px'
/** Rows shown after grouping; the skeleton reserves a typical grouped feed. */
const MAX_ROWS = 10
const SKELETON_ROWS = 6

const MotionOl = motion(Flex)
const MotionLi = motion(Box)
/**
 * One parent stagger, played only when the feed scrolls up from below the
 * fold (lib/reveal.ts): the server, the first frame and a feed already on
 * screen show every row; reduced motion never hides them.
 */
const staggerVariants = (reduce: boolean | null): { list: Variants; row: Variants } => ({
  list: { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.03 } } },
  row: {
    hidden: { opacity: 0, y: 6 },
    show: { opacity: 1, y: 0, transition: reduce ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
  },
})

const ICONS: Record<EventKind, React.ReactElement> = {
  push: <FaCode size={11} />,
  pr: <FaCodeBranch size={11} />,
  issue: <FaExclamationCircle size={11} />,
  create: <FaPlus size={11} />,
  repo: <FaCodeBranch size={11} />,
  other: <FaBolt size={11} />,
}

const focusRing = { outline: '2px solid var(--accent)', outlineOffset: '2px', borderRadius: 'sm' }

/**
 * "owner/" muted and truncated first, the repository name in full: on a
 * narrow row the owner gives way before the name does.
 */
function RepoName({ repo }: { repo: string }) {
  const { owner, name } = splitRepo(repo)
  return (
    <Box as="span" display="inline-flex" minW={0} maxW="100%" fontFamily={monoFont} fontSize="13px">
      {owner ? (
        <Box as="span" color="page.fg-secondary" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" minW={0} flexShrink={100}>
          {owner}
        </Box>
      ) : null}
      <Box as="span" color="page.fg" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" minW={0} flexShrink={1}>
        {name}
      </Box>
    </Box>
  )
}

/** The repository, linked to GitHub when the name is well-formed. */
function RepoLink({ repo }: { repo: string }) {
  const href = repoUrl(repo)
  if (!href) return <RepoName repo={repo} />
  return (
    <Link
      href={href}
      isExternal
      display="inline-flex"
      minW={0}
      maxW="100%"
      _hover={{ color: 'accent.text', textDecoration: 'none', '& > span > span': { color: 'accent.text' } }}
      _focusVisible={focusRing}
    >
      <RepoName repo={repo} />
      <span className="sr-only"> (opens GitHub in a new tab)</span>
    </Link>
  )
}

function When({ iso, now }: { iso: string; now: number }) {
  const when = relativeTime(iso, now)
  if (!when) return null
  return (
    <Text as="time" dateTime={iso} title={absoluteTime(iso)} className="tnum" flexShrink={0} fontFamily={monoFont} fontSize="11px" color="page.fg-secondary">
      {when}
    </Text>
  )
}

function Glyph({ kind }: { kind: EventKind }) {
  return (
    <Flex
      as="span"
      aria-hidden
      w="22px"
      h="22px"
      flexShrink={0}
      align="center"
      justify="center"
      borderRadius="6px"
      border="1px solid"
      borderColor="page.border"
      color="page.fg-secondary"
    >
      {ICONS[kind]}
    </Flex>
  )
}

/** Action phrase + repository on one line (the phrase never wraps, the repo truncates). */
function EventLine({ e }: { e: GhEvent }) {
  const repo = e.repo?.name || ''
  return (
    <Flex as="span" align="baseline" gap={1.5} minW={0} flex="1" fontSize="sm" lineHeight="1.4" color="page.fg-secondary">
      <Box as="span" flexShrink={0} whiteSpace="nowrap">
        {eventAction(e)}
      </Box>
      {repo ? <RepoLink repo={repo} /> : null}
    </Flex>
  )
}

function GroupRow({ group, now }: { group: EventGroup; now: number }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const newest = group.events[0]

  if (group.events.length === 1) {
    return (
      <Flex align="center" gap={3} minW={0} w="100%" minH={ROW_H}>
        <Glyph kind={eventKind(newest.type)} />
        <EventLine e={newest} />
        <When iso={newest.created_at} now={now} />
      </Flex>
    )
  }

  const summary = summarizeGroup(group.events)
  return (
    <Box w="100%">
      <Flex align="center" gap={3} minW={0} w="100%" minH={ROW_H}>
        <Glyph kind={eventKind(newest.type)} />
        <Flex
          as="button"
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          align="center"
          gap={2}
          flex="1"
          minW={0}
          minH="32px"
          textAlign="left"
          color="page.fg-secondary"
          _hover={{ color: 'page.fg' }}
          _focusVisible={focusRing}
        >
          <Flex as="span" align="baseline" gap={1.5} minW={0} flex="1" fontSize="sm" lineHeight="1.4">
            <Box as="span" flexShrink={0} whiteSpace="nowrap">
              {group.events.length} events in
            </Box>
            <RepoName repo={group.repo} />
            {summary ? (
              <Box as="span" minW={0} flexShrink={1000} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                <span aria-hidden>· </span>
                <span className="sr-only">: </span>
                {summary}
              </Box>
            ) : null}
          </Flex>
          <Box
            as="span"
            aria-hidden
            flexShrink={0}
            display="inline-flex"
            transform={open ? 'rotate(180deg)' : 'none'}
            transition="transform 200ms var(--ease-out-quart)"
          >
            <FaChevronDown size={10} />
          </Box>
        </Flex>
        <When iso={newest.created_at} now={now} />
      </Flex>
      <Collapse open={open} id={panelId}>
        <Box as="ul" listStyleType="none" pl={9} pb={2} display="flex" flexDirection="column" gap={1.5}>
          {group.events.map((e) => (
            <Flex as="li" key={e.id} align="center" gap={3} minW={0} minH="28px">
              <EventLine e={e} />
              <When iso={e.created_at} now={now} />
            </Flex>
          ))}
        </Box>
      </Collapse>
    </Box>
  )
}

/**
 * Recent public GitHub activity as a quiet rail. Consecutive events on the
 * same repository collapse into one row ("3 events in owner/repo · PR #14,
 * 1 branch") that expands to list them. Monochrome on purpose — the accent
 * marks only the newest entry. Server-rendered when `initialData` is passed;
 * relative times use the server's stamp until hydration, then the real clock.
 */
export default function ActivityFeed({ initialData }: { initialData?: GhEventsPayload | null }) {
  const reduce = useReducedMotion()
  const reveal = useScrollReveal<HTMLElement>()
  const { data, error, retry } = useFetchJson<GhEventsPayload>('/api/github/events', { initialData })
  const now = useRenderNow(data?.asOf)

  if (error || data?.available === false) {
    return (
      <WidgetNotice kind="error" onRetry={retry}>
        Recent activity couldn’t be loaded from GitHub.
      </WidgetNotice>
    )
  }

  if (!data) {
    return (
      <Flex direction="column" gap={2} aria-busy="true" aria-label="Loading recent activity">
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <Flex key={i} h={ROW_H} align="center" gap={3} pl={7}>
            <Skeleton w="22px" h="22px" borderRadius="6px" startColor="page.bg-elevated" endColor="page.bg-overlay" />
            <Skeleton h="12px" w={`${45 + (i % 3) * 15}%`} borderRadius="sm" startColor="page.bg-elevated" endColor="page.bg-overlay" />
          </Flex>
        ))}
      </Flex>
    )
  }

  const groups = groupEvents(data.events).slice(0, MAX_ROWS)
  const variants = staggerVariants(reduce)
  if (!groups.length) {
    return <WidgetNotice kind="empty">No recent public GitHub activity.</WidgetNotice>
  }

  return (
    <Box position="relative" pl={7}>
      <Box as="span" aria-hidden position="absolute" left="13px" top={3} bottom={3} w="1px" bg="page.border" />
      <MotionOl
        as="ol"
        ref={reveal.ref}
        data-reveal-list=""
        className="hover-list"
        listStyleType="none"
        direction="column"
        gap={2}
        aria-label="Recent GitHub activity"
        variants={variants.list}
        initial={false}
        animate={revealVariant(reveal.phase)}
      >
        {groups.map((g, i) => (
          <MotionLi as="li" key={g.key} position="relative" variants={variants.row} data-reveal-item="">
            <Box
              as="span"
              aria-hidden
              position="absolute"
              left="-17.5px"
              top="22px"
              transform="translateY(-50%)"
              w="6px"
              h="6px"
              borderRadius="full"
              bg={i === 0 ? 'var(--accent)' : 'page.border-strong'}
              boxShadow="0 0 0 3px var(--chakra-colors-page-bg)"
            />
            <Box className="hover-item">
              <GroupRow group={g} now={now} />
            </Box>
          </MotionLi>
        ))}
      </MotionOl>
    </Box>
  )
}
