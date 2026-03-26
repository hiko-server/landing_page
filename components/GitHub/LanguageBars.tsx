import React, { useEffect, useMemo, useState } from 'react'
import { Box, Flex, Heading, HStack, Skeleton, Text, useColorModeValue } from '@chakra-ui/react'

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
  const headingColor = useColorModeValue('blue.700','blue.200')

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
      <HStack spacing={4} w="100%">
        <Skeleton height="20px" flex="1" />
        <Skeleton height="20px" flex="1" />
        <Skeleton height="20px" flex="1" />
      </HStack>
    )
  }

  if (!data.total || items.length === 0) return null

  return (
    <Box>
      <Heading as="h4" size="sm" mb={3} color={headingColor}>GitHub Languages</Heading>
      <Flex direction="column" gap={2}>
        {items.map(({ name, pct, bytes }) => (
          <Box key={name}>
            <Flex align="center" justify="space-between" mb={1}>
              <Text fontSize="sm" fontWeight="medium">{name}</Text>
              <Text fontSize="xs" color="gray.500">{pct.toFixed(1)}% · {bytes.toLocaleString()} bytes</Text>
            </Flex>
            <Box w="100%" h="8px" bg="gray.100" borderRadius="md" overflow="hidden">
              <Box w={`${pct}%`} h="100%" bg={colorFor(name)} />
            </Box>
          </Box>
        ))}
      </Flex>
    </Box>
  )
}
