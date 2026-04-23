import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Flex,
  Heading,
  Text,
} from '@chakra-ui/react'
import { useColorModeValue } from '@chakra-ui/react'
import { DateTime } from 'luxon'

import { CompetitionAwards } from '../../types/cvProps'

const formatMonthYear = (value?: string) => {
  if (!value) return null
  const parsed = DateTime.fromISO(value)
  if (!parsed.isValid) return value
  return parsed.toFormat('LLL yyyy')
}

const CompetitionAwardsSection = ({ data }: { data: CompetitionAwards }) => {
  const border = useColorModeValue('gray.200', 'gray.600')
  const expandedBg = useColorModeValue('gray.100', 'gray.700')
  const titleColor = useColorModeValue('blue.700', 'blue.200')
  const cardBg = useColorModeValue('gray.50', 'gray.800')
  const subText = useColorModeValue('gray.600', 'gray.300')
  const dimText = useColorModeValue('gray.500', 'gray.400')

  return (
    <Accordion
      allowToggle
      width="100%"
      maxW="1000px"
      mt={[8, 16]}
      boxShadow="lg"
      borderRadius="md"
    >
      <AccordionItem borderWidth="1px" borderColor={border} mb={4}>
        <h2>
          <AccordionButton _expanded={{ bg: expandedBg }}>
            <Box
              flex="1"
              textAlign="left"
              fontWeight="bold"
              alignItems="center"
              justifyContent="center"
              p={4}
            >
              <Heading
                as="h3"
                size="md"
                textTransform="uppercase"
                color={titleColor}
              >
                {data.headerName}
              </Heading>
            </Box>
            <AccordionIcon />
          </AccordionButton>
        </h2>
        <AccordionPanel px={6} py={4}>
          <Flex direction="column" gap={4}>
            {data.awards.map((award, index) => (
              <Box
                key={index}
                p={4}
                boxShadow="inner"
                borderRadius="md"
                backgroundColor={cardBg}
              >
                <Flex justifyContent="space-between" alignItems="center">
                  <Box>
                    <Text fontSize="xl" fontWeight="semibold">
                      {award.contestName}
                    </Text>
                    <Text fontSize="sm" color={subText}>
                      {award.award}
                    </Text>
                    {award.organization ? (
                      <Text fontSize="sm" color={dimText}>
                        {award.organization}
                      </Text>
                    ) : null}
                  </Box>
                  <Box fontSize="sm" fontStyle="italic" color={dimText}>
                    {award.date ? (
                      <Text>{formatMonthYear(award.date)}</Text>
                    ) : null}
                    {award.location ? (
                      <Text fontWeight={800}>{award.location}</Text>
                    ) : null}
                  </Box>
                </Flex>

                {award.description.length > 0 ? (
                  <Box mt={2}>
                    {award.description.map((line, lineIndex) => (
                      <Text key={lineIndex} fontSize="sm" mt={1}>
                        • {line}
                      </Text>
                    ))}
                  </Box>
                ) : null}
              </Box>
            ))}
          </Flex>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  )
}

export default CompetitionAwardsSection
