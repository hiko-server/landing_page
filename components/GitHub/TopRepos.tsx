import { useEffect, useState } from 'react'
import {
  Badge,
  Box,
  Grid,
  HStack,
  Link,
  Skeleton,
  Stack,
  Text,
  useColorModeValue,
} from '@chakra-ui/react'
import SectionStatusCard from '../General-UI/SectionStatusCard'
import { RemoteDataStatus } from '../../lib/github'

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

export default function TopRepos() {
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [status, setStatus] = useState<RemoteDataStatus>('ok')
  const [reloadKey, setReloadKey] = useState(0)
  const linkColor = useColorModeValue('blue.600', 'blue.300')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const cardBg = useColorModeValue('white', 'gray.800')
  const mutedText = useColorModeValue('gray.500', 'gray.400')

  useEffect(() => {
    let alive = true
    setStatus('ok')
    setRepos(null)

    fetch('/api/github/top-repos')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Request failed')
        }
        const data = await response.json()
        if (alive) {
          setStatus((data.status as RemoteDataStatus) || 'ok')
          setRepos(Array.isArray(data.repos) ? data.repos : [])
        }
      })
      .catch(() => {
        if (alive) {
          setStatus('error')
          setRepos([])
        }
      })

    return () => {
      alive = false
    }
  }, [reloadKey])

  if (repos === null) {
    return (
      <Grid templateColumns={['1fr', 'repeat(3, 1fr)']} gap={4} w="100%">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} height="140px" borderRadius="2xl" />
        ))}
      </Grid>
    )
  }

  if (status === 'error') {
    return (
      <SectionStatusCard
        title="Top repositories are temporarily unavailable"
        description="GitHub highlights could not be loaded right now. You can retry in a moment."
        actionLabel="Retry"
        onAction={() => setReloadKey((value) => value + 1)}
      />
    )
  }

  if (status === 'unconfigured') {
    return (
      <SectionStatusCard
        title="Top repositories are not configured"
        description="Add a GitHub profile to show featured public repositories here."
      />
    )
  }

  if (!repos.length) {
    return (
      <SectionStatusCard
        title="No repository highlights yet"
        description="This section will show featured public repositories once repository data is available."
      />
    )
  }

  return (
    <Grid templateColumns={['1fr', 'repeat(3, 1fr)']} gap={4} w="100%">
      {repos.map((repo) => (
        <Box
          key={repo.id}
          p={4}
          borderWidth="1px"
          borderColor={borderColor}
          borderRadius="2xl"
          bg={cardBg}
          _hover={{ boxShadow: 'lg', transform: 'translateY(-2px)' }}
          transition="box-shadow .2s ease, transform .2s ease"
        >
          <Stack spacing={3}>
            <Link href={repo.html_url} isExternal fontWeight="bold" color={linkColor}>
              {repo.name}
            </Link>
            <Text fontSize="sm" minH="40px" noOfLines={2}>
              {repo.description || 'Public repository with recent development activity.'}
            </Text>
            <HStack spacing={2} flexWrap="wrap">
              {repo.language ? <Badge colorScheme="purple">{repo.language}</Badge> : null}
              <Badge colorScheme="yellow">★ {repo.stargazers_count}</Badge>
              <Badge colorScheme="green">Forks {repo.forks_count}</Badge>
            </HStack>
            <Text fontSize="xs" color={mutedText}>
              Updated {new Date(repo.updated_at).toLocaleDateString()}
            </Text>
          </Stack>
        </Box>
      ))}
    </Grid>
  )
}
