import {
  Text,
  Flex,
  Box,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionIcon,
  AccordionPanel,
} from '@chakra-ui/react'
import React from 'react'
import { Skill } from '../../types/cvProps'
import { Row } from './PersonalInformation'

const SkillSection = ({ data }: { data: Skill }) => {
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
              <Flex direction={'column'} gap={'20px'}>
                <Flex direction={'column'} gap={'10px'} flex={1}>
                  {data.languages.map((lang) => (
                    <Box
                      display="grid"
                      gridTemplateColumns="auto 90%"
                      gridColumnGap="10px"
                    >
                      <Text fontWeight={800} fontSize={'12px'}>
                        {lang.language}
                      </Text>
                      <Text textAlign="left">{lang.level}</Text>
                    </Box>
                  ))}
                </Flex>
                <Flex direction={'column'} gap={'20px'}>
                  {data.technical.map((tech) => (
                    <Flex direction={'column'}>
                      <Flex fontWeight={800} fontSize={'12px'}>
                        {tech.name.toUpperCase()}
                      </Flex>
                      <Flex direction={'column'}>
                        {tech.description.map((des) => (
                          <Flex>
                            <Flex>•{des}</Flex>
                          </Flex>
                        ))}
                      </Flex>
                    </Flex>
                  ))}
                </Flex>
              </Flex>
            </Row>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </React.Fragment>
  )
}
export default SkillSection
