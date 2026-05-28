import React, { useMemo, useState } from 'react'
import { Box, Flex, Text, useColorModeValue } from '@chakra-ui/react'
import { motion } from 'framer-motion'
import { FaChevronDown, FaChevronUp } from 'react-icons/fa'

type Feature = { description: string; furtherExplanation: string[] }
type Project = {
  title: string
  startDate: string
  endDate: string
  projectLocation: string
  description: string
  features: Feature[]
}

/**
 * v6 ProjectSpotlight.
 *
 * Replaces v5's rainbow-rotating gradient cards with a single style:
 * subtle border, monospace metadata header, accent only on hover/expand.
 * Same horizontal-scroll layout, same click-to-expand interaction.
 */

const ProjectCard = ({ p, i }: { p: Project; i: number }) => {
  const [expanded, setExpanded] = useState(false)
  const border = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.10)')
  const borderHover = useColorModeValue('rgba(0,0,0,0.20)', 'rgba(255,255,255,0.24)')
  const fg = useColorModeValue('gray.800', 'gray.100')
  const dim = useColorModeValue('gray.600', 'gray.400')
  const muted = useColorModeValue('gray.600', 'gray.500')
  const monoFont = 'var(--font-geist-mono), monospace'

  return (
    <Box
      as={motion.div as any}
      minW={{ base: '270px', md: '320px' }}
      maxW="380px"
      border="1px solid"
      borderColor={border}
      borderRadius="lg"
      p={5}
      cursor="pointer"
      flexShrink={0}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.35, delay: i * 0.05 } as any}
      onClick={() => setExpanded((v) => !v)}
      position="relative"
      sx={{
        '&:hover': { borderColor: borderHover },
        '&:focus-visible': { borderColor: 'var(--accent)', outline: 'none' },
      }}
    >
      {/* Metadata header */}
      <Flex
        justify="space-between"
        align="baseline"
        mb={3}
        fontFamily={monoFont}
        fontSize="11px"
        color={muted}
        letterSpacing="0.04em"
      >
        <Text>
          {p.startDate}
          {p.endDate && p.endDate !== p.startDate ? ` — ${p.endDate}` : ''}
        </Text>
        <Text>Project</Text>
      </Flex>

      {/* Title */}
      <Text fontWeight={500} fontSize="17px" lineHeight="1.3" color={fg} mb={2}>
        {p.title}
      </Text>

      {/* Description */}
      {p.description && (
        <Text fontSize="13px" color={dim} noOfLines={expanded ? undefined : 3} lineHeight="1.65">
          {p.description}
        </Text>
      )}

      {/* Location (no emoji decoration) */}
      {p.projectLocation && (
        <Text
          fontFamily={monoFont}
          fontSize="11px"
          color={muted}
          mt={3}
          letterSpacing="0.04em"
        >
          {p.projectLocation}
        </Text>
      )}

      {/* Expanded features */}
      {expanded && p.features?.length > 0 && (
        <Box mt={4} pt={3} borderTop="1px solid" borderColor={border}>
          {p.features.slice(0, 3).map((f, fi) => (
            <Text
              key={fi}
              fontSize="12px"
              color={dim}
              pl={3}
              borderLeft="2px solid"
              borderColor="var(--accent)"
              mb={2}
              lineHeight="1.55"
            >
              {f.description}
            </Text>
          ))}
        </Box>
      )}

      {/* Expand control */}
      <Flex
        align="center"
        justify="flex-end"
        mt={3}
        gap={1}
        fontFamily={monoFont}
        fontSize="11px"
        color={muted}
      >
        {expanded ? <FaChevronUp size={10} /> : <FaChevronDown size={10} />}
        <Text>{expanded ? 'less' : 'more'}</Text>
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
