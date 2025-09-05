import {
  Flex,
  Text,
} from '@chakra-ui/react';
import React from 'react';
import { Certification } from '../../types/cvProps';
import { CVSection, Row } from './PersonalInformation';
import { DateTime } from 'luxon';
import { devColor } from '../../helpers/devColor';

const CertificateSection = ({ data }: { data: Certification }) => {
  return (
    <React.Fragment>
      <CVSection bgColor={devColor('#fde3b6')}>
        <Row style={{ paddingBottom: '0px' }}>
          <Text fontWeight={800} fontSize={'12px'}>
            {data.headerName.toUpperCase()}
          </Text>
        </Row>
        <Row style={{ borderBottom: 'none' }}>
          <Flex direction={'column'} gap={'5px'} flex={1}>
            {data.certifications.map((org, orgIndex) => (
              <React.Fragment key={orgIndex}>
                <Flex direction={'column'} gap={'20px'}>
                  {org.CertificationList.map((cert, certIndex) => (
                    <Flex key={certIndex} direction={'column'}>
                      <Flex
                        justifyContent={'space-between'}
                        alignItems={'center'}
                        style={{ padding: '0' }}
                      >
                        <Flex direction={'column'} minW={'500px'}>
                          <Text fontWeight={800} fontSize={'14px'}>
                            {cert.certificationName}
                          </Text>
                          <Text fontWeight={800} fontSize={'12px'}>
                          {org.issuingOrganization}
                          </Text>

                          <Text fontWeight={640} fontSize={'12px'}>
                            Credential ID: {cert.credentialID}
                          </Text>
                          <Text fontWeight={640} fontSize={'12px'}>
                           {org.organizationURL}
                          </Text>
                        </Flex>
                        <Flex
                          fontSize={'12px'}
                          fontStyle={'italic'}
                          gap={`calc(16px/3)`}
                          minWidth={'210px'}
                          justifyContent={'center'}
                          alignItems={'center'}
                        >
                          <Text>
                            {DateTime.fromISO(cert.issuedDate).toFormat('LLL yyyy')}
                            {' - '}
                            {cert.expirationDate ? DateTime.fromISO(cert.expirationDate).toFormat('LLL yyyy') : 'Present'}
                          </Text>
                        </Flex>
                      </Flex>
                      
                    </Flex>
                  ))}
                </Flex>
              </React.Fragment>
            ))}
          </Flex>
        </Row>
      </CVSection>
    </React.Fragment>
  );
};

export default CertificateSection;