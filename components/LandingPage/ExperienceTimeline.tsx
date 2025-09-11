import React, { useMemo } from 'react'
import { Box, Flex, Heading, Text, useColorModeValue } from '@chakra-ui/react'

type Exp = { companyName: string; jobTitle: string; location: string; startDate: string; endDate: string; jobDescription: string }

export default function ExperienceTimeline({ cvEn }: { cvEn?: any[] }) {
  const border = useColorModeValue('gray.200','gray.600')
  const dim = useColorModeValue('gray.600','gray.300')
  const list: Exp[] = useMemo(() => {
    if (!Array.isArray(cvEn)) return []
    const section = cvEn.find((s: any) => s.sessionName === 'workExperience')
    const items: Exp[] = section?.experiences || []
    return items.slice(0, 5)
  }, [cvEn])
  if (!list.length) return null
  return (
    <Flex direction="column" w="100%" maxW="1100px" position="relative" _before={{ content:'""', position:'absolute', left:'12px', top:0, bottom:0, borderLeft:'2px solid', borderColor:border }} pl={8}>
      {list.map((e, idx) => (
        <Flex key={idx} direction="column" position="relative" mb={6}>
          <Box position="absolute" left={0} top={1} w="6px" h="6px" borderRadius="full" bg="blue.400" transform="translate(-2px, 4px)" />
          <Heading size="sm">{e.jobTitle} — {e.companyName}</Heading>
          <Text fontSize="sm" color={dim}>{e.location}</Text>
          <Text fontSize="xs" color={dim}>
            {e.startDate} — {e.endDate}
          </Text>
          {e.jobDescription && <Text fontSize="sm" mt={1}>{e.jobDescription}</Text>}
        </Flex>
      ))}
    </Flex>
  )
}
