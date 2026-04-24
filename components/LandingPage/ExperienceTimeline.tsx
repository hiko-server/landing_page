import React, { useMemo } from 'react'
import { Box, Flex, Heading, Text, useColorModeValue, Badge, Tag } from '@chakra-ui/react'
import { motion } from 'framer-motion'

type Exp = { companyName: string; jobTitle: string; location: string; startDate: string; endDate: string; jobDescription: string }

export default function ExperienceTimeline({ cvEn }: { cvEn?: any[] }) {
  const lineColor = useColorModeValue('linear-gradient(180deg,#dd6b20,#f59e0b,#0f766e)', 'linear-gradient(180deg,#f97316,#fbbf24,#14b8a6)')
  const dim = useColorModeValue('gray.500', 'gray.400')
  const cardBg = useColorModeValue('rgba(255,255,255,0.7)', 'rgba(30,41,59,0.6)')
  const cardBorder = useColorModeValue('rgba(221,107,32,0.2)', 'rgba(249,115,22,0.2)')
  const dotBg = useColorModeValue('white', 'gray.900')

  const list: Exp[] = useMemo(() => {
    if (!Array.isArray(cvEn)) return []
    const section = cvEn.find((s: any) => s.sessionName === 'workExperience')
    const items: Exp[] = section?.experiences || []
    return items.slice(0, 6)
  }, [cvEn])

  if (!list.length) return null

  return (
    <Box w="100%" maxW="1100px" position="relative" pl={{ base: 8, md: 10 }}>
      {/* Gradient timeline line */}
      <Box
        position="absolute"
        left={{ base: '14px', md: '16px' }}
        top="4px"
        bottom="4px"
        w="2px"
        bgImage={lineColor}
        borderRadius="2px"
      />
      {list.map((e, idx) => (
        <Box
          as={motion.div as any}
          key={idx}
          initial={{ opacity: 0, x: -16 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.4, delay: idx * 0.08 } as any}
          position="relative"
          mb={6}
        >
          {/* Timeline dot */}
          <Box
            position="absolute"
            left={{ base: '-28px', md: '-34px' }}
            top="14px"
            w="10px"
            h="10px"
            borderRadius="full"
            bg={dotBg}
            border="2px solid"
            borderColor="orange.400"
            boxShadow="0 0 0 3px rgba(221,107,32,0.2)"
            zIndex={1}
          />
          <Box
            bg={cardBg}
            border="1px solid"
            borderColor={cardBorder}
            borderRadius="14px"
            p={{ base: 4, md: 5 }}
            backdropFilter="blur(8px)"
            _hover={{ borderColor: 'orange.300', boxShadow: '0 8px 24px rgba(221,107,32,0.12)', transform: 'translateY(-2px)', transition: 'all 0.2s ease' }}
            transition="all 0.2s ease"
          >
            <Flex align="center" justify="space-between" flexWrap="wrap" gap={2} mb={1}>
              <Heading size="sm" fontFamily="'Sora', sans-serif">
                {e.jobTitle}
              </Heading>
              <Badge
                colorScheme="orange"
                variant="subtle"
                px={3}
                py={1}
                borderRadius="full"
                fontSize="xs"
                fontWeight="600"
              >
                {e.startDate} — {e.endDate}
              </Badge>
            </Flex>
            <Flex align="center" gap={2} mb={2}>
              <Tag size="sm" colorScheme="teal" variant="subtle" borderRadius="full">{e.companyName}</Tag>
              {e.location && <Text fontSize="xs" color={dim}>{e.location}</Text>}
            </Flex>
            {e.jobDescription && (
              <Text fontSize="sm" color={dim} lineHeight="1.7" mt={1} noOfLines={3}>
                {e.jobDescription}
              </Text>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  )
}
