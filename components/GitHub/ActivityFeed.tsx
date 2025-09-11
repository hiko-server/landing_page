import React, { useEffect, useState } from 'react'
import { Box, Flex, HStack, Skeleton, Text, Badge } from '@chakra-ui/react'

type Event = {
  id: string
  type: string
  created_at: string
  repo?: { name: string }
  payload?: any
}

function formatEvent(e: Event): { title: string; url?: string } {
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
    default:
      return { title: `${e.type.replace(/Event$/, '')} in ${repo}` }
  }
}

export default function ActivityFeed() {
  const [events, setEvents] = useState<Event[] | null>(null)

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
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height="18px" />)}
      </Flex>
    )
  }
  if (!events.length) return null

  return (
    <Box>
      <Flex direction="column" gap={2}>
        {events.map((e) => {
          const { title } = formatEvent(e)
          return (
            <HStack key={e.id} spacing={3} align="center">
              <Badge colorScheme="blue">{new Date(e.created_at).toLocaleDateString()}</Badge>
              <Text fontSize="sm">{title}</Text>
            </HStack>
          )
        })}
      </Flex>
    </Box>
  )
}
