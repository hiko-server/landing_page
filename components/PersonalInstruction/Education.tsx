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
import { Education } from '../../types/cvProps'
import { DateTime } from 'luxon'

const EducationSection = ({ data }: { data: Education }) => {
  const border = useColorModeValue('gray.200','gray.600')
  const expandedBg = useColorModeValue('gray.100','gray.700')
  const titleColor = useColorModeValue('blue.700','blue.200')
  const cardBg = useColorModeValue('gray.50','gray.800')
  const subText = useColorModeValue('gray.600','gray.300')
  const dimText = useColorModeValue('gray.500','gray.400')

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
          <Flex direction={'column'} gap={4}>
            {data.educationExperience.map((edu, index) => (
              <Box
                key={index}
                p={4}
                boxShadow="inner"
                borderRadius="md"
                backgroundColor={cardBg}
              >
                <Flex justifyContent={'space-between'} alignItems={'center'}>
                  <Box>
                    <Text fontSize={'xl'} fontWeight="semibold">
                      {edu.degree}
                    </Text>
                    <Text fontSize={'sm'} color={subText}>
                      {edu.schoolName}, {edu.schoolLocation}
                    </Text>
                  </Box>
                  <Box fontSize={'sm'} fontStyle={'italic'} color={dimText}>
                    <Text>
                      {DateTime.fromISO(edu.startDate).toFormat('LLL yyyy')}
                      {' - '}
                      {DateTime.fromISO(edu.endDate).toFormat('LLL yyyy')}
                    </Text>
                  </Box>
                </Flex>

                <Box mt={2}>
                  <Text fontSize={'sm'} fontStyle={'italic'}>
                    • GPA: {edu.gpa}
                  </Text>
                </Box>
              </Box>
            ))}
          </Flex>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  )
}

export default EducationSection
