import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Flex,
  Text,
} from '@chakra-ui/react'
import React from 'react'
import { Project } from '../../types/cvProps'
import { Row } from './PersonalInformation'
import { DateTime } from 'luxon'

const ProjectSection = ({ data }: { data: Project }) => {
  return (
    <React.Fragment>
      <Accordion allowToggle width="100%" maxW="1000px" mt={[4, 8]}>
        <AccordionItem>
          <AccordionButton _expanded={{ bg: 'gray.100' }}>
            <Flex
              flex="1"
              textAlign="left"
              fontWeight="bold"
              alignItems="center"
              justifyContent="center"
            >
              <Text fontWeight={800} fontSize={'12px'}>
                {data.headerName.toUpperCase()}
              </Text>
            </Flex>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel pb={4}>
            <Row style={{ borderBottom: 'none' }}>
              <Flex direction={'column'} gap={'20px'} flex={1}>
                {data.projectExperience.map((pro, k) => (
                  <Flex direction={'column'}>
                    <Flex
                      key={k}
                      justifyContent={'space-between'}
                      alignItems={'center'}
                      style={{ padding: '0' }}
                    >
                      <Flex direction={'column'} minW={'500px'}>
                        <Text fontWeight={800} fontSize={'14px'}>
                          {pro.title}
                        </Text>
                        <Text fontSize={'12px'}>{pro.description}</Text>
                      </Flex>
                      {/*  */}
                      <Flex
                        fontSize={'12px'}
                        fontStyle={'italic'}
                        gap={`calc(16px/3)`}
                        minWidth={'210px'}
                        justifyContent={'center'}
                        alignItems={'center'}
                      >
                        <Text>
                          {DateTime.fromISO(pro.startDate).toFormat('LLL yyyy')}
                          {' - '}
                          {DateTime.fromISO(pro.endDate).toFormat('LLL yyyy')}
                        </Text>
                        <Text fontStyle={'normal'}>{`|`}</Text>
                        <Text fontWeight={800}>{pro.projectLocation}</Text>
                      </Flex>
                    </Flex>

                    <Flex direction={'column'}>
                      {pro.features.map((fea) => (
                        <Flex direction={'column'}>
                          <Flex fontWeight={600} fontSize={'12px'}>
                            •{fea.description}
                          </Flex>
                          {fea.furtherExplanation.length > 0 && (
                            <Flex direction={'column'}>
                              {fea.furtherExplanation.map((des) => (
                                <Flex>
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
                  </Flex>
                ))}
              </Flex>
            </Row>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </React.Fragment>
  )
}

export default ProjectSection
