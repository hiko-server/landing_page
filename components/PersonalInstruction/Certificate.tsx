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
  } from '@chakra-ui/react';
  import React from 'react';
  import { Certification } from '../../types/cvProps';
  import { DateTime } from 'luxon';
  
  const CertificateSection = ({ data }: { data: Certification }) => {
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
              {data.certifications.map((cert, index) => (
                <Box key={index} p={4} boxShadow="inner" borderRadius="md" backgroundColor="gray.50">
                  <Flex justifyContent={'space-between'} alignItems={'center'}>
                    <Box>
                      <Text fontSize={'xl'} fontWeight="semibold">
                        {cert.certificationName}
                      </Text>
                      <Link fontSize={'sm'} color="gray.600" href={"https://" + cert.organizationURL} isExternal>
                        Issued by {cert.issuingOrganization}
                      </Link>
                      <Text fontSize={'sm'} color="gray.600" >
                        Credential ID: {cert.credentialID}
                      </Text>
                    </Box>
                    <Box fontSize={'sm'} fontStyle={'italic'} color="gray.500">
                      <Text>
                        {DateTime.fromISO(cert.issuedDate).toFormat('LLL yyyy')}
                        {' - '}
                        {cert.expirationDate ? DateTime.fromISO(cert.expirationDate).toFormat('LLL yyyy') : 'Present'}
                      </Text>
                    </Box>
                  </Flex>
                  <Link href={cert.credentialURL} isExternal fontSize={'sm'} color='blue.500' mt={2}>
                    View Credential
                  </Link>
                </Box>
              ))}
            </Flex>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    );
  };
  
  export default CertificateSection;