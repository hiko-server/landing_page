import { Text, Flex } from '@chakra-ui/react'
import { ExtraSkill } from '../../types/cvProps'
import { devColor } from '../../helpers/devColor'
import { CVSection, Row } from './PersonalInformation'

const ExtraSkillSection = ({ data }: { data: ExtraSkill }) => {
  return (
    <React.Fragment>
      <CVSection bgColor={devColor('#fde3b6')}>
        <Row style={{ paddingBottom: '0px', breakAfter: 'avoid' }}>
          <Text fontWeight={800} fontSize={'12px'}>
            {data.headerName.toUpperCase()}
          </Text>
        </Row>

        <Row style={{ borderBottom: 'none' }}>
          <Flex direction={'column'}>
            {data.points.map((point, i) => (
              <Flex key={i}>•{point}</Flex>
            ))}
          </Flex>
        </Row>
      </CVSection>
    </React.Fragment>
  )
}
export default ExtraSkillSection
