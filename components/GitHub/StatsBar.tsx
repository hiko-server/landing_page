import React, { useEffect, useState } from 'react'
import { Flex, Stat, StatLabel, StatNumber, useColorModeValue } from '@chakra-ui/react'

type Stats = { user: string; public_repos: number; followers: number; total_stars: number }

function useCountUp(target: number, ms = 800) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms)
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return val
}

export default function StatsBar() {
  const [stats, setStats] = useState<Stats | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/github/stats')
      .then((r) => r.json())
      .then((d) => { if (alive) setStats(d) })
      .catch(() => { if (alive) setStats({ user: '', public_repos: 0, followers: 0, total_stars: 0 }) })
    return () => { alive = false }
  }, [])

  const bg = useColorModeValue('white','gray.800')
  const border = useColorModeValue('gray.200','gray.700')
  const label = useColorModeValue('gray.600','gray.300')

  const s: Stats = stats || { user: '', public_repos: 0, followers: 0, total_stars: 0 }
  const repos = useCountUp(s.public_repos)
  const followers = useCountUp(s.followers)
  const stars = useCountUp(s.total_stars)

  return (
    <Flex gap={[3,6]} w="100%" maxW="1100px" mx="auto" justify="space-around" p={4} borderWidth="1px" borderColor={border} borderRadius="lg" bg={bg}>
      <Stat textAlign="center">
        <StatLabel color={label}>Repositories</StatLabel>
        <StatNumber>{repos.toLocaleString()}</StatNumber>
      </Stat>
      <Stat textAlign="center">
        <StatLabel color={label}>Followers</StatLabel>
        <StatNumber>{followers.toLocaleString()}</StatNumber>
      </Stat>
      <Stat textAlign="center">
        <StatLabel color={label}>Total Stars</StatLabel>
        <StatNumber>{stars.toLocaleString()}</StatNumber>
      </Stat>
    </Flex>
  )
}
