import { Flex, Text } from '@chakra-ui/react'
import React from 'react'
import { Education } from '../../types/cvProps'
import { CVSection, Row } from './PersonalInformation'
import { devColor } from '../../helpers/devColor'
import { DateTime } from 'luxon'

const EducationSection = ({ data }: { data: Education }) => {
  return (
    <React.Fragment>
      <CVSection bgColor={devColor('#fde3b6')}>
        <Row style={{ paddingBottom: '0px', breakAfter: 'avoid' }}>
          <Text fontWeight={800} fontSize={'12px'}>
            {data.headerName.toUpperCase()}
          </Text>
        </Row>
        <Row style={{ borderBottom: 'none' }}>
          <Flex direction={'column'} gap={'20px'} flex={1}>
            {data.educationExperience.map((edu, k) => (
              <Flex direction={'column'} style={{ breakInside: 'avoid' }}>
                <Flex
                  key={k}
                  justifyContent={'space-between'}
                  alignItems={'center'}
                >
                  <Flex>
                    <Text>{edu.degree}</Text>
                  </Flex>
                  <Flex
                    fontSize={'12px'}
                    fontStyle={'italic'}
                    gap={`calc(16px/3)`}
                  >
                    <Text>
                      {DateTime.fromISO(edu.endDate) > DateTime.local() &&
                        `Expt `}
                      {DateTime.fromISO(edu.endDate).toFormat('LLL yyyy')}
                    </Text>
                    <Text fontStyle={'normal'}>{`|`}</Text>
                    <Text fontWeight={800}>{edu.schoolName}</Text>
                    <Text
                      ml={`calc(0px - (16px/3))`}
                      fontWeight={800}
                    >{`,`}</Text>
                    <Text fontWeight={800}>{edu.schoolLocation}</Text>
                  </Flex>
                </Flex>
                <Flex>
                  <Text fontSize={'12px'} fontStyle={'italic'}>
                    •GPA: {edu.gpa}
                  </Text>
                </Flex>
              </Flex>
            ))}
          </Flex>
        </Row>
      </CVSection>
    </React.Fragment>
  )
}
export default EducationSection
