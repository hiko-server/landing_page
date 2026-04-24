import React, { useEffect, useMemo, useState } from 'react'
import { Box, Flex, Skeleton, Text, useColorModeValue } from '@chakra-ui/react'
import { motion } from 'framer-motion'

type LangData = { total: number; breakdown: Record<string, number> }

function colorFor(lang: string): string {
  // quick color map for common languages; fallback blue
  const m: Record<string, string> = {
    TypeScript: '#3178c6',
    JavaScript: '#f1e05a',
    Python: '#3572A5',
    Go: '#00ADD8',
    Rust: '#dea584',
    HTML: '#e34c26',
    CSS: '#563d7c',
    Shell: '#89e051',
    Java: '#b07219',
    C: '#555555',
    'C++': '#f34b7d',
    'C#': '#178600',
    PHP: '#4F5D95',
    Swift: '#ffac45',
    Kotlin: '#A97BFF',
    Dart: '#00B4AB',
    Vue: '#41B883',
    Svelte: '#FF3E00',
    Ruby: '#701516',
    Solidity: '#3c3c3d',
  }
  return m[lang] || '#3b82f6'
}

export default function LanguageBars() {
  const [data, setData] = useState<LangData | null>(null)
  const trackBg = useColorModeValue('rgba(0,0,0,0.06)', 'rgba(255,255,255,0.07)')
  const textColor = useColorModeValue('gray.700', 'gray.300')
  const metaColor = useColorModeValue('gray.500', 'gray.500')

  useEffect(() => {
    let alive = true
    fetch('/api/github/languages')
      .then(r => r.json())
      .then(d => { if (alive) setData(d) })
      .catch(() => { if (alive) setData({ total: 0, breakdown: {} }) })
    return () => { alive = false }
  }, [])

  const items = useMemo(() => {
    if (!data || !data.total) return [] as Array<{ name: string; bytes: number; pct: number }>
    const entries = Object.entries(data.breakdown)
      .map(([name, bytes]) => ({ name, bytes, pct: (bytes / data.total) * 100 }))
      .sort((a, b) => b.bytes - a.bytes)
    return entries.slice(0, 10)
  }, [data])

  if (!data) {
    return (
      <Flex direction="column" gap={3}>
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height="20px" borderRadius="full" />)}
      </Flex>
    )
  }

  if (!data.total || items.length === 0) return null

  return (
    <Box>
      <Flex direction="column" gap={3}>
        {items.map(({ name, pct }, idx) => (
          <Box
            as={motion.div as any}
            key={name}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35, delay: idx * 0.06 } as any}
          >
            <Flex align="center" justify="space-between" mb={1}>
              <Flex align="center" gap={2}>
                <Box w="10px" h="10px" borderRadius="full" bg={colorFor(name)} flexShrink={0} />
                <Text fontSize="sm" fontWeight="600" color={textColor}>{name}</Text>
              </Flex>
              <Text fontSize="xs" color={metaColor} sx={{ fontVariantNumeric: 'tabular-nums' }}>{pct.toFixed(1)}%</Text>
            </Flex>
            <Box w="100%" h="6px" bg={trackBg} borderRadius="full" overflow="hidden">
              <Box
                as={motion.div as any}
                initial={{ width: '0%' }}
                whileInView={{ width: `${pct}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: idx * 0.06, ease: 'easeOut' } as any}
                h="100%"
                bg={colorFor(name)}
                borderRadius="full"
              />
            </Box>
          </Box>
        ))}
      </Flex>
    </Box>
  )
}
