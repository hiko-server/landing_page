import React, { useEffect, useState } from 'react'
import { Box, Flex, Text, useColorModeValue } from '@chakra-ui/react'
import { motion } from 'framer-motion'
import { FaCodeBranch, FaUserFriends, FaStar } from 'react-icons/fa'

type Stats = { user: string; public_repos: number; followers: number; total_stars: number }

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

const StatCard = ({
  icon,
  label,
  value,
  gradient,
  delay,
}: {
  icon: React.ReactNode
  label: string
  value: number
  gradient: string
  delay: number
}) => {
  const bg = useColorModeValue('rgba(255,255,255,0.6)', 'rgba(30,41,59,0.5)')
  const border = useColorModeValue('rgba(0,0,0,0.06)', 'rgba(255,255,255,0.08)')
  const labelColor = useColorModeValue('gray.500', 'gray.400')
  const count = useCountUp(value)

  return (
    <Box
      as={motion.div as any}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay } as any}
      flex={1}
      minW={0}
      bg={bg}
      border="1px solid"
      borderColor={border}
      borderRadius="16px"
      p={4}
      backdropFilter="blur(8px)"
      textAlign="center"
      position="relative"
      overflow="hidden"
      _hover={{ transform: 'translateY(-3px)', boxShadow: '0 12px 28px rgba(0,0,0,0.15)' }}
      sx={{ transition: 'all 0.2s ease' }}
    >
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        h="3px"
        bgImage={gradient}
        borderTopRadius="16px"
      />
      <Flex justify="center" mb={2}>
        <Box
          p={2}
          borderRadius="full"
          bgImage={gradient}
          color="white"
          fontSize="sm"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          {icon}
        </Box>
      </Flex>
      <Text fontSize="2xl" fontWeight="800" fontFamily="'Sora', sans-serif" bgImage={gradient} bgClip="text" sx={{ WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        {count.toLocaleString()}
      </Text>
      <Text fontSize="xs" fontWeight="600" color={labelColor} mt={1} letterSpacing="0.06em" textTransform="uppercase">
        {label}
      </Text>
    </Box>
  )
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

  const s: Stats = stats || { user: '', public_repos: 0, followers: 0, total_stars: 0 }

  return (
    <Flex gap={3} w="100%" mx="auto" justify="stretch">
      <StatCard icon={<FaCodeBranch />} label="Repositories" value={s.public_repos} gradient="linear-gradient(135deg,#dd6b20,#f59e0b)" delay={0} />
      <StatCard icon={<FaUserFriends />} label="Followers" value={s.followers} gradient="linear-gradient(135deg,#0f766e,#14b8a6)" delay={0.08} />
      <StatCard icon={<FaStar />} label="Total Stars" value={s.total_stars} gradient="linear-gradient(135deg,#7c3aed,#a78bfa)" delay={0.16} />
    </Flex>
  )
}
