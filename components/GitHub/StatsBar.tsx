import React, { useEffect, useState } from 'react'
import {
  Flex,
  Skeleton,
  Stack,
  Stat,
  StatHelpText,
  StatLabel,
  StatNumber,
  useColorModeValue,
} from '@chakra-ui/react'
import SectionStatusCard from '../General-UI/SectionStatusCard'
import { RemoteDataStatus } from '../../lib/github'

type Stats = {
  status: RemoteDataStatus
  user: string
  public_repos: number
  followers: number
  total_stars: number
}

function useCountUp(target: number, ms = 800) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    let frame = 0
    const start = performance.now()

    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / ms)
      setValue(Math.round(target * (1 - Math.pow(1 - progress, 3))))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, ms])

  return value
}

function StatsSkeleton() {
  return (
    <Flex gap={[3, 6]} w="100%" maxW="1100px" mx="auto" justify="space-around">
      {Array.from({ length: 3 }).map((_, index) => (
        <Stack key={index} spacing={2} align="center" flex="1">
          <Skeleton height="14px" width="90px" borderRadius="md" />
          <Skeleton height="28px" width="70px" borderRadius="md" />
          <Skeleton height="12px" width="110px" borderRadius="md" />
        </Stack>
      ))}
    </Flex>
  )
}

function StatsContent({
  stats,
  label,
  help,
}: {
  stats: Stats
  label: string
  help: string
}) {
  const repos = useCountUp(stats.public_repos)
  const followers = useCountUp(stats.followers)
  const stars = useCountUp(stats.total_stars)

  return (
    <>
      <Stat textAlign="center">
        <StatLabel color={label}>Repositories</StatLabel>
        <StatNumber>{repos.toLocaleString()}</StatNumber>
        <StatHelpText color={help}>Public repositories</StatHelpText>
      </Stat>
      <Stat textAlign="center">
        <StatLabel color={label}>Followers</StatLabel>
        <StatNumber>{followers.toLocaleString()}</StatNumber>
        <StatHelpText color={help}>GitHub followers</StatHelpText>
      </Stat>
      <Stat textAlign="center">
        <StatLabel color={label}>Total Stars</StatLabel>
        <StatNumber>{stars.toLocaleString()}</StatNumber>
        <StatHelpText color={help}>Across public repos</StatHelpText>
      </Stat>
    </>
  )
}

export default function StatsBar() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    setStats(null)

    fetch('/api/github/stats')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Request failed')
        }
        const data = await response.json()
        if (alive) {
          setStats(data)
        }
      })
      .catch(() => {
        if (alive) {
          setStats({
            status: 'error',
            user: '',
            public_repos: 0,
            followers: 0,
            total_stars: 0,
          })
        }
      })

    return () => {
      alive = false
    }
  }, [reloadKey])

  const bg = useColorModeValue('white', 'gray.800')
  const border = useColorModeValue('gray.200', 'gray.700')
  const label = useColorModeValue('gray.600', 'gray.300')
  const help = useColorModeValue('gray.500', 'gray.400')

  if (stats === null) {
    return (
      <Flex
        gap={[3, 6]}
        w="100%"
        maxW="1100px"
        mx="auto"
        justify="space-around"
        p={4}
        borderWidth="1px"
        borderColor={border}
        borderRadius="2xl"
        bg={bg}
      >
        <StatsSkeleton />
      </Flex>
    )
  }

  if (stats.status === 'error') {
    return (
      <SectionStatusCard
        title="GitHub summary is temporarily unavailable"
        description="The public profile snapshot could not be loaded right now."
        actionLabel="Retry"
        onAction={() => setReloadKey((value) => value + 1)}
      />
    )
  }

  if (stats.status === 'unconfigured') {
    return (
      <SectionStatusCard
        title="GitHub summary is not configured"
        description="Add a GitHub profile to show repositories, followers, and star counts here."
      />
    )
  }

  return (
    <Flex
      gap={[3, 6]}
      w="100%"
      maxW="1100px"
      mx="auto"
      justify="space-around"
      p={4}
      borderWidth="1px"
      borderColor={border}
      borderRadius="2xl"
      bg={bg}
    >
      <StatsContent stats={stats} label={label} help={help} />
    </Flex>
  )
}
