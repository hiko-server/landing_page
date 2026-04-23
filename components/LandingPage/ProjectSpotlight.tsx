import { useMemo } from 'react'
import { Box, Flex, Heading, Text, useColorModeValue } from '@chakra-ui/react'
import { motion } from 'framer-motion'

type Feature = { description: string; furtherExplanation: string[] }
type Project = { title: string; startDate: string; endDate: string; projectLocation: string; description: string; features: Feature[] }

export default function ProjectSpotlight({ cvEn }: { cvEn?: any[] }) {
  const cardBg = useColorModeValue('white','gray.800')
  const border = useColorModeValue('gray.200','gray.700')
  const color = useColorModeValue('gray.800','gray.100')

  const projects: Project[] = useMemo(() => {
    if (!Array.isArray(cvEn)) return []
    const section = cvEn.find((s: any) => s.sessionName === 'project')
    const list: Project[] = section?.projectExperience || []
    return list.slice(0, 6)
  }, [cvEn])

  if (!projects.length) return null
  return (
    <Flex overflowX="auto" gap={4} pb={2} w="100%" maxW="1100px">
      {projects.map((p, i) => (
        <Box
          as={motion.div}
          key={i}
          minW={{ base: '260px', md: '320px' }}
          maxW="360px"
          p={5}
          bg={cardBg}
          color={color}
          borderWidth="1px"
          borderColor={border}
          borderRadius="lg"
          whileHover={{ y: -6, scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Heading size="sm" mb={2}>{p.title}</Heading>
          {p.description && <Text fontSize="sm" noOfLines={3}>{p.description}</Text>}
          <Text fontSize="xs" opacity={0.7} mt={2}>{p.projectLocation}</Text>
        </Box>
      ))}
    </Flex>
  )
}
