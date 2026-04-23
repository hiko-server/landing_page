import { Flex, Text } from '@chakra-ui/react'
import { Experiences } from '../../types/cvProps'
import { devColor } from '../../helpers/devColor'
import { CVSection, Row } from './PersonalInformation'
import { DateTime } from 'luxon'

const WorkExperience = ({ data }: { data: Experiences }) => {
  return (
    <React.Fragment>
      <CVSection bgColor={devColor('#fde3b6')} flex={'flex'}>
        <Row style={{ paddingBottom: '0px', breakAfter: 'avoid' }}>
          <Text fontWeight={800} fontSize={'12px'}>
            {data.headerName.toUpperCase()}
          </Text>
        </Row>
        <Row style={{ borderBottom: 'none' }}>
          <Flex direction={'column'} gap={'20px'} flex={1}>
            {data.experiences.map((exp, k) => (
              <Flex key={k} direction={'column'} style={{ breakInside: 'avoid' }}>
                {' '}
                <Flex
                  justifyContent={'space-between'}
                  alignItems={'center'}
                  style={{ padding: '0' }}
                >
                  <Flex direction={'column'} minW={'500px'}>
                    <Flex direction={'row'} alignItems="center" >
                      <Text fontSize={'14px'} fontWeight={800} mr={1} >
                        {exp.jobTitle}
                      </Text>
                      <Text fontSize={'14px'} fontWeight={600} mr={1} >
                        at
                      </Text>
                      <Text fontSize={'14px'} fontWeight={800}>
                        {exp.companyName}
                      </Text>
                    </Flex>
                    <Text fontSize={'12px'}>{exp.jobDescription}</Text>
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
                      {DateTime.fromISO(exp.startDate).toFormat('LLL yyyy')}
                      {' - '}
                      {exp.endDate.toLowerCase() === 'now'
                        ? 'Present'
                        : DateTime.fromISO(exp.endDate).toFormat('LLL yyyy')}
                    </Text>
                    <Text fontStyle={'normal'}>{`|`}</Text>
                    <Text fontWeight={800}>{exp.location}</Text>
                  </Flex>
                </Flex>
                <Flex direction={'column'}>
                  {exp.features.map((fea, i) => (
                    <Flex key={i} direction={'column'}>
                      <Flex fontWeight={600} fontSize={'12px'}>
                        •{fea.description}
                      </Flex>
                      {fea.furtherExplanation.length > 0 && (
                        <Flex direction={'column'}>
                          {fea.furtherExplanation.map((des, j) => (
                            <Flex key={j}>
                              <Text fontWeight={400} fontSize={'12px'}>
                                {'->'}
                                {des}
                              </Text>
                            </Flex>
                          ))}
                        </Flex>
                      )}
                    </Flex>
                  ))}
                </Flex>
                <Flex direction={'row'} gap={2} wrap="wrap" mt={2}>
                  {exp.relatedSkills.map((skill, skillIndex) => (
                    <Text key={skillIndex} fontWeight={300} fontSize={'12px'}>
                      {skill}
                      {skillIndex !== exp.relatedSkills.length - 1 && ' | '}
                    </Text>
                  ))}
                </Flex>
              </Flex>
            ))}
          </Flex>
        </Row>
      </CVSection>
    </React.Fragment>
  )
}

export default WorkExperience
