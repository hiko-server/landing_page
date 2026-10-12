import React from 'react'
import { Box, Flex, Link, Skeleton, Text } from '@chakra-ui/react'
import { motion, useReducedMotion } from 'framer-motion'
import { FaCode, FaCodeBranch, FaExclamationCircle, FaPlus, FaBolt } from 'react-icons/fa'

import { useFetchJson } from '../Common/useFetchJson'
import WidgetNotice from '../Common/WidgetNotice'
import { eventAction, eventKind, relativeTime, repoUrl, type EventKind, type GhEvent } from '../Common/githubEvents'

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'
const MotionLi = motion(Box)
const ROW_H = '44px'
/** The API returns up to 12 events; the skeleton reserves the same space. */
const SKELETON_ROWS = 12

const ICONS: Record<EventKind, React.ReactElement> = {
  push: <FaCode size={11} />,
  pr: <FaCodeBranch size={11} />,
  issue: <FaExclamationCircle size={11} />,
  create: <FaPlus size={11} />,
  repo: <FaCodeBranch size={11} />,
  other: <FaBolt size={11} />,
}

/**
 * Recent public GitHub activity as a quiet rail: mono glyph, action, repo
 * (linked) and relative time. Monochrome on purpose — the accent marks only
 * the newest entry. Skeleton rows match the loaded row height.
 */
export default function ActivityFeed() {
  const reduce = useReducedMotion()
  const { data, error, retry } = useFetchJson<{ events?: GhEvent[]; available?: boolean }>('/api/github/events')

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

  const events = data.events || []
  if (!events.length) {
    return <WidgetNotice kind="empty">No recent public GitHub activity.</WidgetNotice>
  }

  return (
    <Box position="relative" pl={7}>
      <Box as="span" aria-hidden position="absolute" left="13px" top={3} bottom={3} w="1px" bg="page.border" />
      <Flex as="ol" listStyleType="none" direction="column" gap={2} aria-label="Recent GitHub activity">
        {events.map((e, i) => {
          const repo = e.repo?.name || ''
          const href = repoUrl(repo)
          const when = relativeTime(e.created_at)
          return (
            <MotionLi
              as="li"
              key={e.id}
              position="relative"
              minH={ROW_H}
              display="flex"
              alignItems="center"
              initial={reduce ? false : { opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.04, ease: [0.22, 1, 0.36, 1] }}
            >
              <Box
                as="span"
                aria-hidden
                position="absolute"
                left="-17.5px"
                top="50%"
                transform="translateY(-50%)"
                w="6px"
                h="6px"
                borderRadius="full"
                bg={i === 0 ? 'var(--accent)' : 'page.border-strong'}
                boxShadow="0 0 0 3px var(--chakra-colors-page-bg)"
              />
              <Flex align="center" gap={3} minW={0} w="100%">
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
                  {ICONS[eventKind(e.type)]}
                </Flex>
                <Text fontSize="sm" color="page.fg-secondary" noOfLines={1} lineHeight="1.4" flex="1" minW={0}>
                  {eventAction(e)}{' '}
                  {href ? (
                    <Link
                      href={href}
                      isExternal
                      color="page.fg"
                      fontFamily={monoFont}
                      fontSize="13px"
                      _hover={{ color: 'var(--accent)', textDecoration: 'none' }}
                      _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px', borderRadius: 'sm' }}
                    >
                      {repo}
                      <span className="sr-only"> (opens GitHub in a new tab)</span>
                    </Link>
                  ) : (
                    <Text as="span" color="page.fg" fontFamily={monoFont} fontSize="13px">
                      {repo}
                    </Text>
                  )}
                </Text>
                {when && (
                  <Text as="time" dateTime={e.created_at} flexShrink={0} fontFamily={monoFont} fontSize="11px" color="page.fg-secondary" title={new Date(e.created_at).toLocaleString()}>
                    {when}
                  </Text>
                )}
              </Flex>
            </MotionLi>
          )
        })}
      </Flex>
    </Box>
  )
}
