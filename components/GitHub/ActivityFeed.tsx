import { useEffect, useState } from 'react'
import { Badge, Box, Flex, HStack, Skeleton, Text, useColorModeValue } from '@chakra-ui/react'
import SectionStatusCard from '../General-UI/SectionStatusCard'
import { RemoteDataStatus } from '../../lib/github'

type Event = {
  id: string
  type: string
  created_at: string
  repo?: { name: string }
  payload?: any
}

function formatEvent(event: Event): { title: string } {
  const repo = event.repo?.name || 'the repository'

  switch (event.type) {
    case 'PushEvent': {
      const count = event.payload?.commits?.length || 1
      return { title: `Pushed ${count} commit${count > 1 ? 's' : ''} to ${repo}` }
    }
    case 'PullRequestEvent': {
      const action = event.payload?.action
      const number = event.payload?.number
      return { title: `${action === 'opened' ? 'Opened' : 'Updated'} PR #${number} in ${repo}` }
    }
    case 'IssuesEvent': {
      const action = event.payload?.action
      const number = event.payload?.issue?.number
      return { title: `${action === 'opened' ? 'Opened' : 'Updated'} issue #${number} in ${repo}` }
    }
    case 'CreateEvent': {
      const refType = event.payload?.ref_type
      return { title: `Created ${refType} in ${repo}` }
    }
    default:
      return { title: `${event.type.replace(/Event$/, '')} in ${repo}` }
  }
}

export default function ActivityFeed() {
  const [events, setEvents] = useState<Event[] | null>(null)
  const [status, setStatus] = useState<RemoteDataStatus>('ok')
  const [reloadKey, setReloadKey] = useState(0)
  const mutedText = useColorModeValue('gray.500', 'gray.400')

  useEffect(() => {
    let alive = true
    setStatus('ok')
    setEvents(null)

    fetch('/api/github/events')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Request failed')
        }
        const data = await response.json()
        if (alive) {
          setStatus((data.status as RemoteDataStatus) || 'ok')
          setEvents(Array.isArray(data.events) ? data.events : [])
        }
      })
      .catch(() => {
        if (alive) {
          setStatus('error')
          setEvents([])
        }
      })

    return () => {
      alive = false
    }
  }, [reloadKey])

  if (events === null) {
    return (
      <Flex direction="column" gap={3}>
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} height="20px" borderRadius="md" />
        ))}
      </Flex>
    )
  }

  if (status === 'error') {
    return (
      <SectionStatusCard
        title="Recent GitHub activity is unavailable"
        description="The latest public activity feed could not be loaded right now."
        actionLabel="Retry"
        onAction={() => setReloadKey((value) => value + 1)}
      />
    )
  }

  if (status === 'unconfigured') {
    return (
      <SectionStatusCard
        title="Recent GitHub activity is not configured"
        description="Add a GitHub profile to show recent public activity here."
      />
    )
  }

  if (!events.length) {
    return (
      <SectionStatusCard
        title="No recent public activity found"
        description="This feed will update when recent GitHub events are available."
      />
    )
  }

  return (
    <Box>
      <Flex direction="column" gap={3}>
        {events.map((event) => {
          const { title } = formatEvent(event)

          return (
            <HStack key={event.id} spacing={3} align="flex-start">
              <Badge colorScheme="blue" minW="92px" textAlign="center">
                {new Date(event.created_at).toLocaleDateString()}
              </Badge>
              <Box>
                <Text fontSize="sm">{title}</Text>
                <Text fontSize="xs" color={mutedText}>
                  Public GitHub event
                </Text>
              </Box>
            </HStack>
          )
        })}
      </Flex>
    </Box>
  )
}
