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
} from '@chakra-ui/react';
import React from 'react';
import { Project } from '../../types/cvProps';
import { DateTime } from 'luxon';

const ProjectSection = ({ data }: { data: Project }) => {
  return (
    <Accordion allowToggle width="100%" maxW="1000px" mt={[8, 16]} boxShadow="lg" borderRadius="md">
      <AccordionItem borderWidth="1px" borderColor="gray.200" mb={4}>
        <h2>
          <AccordionButton _expanded={{ bg: 'gray.100' }}>
            <Box flex="1" textAlign="left" fontWeight="bold" alignItems="center" justifyContent="center" p={4}>
              <Heading as="h3" size="md" textTransform="uppercase" color="blue.700">
                {data.headerName}
              </Heading>
            </Box>
            <AccordionIcon />
          </AccordionButton>
        </h2>
        <AccordionPanel px={6} py={4}>
          <Flex direction={'column'} gap={4}>
            {data.projectExperience.map((pro, index) => (
              <Box key={index} p={4} boxShadow="inner" borderRadius="md" backgroundColor="gray.50">
                <Flex justifyContent={'space-between'} alignItems={'center'}>
                  <Box>
                    <Text fontSize={'xl'} fontWeight="semibold">
                      {pro.title}
                    </Text>
                    <Text fontSize={'sm'} color="gray.600">
                      {pro.description}
                    </Text>
                  </Box>
                  <Box fontSize={'sm'} fontStyle={'italic'} color="gray.500">
                    <Text>
                      {DateTime.fromISO(pro.startDate).toFormat('LLL yyyy')}
                      {' - '}
                      {DateTime.fromISO(pro.endDate).toFormat('LLL yyyy')}
                    </Text>
                    <Text fontWeight={800}>{pro.projectLocation}</Text>
                  </Box>
                </Flex>

                <Box mt={2}>
                  {pro.features.map((fea, featureIndex) => (
                    <Box key={featureIndex} mt={2}>
                      <Text fontWeight={600} fontSize={'sm'}>
                        • {fea.description}
                      </Text>
                      {fea.furtherExplanation.length > 0 && (
                        <Box ml={4}>
                          {fea.furtherExplanation.map((des, desIndex) => (
                            <Text key={desIndex} fontWeight={400} fontSize={'sm'} mt={1}>
                              {'->'} {des}
                            </Text>
                          ))}
                        </Box>
                      )}
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </Flex>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
};

export default ProjectSection;