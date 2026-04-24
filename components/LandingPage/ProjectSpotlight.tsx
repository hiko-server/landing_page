import React, { useMemo, useState } from 'react'
import { Box, Flex, Heading, Text, useColorModeValue, Badge, Tag, TagLabel } from '@chakra-ui/react'
import { motion } from 'framer-motion'
import { FaChevronDown, FaChevronUp } from 'react-icons/fa'

type Feature = { description: string; furtherExplanation: string[] }
type Project = { title: string; startDate: string; endDate: string; projectLocation: string; description: string; features: Feature[] }

const ProjectCard = ({ p, i }: { p: Project; i: number }) => {
  const [expanded, setExpanded] = useState(false)
  const cardBg = useColorModeValue('rgba(255,255,255,0.7)', 'rgba(30,41,59,0.6)')
  const cardBorder = useColorModeValue('rgba(221,107,32,0.15)', 'rgba(249,115,22,0.18)')
  const dim = useColorModeValue('gray.600', 'gray.400')
  const accentColors = ['orange', 'teal', 'blue', 'purple', 'cyan', 'pink']
  const color = accentColors[i % accentColors.length]

  return (
    <Box
      as={motion.div as any}
      minW={{ base: '270px', md: '300px' }}
      maxW="360px"
      bg={cardBg}
      border="1px solid"
      borderColor={cardBorder}
      borderRadius="18px"
      p={5}
      backdropFilter="blur(8px)"
      cursor="pointer"
      flexShrink={0}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: i * 0.07 } as any}
      whileHover={{ y: -6, boxShadow: '0 20px 40px rgba(221,107,32,0.15)' } as any}
      onClick={() => setExpanded(v => !v)}
      position="relative"
      overflow="hidden"
    >
      {/* Accent top bar */}
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        h="3px"
        bgGradient={`linear(to-r, ${color}.400, ${color}.200)`}
        borderTopRadius="18px"
      />
      <Flex justify="space-between" align="flex-start" mt={2}>
        <Badge colorScheme={color} variant="subtle" px={2} py={0.5} borderRadius="full" fontSize="xs" mb={2}>
          Project
        </Badge>
        <Tag size="sm" colorScheme="gray" variant="outline" borderRadius="full">
          <TagLabel>{p.startDate}{p.endDate && p.endDate !== p.startDate ? ` — ${p.endDate}` : ''}</TagLabel>
        </Tag>
      </Flex>
      <Heading size="sm" mb={2} fontFamily="'Sora', sans-serif" lineHeight="1.4">
        {p.title}
      </Heading>
      {p.description && (
        <Text fontSize="sm" color={dim} noOfLines={expanded ? undefined : 3} lineHeight="1.7">
          {p.description}
        </Text>
      )}
      {p.projectLocation && (
        <Text fontSize="xs" color={dim} mt={2} opacity={0.7}>
          📍 {p.projectLocation}
        </Text>
      )}
      {expanded && p.features?.length > 0 && (
        <Box mt={3}>
          {p.features.slice(0, 3).map((f, fi) => (
            <Text key={fi} fontSize="xs" color={dim} pl={3} borderLeft="2px solid" borderColor={`${color}.300`} mb={1} lineHeight="1.6">
              {f.description}
            </Text>
          ))}
        </Box>
      )}
      <Flex align="center" justify="flex-end" mt={3} gap={1} opacity={0.6}>
        {expanded ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
        <Text fontSize="xs">{expanded ? 'Less' : 'More'}</Text>
      </Flex>
    </Box>
  )
}

export default function ProjectSpotlight({ cvEn }: { cvEn?: any[] }) {
  const projects: Project[] = useMemo(() => {
    if (!Array.isArray(cvEn)) return []
    const section = cvEn.find((s: any) => s.sessionName === 'project')
    const list: Project[] = section?.projectExperience || []
    return list.slice(0, 6)
  }, [cvEn])

  if (!projects.length) return null

  return (
    <Box w="100%" maxW="1100px" overflowX="auto" pb={2}>
      <Flex gap={4} pb={2} w="max-content">
        {projects.map((p, i) => (
          <ProjectCard key={i} p={p} i={i} />
        ))}
      </Flex>
    </Box>
  )
}

