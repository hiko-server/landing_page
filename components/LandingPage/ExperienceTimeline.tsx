import React, { useMemo } from 'react'
import { Box, Flex, Text, useColorModeValue } from '@chakra-ui/react'
import { motion } from 'framer-motion'

type Exp = {
  companyName: string
  jobTitle: string
  location: string
  startDate: string
  endDate: string
  jobDescription: string
}

/**
 * v6 Experience timeline.
 *
 * Replaces the orange/teal gradient rail + glass cards with a single
 * border-left vertical rule, monospace date labels, and clean
 * border-only entries. Indigo accent only on the milestone dot.
 */

export default function ExperienceTimeline({ cvEn }: { cvEn?: any[] }) {
  const dim = useColorModeValue('gray.600', 'gray.500')
  const fg = useColorModeValue('gray.800', 'gray.100')
  const border = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.10)')
  const rail = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.10)')
  const monoFont = 'var(--font-geist-mono), monospace'

  const list: Exp[] = useMemo(() => {
    if (!Array.isArray(cvEn)) return []
    const section = cvEn.find((s: any) => s.sessionName === 'workExperience')
    const items: Exp[] = section?.experiences || []
    return items.slice(0, 6)
  }, [cvEn])

  if (!list.length) return null

  return (
    <Box w="100%" maxW="900px" mx="auto" position="relative" pl={{ base: 6, md: 8 }}>
      {/* Vertical rail (flat, no gradient) */}
      <Box
        position="absolute"
        left={{ base: '10px', md: '12px' }}
        top="6px"
        bottom="6px"
        w="1px"
        bg={rail}
      />

      {list.map((e, idx) => (
        <Box
          as={motion.div as any}
          key={idx}
          initial={{ opacity: 0, x: -12 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.35, delay: idx * 0.06 } as any}
          position="relative"
          pb={idx === list.length - 1 ? 0 : 8}
        >
          {/* Milestone dot */}
          <Box
            position="absolute"
            left={{ base: '-22px', md: '-25px' }}
            top="6px"
            w="8px"
            h="8px"
            borderRadius="full"
            bg="var(--accent)"
            boxShadow="0 0 0 4px var(--background)"
            zIndex={1}
          />

          {/* Date range */}
          <Text
            fontFamily={monoFont}
            fontSize="11px"
            color={dim}
            letterSpacing="0.04em"
            mb={1.5}
          >
            {e.startDate}
            {e.endDate ? ` — ${e.endDate}` : ''}
          </Text>

          {/* Title + company */}
          <Text fontWeight={500} fontSize="16px" color={fg} letterSpacing="-0.005em" mb={0.5}>
            {e.jobTitle}
            <Text as="span" color={dim} mx={2}>
              ·
            </Text>
            <Text as="span" color={dim}>
              {e.companyName}
            </Text>
          </Text>

          {/* Location + description */}
          {(e.location || e.jobDescription) && (
            <Flex direction="column" gap={2} pt={2}>
              {e.location && (
                <Text fontFamily={monoFont} fontSize="11px" color={dim}>
                  {e.location}
                </Text>
              )}
              {e.jobDescription && (
                <Box
                  border="1px solid"
                  borderColor={border}
                  borderRadius="md"
                  p={3}
                  fontSize="13px"
                  color={dim}
                  lineHeight="1.6"
                  noOfLines={3}
                  bg="transparent"
                >
                  {e.jobDescription}
                </Box>
              )}
            </Flex>
          )}
        </Box>
      ))}
    </Box>
  )
}
