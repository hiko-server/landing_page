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
  useColorModeValue,
} from '@chakra-ui/react';
import React from 'react';
import { Certification } from '../../types/cvProps';
import { DateTime } from 'luxon';

const CertificateSection = ({ data }: { data: Certification }) => {
  const border = useColorModeValue('gray.200','gray.600')
  const expandedBg = useColorModeValue('gray.100','gray.700')
  const titleColor = useColorModeValue('blue.700','blue.200')
  const cardBg = useColorModeValue('gray.50','gray.800')
  const subText = useColorModeValue('gray.600','gray.300')
  const dimText = useColorModeValue('gray.500','gray.400')
  const linkBlue = useColorModeValue('blue.600','blue.300')

  return (
    <Accordion allowToggle width="100%" maxW="1000px" mt={[8, 16]} boxShadow="lg" borderRadius="md">
      <AccordionItem borderWidth="1px" borderColor={border} mb={4}>
        <h2>
          <AccordionButton _expanded={{ bg: expandedBg }}>
            <Box flex="1" textAlign="left" fontWeight="bold" alignItems="center" justifyContent="center" p={4}>
              <Heading as="h3" size="md" textTransform="uppercase" color={titleColor}>
                {data.headerName}
              </Heading>
            </Box>
            <AccordionIcon />
          </AccordionButton>
        </h2>
        <AccordionPanel px={6} py={4}>
          <Flex direction={'column'} gap={4}>
            {data.certifications.map((org, orgIndex) => (
              <Box key={orgIndex} p={4} borderBottom="1px solid" borderColor={border}>
                <Link fontSize={'xl'}  href={"https://" + org.organizationURL} isExternal color={linkBlue}>
                            Issued by {org.issuingOrganization}
                 </Link>
                <Flex direction={'column'} gap={4}>
                  {org.CertificationList.map((cert, certIndex) => (
                    <Box key={certIndex} p={4} boxShadow="inner" borderRadius="md" backgroundColor={cardBg}>
                      <Flex justifyContent={'space-between'} alignItems={'center'}>
                        <Box>
                          <Text fontSize={'xl'} fontWeight="semibold">
                            {cert.certificationName}
                          </Text>

                          <Text fontSize={'sm'} color={subText}>
                            Credential ID: {cert.credentialID}
                          </Text>
                        </Box>
                        <Box fontSize={'sm'} fontStyle={'italic'} color={dimText}>
                          <Text>
                            {DateTime.fromISO(cert.issuedDate).toFormat('LLL yyyy')}
                            {' - '}
                            {cert.expirationDate ? DateTime.fromISO(cert.expirationDate).toFormat('LLL yyyy') : 'Present'}
                          </Text>
                        </Box>
                      </Flex>
                      <Link href={cert.credentialURL} isExternal fontSize={'sm'} color={linkBlue} mt={2}>
                        View Credential
                      </Link>
                    </Box>
                  ))}
                </Flex>
              </Box>
            ))}
          </Flex>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
};

export default CertificateSection;
