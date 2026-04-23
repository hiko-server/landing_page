import { Flex, Text, Link } from '@chakra-ui/react'

import { PersonalInformation } from '../../types/cvProps'
import styled from 'styled-components'
import { devColor } from '../../helpers/devColor'

const PersonalInformationSection = ({
  data,
}: {
  data: PersonalInformation
}) => {
  return (
    <React.Fragment>
      {data.lastName && (
        <CVSection bgColor={devColor('#fde3b6')}>
          <Row style={{ alignItems: 'flex-end' }}>
            <Flex
              p={0}
              m={0}
              bgColor={devColor('#acffaf')}
              direction={'column'}
              justifyContent={'center'}
              alignItems={'flex-start'}
            >
              <Text fontSize={'24px'} fontWeight={600}>{`${
                data.nickName
              } ${data.lastName.toUpperCase()}, ${data.firstName}`}</Text>
              <Text color={'blue'}>
                <Link
                  href={`https://${data.personalWebsite}`}
                  isExternal
                >{`https://${data.personalWebsite}`}</Link>
              </Text>
            </Flex>

            <Flex
              p={0}
              m={0}
              bgColor={devColor('#acffaf')}
              direction={'column'}
              justifyContent={'center'}
              alignItems={'flex-end'}
            >
              <Text fontSize={'12px'}>{`${data.address}`}</Text>
              <Flex direction={'row'} gap={`calc(12px / 3)`}>
                <Text>{`M:${data.phoneNumber}`}</Text>
                <Text>{`|`}</Text>
                <Text>{`E: ${data.email}`}</Text>
              </Flex>
            </Flex>
          </Row>
          {data.introduction !== '' && (
            <Row style={{ borderBottom: 'none' }}>
              <Text>{data.introduction}</Text>
            </Row>
          )}
        </CVSection>
      )}
    </React.Fragment>
  )
}

export default PersonalInformationSection

// interface RowProps {
//   noBorder?: boolean
//   isHeader?: boolean
// }

// type Props = FlexProps &
//   RowProps &
//   DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>

export const Row = styled(Flex)`
  flex-direction: row;
  justify-content: space-between;
  padding: 0 10px;
  padding-bottom: 20px;
  border-bottom: 3px solid blue;
`
export const CVSection = styled(Flex)`
  flex-direction: column;
`
