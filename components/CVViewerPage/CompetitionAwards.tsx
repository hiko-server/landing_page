import { Flex, Text } from '@chakra-ui/react'
import { DateTime } from 'luxon'

import { CompetitionAwards as CompetitionAwardsType } from '../../types/cvProps'
import { devColor } from '../../helpers/devColor'
import { CVSection, Row } from './PersonalInformation'

const formatMonthYear = (value?: string) => {
  if (!value) return null
  const parsed = DateTime.fromISO(value)
  if (!parsed.isValid) return value
  return parsed.toFormat('LLL yyyy')
}

const CompetitionAwardsSection = ({
  data,
}: {
  data: CompetitionAwardsType
}) => {
  return (
    <CVSection bgColor={devColor('#fde3b6')} flex={'flex'}>
      <Row style={{ paddingBottom: '0px', breakAfter: 'avoid' }}>
        <Text fontWeight={800} fontSize={'12px'}>
          {data.headerName.toUpperCase()}
        </Text>
      </Row>
      <Row style={{ borderBottom: 'none' }}>
        <Flex direction={'column'} gap={'16px'} flex={1}>
          {data.awards.map((item, index) => (
            <Flex key={index} direction={'column'} gap={'6px'} style={{ breakInside: 'avoid' }}>
              <Flex
                justifyContent={'space-between'}
                alignItems={'baseline'}
                flexWrap={'wrap'}
                style={{ padding: 0 }}
              >
                <Flex direction={'column'} minW={'320px'}>
                  <Text fontWeight={800} fontSize={'14px'}>
                    {item.contestName}
                  </Text>
                  <Text fontSize={'12px'}>{item.award}</Text>
                  {item.organization ? (
                    <Text fontSize={'12px'} color={'gray.600'}>
                      {item.organization}
                    </Text>
                  ) : null}
                </Flex>
                <Flex
                  fontSize={'12px'}
                  fontStyle={'italic'}
                  gap={`calc(16px/3)`}
                  minWidth={'210px'}
                  justifyContent={'flex-end'}
                  alignItems={'center'}
                >
                  {item.date ? (
                    <Text>{formatMonthYear(item.date)}</Text>
                  ) : null}
                  {item.date && item.location ? (
                    <Text fontStyle={'normal'}>{`|`}</Text>
                  ) : null}
                  {item.location ? (
                    <Text
                      fontStyle={'normal'}
                      fontWeight={600}
                      textAlign={'right'}
                    >
                      {item.location}
                    </Text>
                  ) : null}
                </Flex>
              </Flex>
              {item.description.length > 0 ? (
                <Flex direction={'column'} fontSize={'12px'} gap={'2px'}>
                  {item.description.map((line, lineIndex) => (
                    <Text key={lineIndex}>• {line}</Text>
                  ))}
                </Flex>
              ) : null}
            </Flex>
          ))}
        </Flex>
      </Row>
    </CVSection>
  )
}

export default CompetitionAwardsSection
