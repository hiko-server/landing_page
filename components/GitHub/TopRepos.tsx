import React, { useEffect, useState } from 'react'
import { Box, Grid, Link, Text, Flex, Skeleton, useColorModeValue } from '@chakra-ui/react'
import { motion } from 'framer-motion'
import { FaStar, FaCodeBranch } from 'react-icons/fa'

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

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  Java: '#b07219',
  'C++': '#f34b7d',
  Vue: '#41B883',
  Dart: '#00B4AB',
  Swift: '#ffac45',
  Kotlin: '#A97BFF',
}

/**
 * v6 TopRepos.
 *
 * Replaces v5's gradient-bar glass cards with a flat 3-up grid of
 * minimal repo tiles. Border becomes accent on focus/hover, language
 * indicator is a single dot in canonical GitHub language colour.
 */
export default function TopRepos() {
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const cardBorder = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.10)')
  const cardBorderHover = useColorModeValue('rgba(0,0,0,0.20)', 'rgba(255,255,255,0.24)')
  const nameColor = useColorModeValue('gray.800', 'gray.100')
  const descColor = useColorModeValue('gray.600', 'gray.400')
  const metaColor = useColorModeValue('gray.600', 'gray.500')
  const monoFont = 'var(--font-geist-mono), monospace'

  useEffect(() => {
    let alive = true
    fetch('/api/github/top-repos')
      .then((r) => r.json())
      .then((d) => {
        if (alive) setRepos(d.repos || [])
      })
      .catch(() => {
        if (alive) setRepos([])
      })
    return () => {
      alive = false
    }
  }, [])

  if (repos === null) {
    return (
      <Grid templateColumns={['1fr', 'repeat(2, 1fr)', 'repeat(3, 1fr)']} gap={4} w="100%">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height="120px" borderRadius="lg" />
        ))}
      </Grid>
    )
  }

  if (!repos.length) return null

  return (
    <Grid templateColumns={['1fr', 'repeat(2, 1fr)', 'repeat(3, 1fr)']} gap={4} w="100%">
      {repos.map((r, i) => {
        const langColor = r.language ? LANG_COLORS[r.language] || 'var(--accent)' : 'var(--accent)'
        return (
          <Link
            key={r.id}
            href={r.html_url}
            isExternal
            _hover={{ textDecoration: 'none' }}
            as={motion.a as any}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: i * 0.04 } as any}
            display="block"
            border="1px solid"
            borderColor={cardBorder}
            borderRadius="lg"
            p={4}
            position="relative"
            sx={{
              transition:
                'border-color 250ms var(--ease-out-quart), transform 250ms var(--ease-out-quart)',
              '&:hover': { borderColor: cardBorderHover, transform: 'translateY(-2px)' },
              '&:focus-visible': { borderColor: 'var(--accent)' },
            }}
          >
            <Flex justify="space-between" align="baseline" mb={2}>
              <Text
                fontWeight={500}
                fontSize="14px"
                color={nameColor}
                noOfLines={1}
                fontFamily={monoFont}
              >
                {r.name}
              </Text>
              <Text fontFamily={monoFont} fontSize="10px" color={metaColor}>
                ↗
              </Text>
            </Flex>
            {r.description && (
              <Text
                fontSize="13px"
                color={descColor}
                noOfLines={2}
                lineHeight="1.55"
                mb={3}
                minH="38px"
              >
                {r.description}
              </Text>
            )}
            <Flex
              align="center"
              justify="space-between"
              fontFamily={monoFont}
              fontSize="11px"
              color={metaColor}
            >
              <Flex align="center" gap={3}>
                <Flex align="center" gap={1}>
                  <FaStar size={10} />
                  <Text>{r.stargazers_count}</Text>
                </Flex>
                <Flex align="center" gap={1}>
                  <FaCodeBranch size={10} />
                  <Text>{r.forks_count}</Text>
                </Flex>
              </Flex>
              {r.language && (
                <Flex align="center" gap={1.5}>
                  <Box w="6px" h="6px" borderRadius="full" bg={langColor} />
                  <Text>{r.language}</Text>
                </Flex>
              )}
            </Flex>
          </Link>
        )
      })}
    </Grid>
  )
}
