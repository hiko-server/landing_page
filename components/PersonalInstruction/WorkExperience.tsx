import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Flex,
  Heading,
  Link,
  Text,
} from '@chakra-ui/react'
import React from 'react'
import { Experiences } from '../../types/cvProps'
import { DateTime } from 'luxon'

const WorkExperience = ({ data }: { data: Experiences }) => {
  return (
    <Accordion
      allowToggle
      width="100%"
      maxW="1000px"
      mt={[8, 16]}
      boxShadow="lg"
      borderRadius="md"
    >
      <AccordionItem borderWidth="1px" borderColor="gray.200" mb={4}>
        <h2>
          <AccordionButton _expanded={{ bg: 'gray.100' }}>
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
                color="blue.700"
              >
                {data.headerName}
              </Heading>
            </Box>
            <AccordionIcon />
          </AccordionButton>
        </h2>
        <AccordionPanel px={6} py={4}>
          <Flex direction={'column'} gap={4}>
            {data.experiences.map((exp, index) => (
              <Box
                key={index}
                p={4}
                boxShadow="inner"
                borderRadius="md"
                backgroundColor="gray.50"
              >
                <Flex justifyContent={'space-between'} alignItems={'center'}>
                  <Box>
                    <Flex direction={'row'} alignItems="center" fontWeight={600}>
                      <Text fontSize={'xl'} fontWeight={800} mr={1}>
                        {exp.jobTitle} 
                      </Text>
                      <Text fontSize={'xl'} fontWeight={600} mr={1}>
                        at
                      </Text>
                      <Link
                      fontWeight={800}
                        fontSize={'xl'}
                        href={'https://' + exp.companyURL}
                        isExternal
                      >
                         {exp.companyName}
                      </Link>
                    </Flex>

                    <Text fontSize={'sm'} color="gray.600">
                      {exp.jobDescription}
                    </Text>
                  </Box>
                  <Box fontSize={'sm'} fontStyle={'italic'} color="gray.500">
                    <Text>
                      {DateTime.fromISO(exp.startDate).toFormat('LLL yyyy')}
                      {' - '}
                      {exp.endDate.toLowerCase() === 'now'
                        ? 'Present'
                        : DateTime.fromISO(exp.endDate).toFormat('LLL yyyy')}
                    </Text>
                    <Text fontWeight={800}>{exp.location}</Text>
                  </Box>
                </Flex>

                <Box mt={2}>
                  {exp.features.map((fea, featureIndex) => (
                    <Box key={featureIndex} mt={2}>
                      <Text fontWeight={600} fontSize={'sm'}>
                        • {fea.description}
                      </Text>
                      {fea.furtherExplanation.length > 0 && (
                        <Box ml={4}>
                          {fea.furtherExplanation.map((des, desIndex) => (
                            <Text
                              key={desIndex}
                              fontWeight={400}
                              fontSize={'sm'}
                              mt={1}
                            >
                              {'->'} {des}
                            </Text>
                          ))}
                        </Box>
                      )}
                    </Box>
                  ))}
                </Box>
                <Flex direction={'row'} gap={4} wrap="wrap" mt={5}>
                  {exp.relatedSkills.map((skill, skillIndex) => (
                    <Text key={skillIndex} fontWeight={300} fontSize={'sm'}>
                      {skill}
                      {skillIndex !== exp.relatedSkills.length - 1 && ' | '}
                    </Text>
                  ))}
                </Flex>
              </Box>
            ))}
          </Flex>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  )
}

export default WorkExperience
