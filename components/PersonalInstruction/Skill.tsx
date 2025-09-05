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
import { Skill } from '../../types/cvProps';

const SkillSection = ({ data }: { data: Skill }) => {
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
            {/* Languages Section */}
            <Box>
              <Text fontSize="lg" fontWeight="semibold" mb={2}>
                Languages
              </Text>
              <Flex direction={'column'} gap={2}>
                {data.languages.map((lang, index) => (
                  <Box key={index} display="grid" gridTemplateColumns="auto 1fr" gridColumnGap="10px">
                    <Text fontWeight={800} fontSize={'md'}>
                      {lang.language}
                    </Text>
                    <Text textAlign="left" fontSize={'sm'} color="gray.600">
                      {lang.level}
                    </Text>
                  </Box>
                ))}
              </Flex>
            </Box>

            {/* Technical Skills Section */}
            <Box>
              <Text fontSize="lg" fontWeight="semibold" mb={2}>
                Technical Skills
              </Text>
              <Flex direction={'column'} gap={4}>
                {data.technical.map((tech, techIndex) => (
                  <Box key={techIndex} p={4} boxShadow="inner" borderRadius="md" backgroundColor="gray.50">
                    <Text fontWeight={800} fontSize={'md'} textTransform="uppercase" mb={2}>
                      {tech.name}
                    </Text>
                    <Flex direction={'column'} gap={2}>
                      {tech.description.map((des, desIndex) => (
                        <Text key={desIndex} fontSize={'sm'} pl={4}>
                          • {des}
                        </Text>
                      ))}
                    </Flex>
                  </Box>
                ))}
              </Flex>
            </Box>
          </Flex>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
};

export default SkillSection;