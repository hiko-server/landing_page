import React, { useEffect, useState } from 'react'
import { Box, Grid, Link, Text, Flex, Skeleton, useColorModeValue } from '@chakra-ui/react'
import { motion } from 'framer-motion'
import { FaStar, FaCodeBranch, FaExternalLinkAlt } from 'react-icons/fa'

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
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5',
  Go: '#00ADD8', Rust: '#dea584', HTML: '#e34c26', CSS: '#563d7c',
  Shell: '#89e051', Java: '#b07219', 'C++': '#f34b7d', Vue: '#41B883',
  Dart: '#00B4AB', Swift: '#ffac45', Kotlin: '#A97BFF',
}

export default function TopRepos() {
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const cardBg = useColorModeValue('rgba(255,255,255,0.65)', 'rgba(30,41,59,0.55)')
  const cardBorder = useColorModeValue('rgba(0,0,0,0.07)', 'rgba(255,255,255,0.09)')
  const nameColor = useColorModeValue('gray.800', 'white')
  const descColor = useColorModeValue('gray.600', 'gray.400')
  const metaColor = useColorModeValue('gray.500', 'gray.500')

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
      <Grid templateColumns={['1fr', 'repeat(2, 1fr)', 'repeat(3, 1fr)']} gap={4} w="100%">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height="120px" borderRadius="16px" />
        ))}
      </Grid>
    )
  }

  if (!repos.length) return null

  return (
    <Grid templateColumns={['1fr', 'repeat(2, 1fr)', 'repeat(3, 1fr)']} gap={4} w="100%">
      {repos.map((r, i) => {
        const langColor = r.language ? (LANG_COLORS[r.language] || '#6366f1') : '#6366f1'
        return (
          <Box
            as={motion.div as any}
            key={r.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35, delay: i * 0.05 } as any}
            whileHover={{ y: -4, boxShadow: '0 16px 36px rgba(0,0,0,0.15)' } as any}
            bg={cardBg}
            border="1px solid"
            borderColor={cardBorder}
            borderRadius="16px"
            p={4}
            backdropFilter="blur(8px)"
            position="relative"
            overflow="hidden"
            sx={{ transition: 'all 0.2s ease' }}
          >
            {/* Language color top bar */}
            <Box
              position="absolute"
              top={0} left={0} right={0}
              h="3px"
              bg={langColor}
              borderTopRadius="16px"
            />
            <Flex justify="space-between" align="flex-start" mb={2} mt={1}>
              <Link
                href={r.html_url}
                isExternal
                fontWeight="700"
                fontSize="sm"
                color={nameColor}
                fontFamily="'Sora', sans-serif"
                _hover={{ color: 'orange.400' }}
                noOfLines={1}
                maxW="85%"
              >
                {r.name}
              </Link>
              <Link href={r.html_url} isExternal color="gray.400" _hover={{ color: 'orange.400' }}>
                <FaExternalLinkAlt size={11} />
              </Link>
            </Flex>
            {r.description && (
              <Text fontSize="xs" color={descColor} noOfLines={2} lineHeight="1.6" mb={3}>
                {r.description}
              </Text>
            )}
            <Flex align="center" justify="space-between" mt="auto">
              <Flex align="center" gap={3}>
                <Flex align="center" gap={1}>
                  <FaStar size={11} color="#f59e0b" />
                  <Text fontSize="xs" color={metaColor}>{r.stargazers_count}</Text>
                </Flex>
                <Flex align="center" gap={1}>
                  <FaCodeBranch size={11} />
                  <Text fontSize="xs" color={metaColor}>{r.forks_count}</Text>
                </Flex>
              </Flex>
              {r.language && (
                <Flex align="center" gap={1}>
                  <Box w="8px" h="8px" borderRadius="full" bg={langColor} />
                  <Text fontSize="xs" color={metaColor}>{r.language}</Text>
                </Flex>
              )}
            </Flex>
          </Box>
        )
      })}
    </Grid>
  )
}
