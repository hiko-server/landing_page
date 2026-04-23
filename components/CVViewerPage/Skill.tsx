import { Text, Flex, Box } from '@chakra-ui/react'
import { Skill } from '../../types/cvProps'
import { devColor } from '../../helpers/devColor'
import { CVSection, Row } from './PersonalInformation'

const SkillSection = ({ data }: { data: Skill }) => {
  return (
    <React.Fragment>
      <CVSection bgColor={devColor('#fde3b6')}>
        <Row style={{ paddingBottom: '0px', breakAfter: 'avoid' }}>
          <Text fontWeight={800} fontSize={'12px'}>
            {data.headerName.toUpperCase()}
          </Text>
        </Row>

        <Row style={{ borderBottom: 'none' }}>
          <Flex direction={'column'} gap={'20px'}>
            <Flex direction={'column'} gap={'10px'} flex={1}>
              {data.languages.map((lang, index) => (
                <Box
                  key={index}
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
              {data.technical.map((tech, i) => (
                <Flex key={i} direction={'column'} style={{ breakInside: 'avoid' }}>
                  <Flex fontWeight={800} fontSize={'12px'}>
                    {tech.name.toUpperCase()}
                  </Flex>
                  <Flex direction={'column'}>
                    {tech.description.map((des, j) => (
                      <Flex key={j}>
                        <Flex>•{des}</Flex>
                      </Flex>
                    ))}
                  </Flex>
                </Flex>
              ))}
            </Flex>
          </Flex>
        </Row>
      </CVSection>
    </React.Fragment>
  )
}
export default SkillSection
