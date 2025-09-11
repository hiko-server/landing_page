import React, { useEffect, useState } from 'react'
import { Box, Grid, Link, Text, Badge, HStack, Skeleton, useColorModeValue } from '@chakra-ui/react'

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
  const linkColor = useColorModeValue('blue.600','blue.300')

  useEffect(() => {
    let alive = true
    fetch('/api/github/top-repos')
      .then(r => r.json())
      .then(d => { if (alive) setRepos(d.repos || []) })
      .catch(() => { if (alive) setRepos([]) })
    return () => { alive = false }
  }, [])

  if (repos === null) {
    return (
      <Grid templateColumns={["1fr", "repeat(3, 1fr)"]} gap={4} w="100%">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height="120px" borderRadius="md" />
        ))}
      </Grid>
    )
  }

  if (!repos.length) return null

  return (
    <Grid templateColumns={["1fr", "repeat(3, 1fr)"]} gap={4} w="100%">
      {repos.map((r) => (
        <Box key={r.id} p={4} borderWidth="1px" borderRadius="md" _hover={{ boxShadow: 'lg' }} transition="box-shadow .2s">
          <Link href={r.html_url} isExternal fontWeight="bold" color={linkColor}>{r.name}</Link>
          {r.description && <Text fontSize="sm" mt={2} noOfLines={2}>{r.description}</Text>}
          <HStack spacing={3} mt={3}>
            {r.language && <Badge colorScheme="purple">{r.language}</Badge>}
            <Badge colorScheme="yellow">★ {r.stargazers_count}</Badge>
            <Badge colorScheme="green">⑂ {r.forks_count}</Badge>
          </HStack>
          <Text fontSize="xs" color="gray.500" mt={2}>Updated {new Date(r.updated_at).toLocaleDateString()}</Text>
        </Box>
      ))}
    </Grid>
  )
}
