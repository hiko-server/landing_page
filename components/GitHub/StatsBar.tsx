import React, { useEffect, useState } from 'react'
import { Box, Flex, Text, useColorModeValue } from '@chakra-ui/react'
import { motion } from 'framer-motion'

type Stats = {
  user: string
  public_repos: number
  followers: number
  total_stars: number
}

/** Eased count-up for the headline number on each stat tile. */
function useCountUp(target: number, ms = 900) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!target) return
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

/**
 * v6 StatsBar.
 * Replaces v5's three gradient-accented glass cards with one minimal row:
 * huge number + monospace label, separated only by a single horizontal rule.
 * Same visual language as Linear/Vercel team pages.
 */
const StatItem = ({
  label,
  value,
  delay,
}: {
  label: string
  value: number
  delay: number
}) => {
  const dim = useColorModeValue('gray.500', 'gray.500')
  const count = useCountUp(value)

  return (
    <Box
      as={motion.div as any}
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.35, delay } as any}
      flex={1}
      minW={0}
      textAlign={['center', 'left']}
    >
      <Text
        fontSize={{ base: '36px', md: '44px' }}
        lineHeight="1"
        fontWeight={500}
        letterSpacing="-0.03em"
      >
        {count.toLocaleString()}
      </Text>
      <Text
        mt={2}
        fontFamily="var(--font-geist-mono), monospace"
        fontSize="10px"
        letterSpacing="0.16em"
        textTransform="uppercase"
        color={dim}
      >
        {label}
      </Text>
    </Box>
  )
}

export default function StatsBar() {
  const [stats, setStats] = useState<Stats | null>(null)
  const border = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.10)')

  useEffect(() => {
    let alive = true
    fetch('/api/github/stats')
      .then((r) => r.json())
      .then((d) => {
        if (alive) setStats(d)
      })
      .catch(() => {
        if (alive)
          setStats({ user: '', public_repos: 0, followers: 0, total_stars: 0 })
      })
    return () => {
      alive = false
    }
  }, [])

  const s: Stats = stats || {
    user: '',
    public_repos: 0,
    followers: 0,
    total_stars: 0,
  }

  return (
    <Flex
      gap={[4, 8, 12]}
      w="100%"
      borderTop="1px solid"
      borderBottom="1px solid"
      borderColor={border}
      py={6}
      direction={['column', 'row']}
      align={['stretch', 'baseline']}
    >
      <StatItem label="Public repos" value={s.public_repos} delay={0} />
      <StatItem label="Followers" value={s.followers} delay={0.08} />
      <StatItem label="Total stars" value={s.total_stars} delay={0.16} />
    </Flex>
  )
}
