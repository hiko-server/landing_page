import React, { useEffect, useState } from 'react'
import { Box, Flex, Skeleton, Text, useColorModeValue } from '@chakra-ui/react'
import { motion } from 'framer-motion'
import { FaCode, FaCodeBranch, FaExclamationCircle, FaPlus, FaBolt } from 'react-icons/fa'

type Event = {
  id: string
  type: string
  created_at: string
  repo?: { name: string }
  payload?: any
}

function formatEvent(e: Event): { title: string } {
  const repo = e.repo?.name || ''
  switch (e.type) {
    case 'PushEvent': {
      const count = e.payload?.commits?.length || 1
      return { title: `Pushed ${count} commit${count > 1 ? 's' : ''} to ${repo}` }
    }
    case 'PullRequestEvent': {
      const action = e.payload?.action
      const num = e.payload?.number
      return { title: `${action === 'opened' ? 'Opened' : 'Updated'} PR #${num} in ${repo}` }
    }
    case 'IssuesEvent': {
      const action = e.payload?.action
      const num = e.payload?.issue?.number
      return { title: `${action === 'opened' ? 'Opened' : 'Updated'} issue #${num} in ${repo}` }
    }
    case 'CreateEvent': {
      const refType = e.payload?.ref_type
      return { title: `Created ${refType} in ${repo}` }
    }
    case 'RepoUpdateEvent': {
      return { title: `Updated ${repo}` }
    }
    default:
      return { title: `${e.type.replace(/Event$/, '')} in ${repo}` }
  }
}

function eventIcon(type: string) {
  if (type === 'PushEvent') return <FaCode size={12} />
  if (type === 'PullRequestEvent') return <FaCodeBranch size={12} />
  if (type === 'IssuesEvent') return <FaExclamationCircle size={12} />
  if (type === 'CreateEvent') return <FaPlus size={12} />
  if (type === 'RepoUpdateEvent') return <FaCodeBranch size={12} />
  return <FaBolt size={12} />
}

function eventGradient(type: string) {
  if (type === 'PushEvent') return 'linear-gradient(135deg,#dd6b20,#f59e0b)'
  if (type === 'PullRequestEvent') return 'linear-gradient(135deg,#0f766e,#14b8a6)'
  if (type === 'IssuesEvent') return 'linear-gradient(135deg,#dc2626,#f87171)'
  if (type === 'CreateEvent') return 'linear-gradient(135deg,#7c3aed,#a78bfa)'
  if (type === 'RepoUpdateEvent') return 'linear-gradient(135deg,#0ea5e9,#38bdf8)'
  return 'linear-gradient(135deg,#2563eb,#60a5fa)'
}

export default function ActivityFeed() {
  const [events, setEvents] = useState<Event[] | null>(null)
  const lineColor = useColorModeValue('gray.100', 'gray.700')
  const textColor = useColorModeValue('gray.700', 'gray.300')
  const metaColor = useColorModeValue('gray.600', 'gray.500')

  useEffect(() => {
    let alive = true
    fetch('/api/github/events')
      .then(r => r.json())
      .then(d => { if (alive) setEvents(d.events || []) })
      .catch(() => { if (alive) setEvents([]) })
    return () => { alive = false }
  }, [])

  if (events === null) {
    return (
      <Flex direction="column" gap={3}>
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height="36px" borderRadius="12px" />)}
      </Flex>
    )
  }
  if (!events.length) {
    return (
      <Text fontSize="sm" color={metaColor}>
        No recent GitHub activity to show.
      </Text>
    )
  }

  return (
    <Box position="relative" pl={7}>
      <Box
        position="absolute"
        left="13px"
        top={2}
        bottom={2}
        w="2px"
        bg={lineColor}
        borderRadius="2px"
      />
      <Flex direction="column" gap={3}>
        {events.map((e, i) => {
          const { title } = formatEvent(e)
          const gradient = eventGradient(e.type)
          const date = new Date(e.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          return (
            <Box
              as={motion.div as any}
              key={e.id}
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.04 } as any}
              position="relative"
            >
              <Box
                position="absolute"
                left="-22px"
                top="50%"
                transform="translateY(-50%)"
                w="8px"
                h="8px"
                borderRadius="full"
                bgImage={gradient}
                zIndex={1}
              />
              <Flex align="center" gap={2}>
                <Box
                  p={1}
                  borderRadius="6px"
                  bgImage={gradient}
                  color="white"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  flexShrink={0}
                >
                  {eventIcon(e.type)}
                </Box>
                <Flex direction="column" flex={1} minW={0}>
                  <Text fontSize="sm" color={textColor} noOfLines={1} lineHeight="1.4">{title}</Text>
                  <Text fontSize="xs" color={metaColor}>{date}</Text>
                </Flex>
              </Flex>
            </Box>
          )
        })}
      </Flex>
    </Box>
  )
}
