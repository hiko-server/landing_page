import { Flex, Text, Link } from '@chakra-ui/react'

import { PersonalInformation } from '../../types/cvProps'
import styled from 'styled-components'
import { devColor } from '../../helpers/devColor'

const PersonalInformationSection = ({
  data,
}: {
  data: PersonalInformation
}) => {
  const isVisible = (field: keyof PersonalInformation) => !data.hiddenFields?.includes(field)

  const name = [
    isVisible('nickName') ? data.nickName : null,
    isVisible('lastName') ? data.lastName.toUpperCase() : null
  ].filter(Boolean).join(' ')
  
  const fullName = [name, isVisible('firstName') ? data.firstName : null].filter(Boolean).join(', ')

  // Only show the bottom border (separator) if there is an introduction to separate from
  const showIntro = data.introduction !== '' && isVisible('introduction')

  return (
    <React.Fragment>
      {data.lastName && (
        <CVSection bgColor={devColor('#fde3b6')}>
          <Row style={{ alignItems: 'flex-end', borderBottom: showIntro ? undefined : 'none' }}>
            <Flex
              p={0}
              m={0}
              bgColor={devColor('#acffaf')}
              direction={'column'}
              justifyContent={'center'}
              alignItems={'flex-start'}
            >
              <Text fontSize={'24px'} fontWeight={600}>{fullName}</Text>
              {isVisible('personalWebsite') && (
                <Text color={'blue'}>
                  <Link
                    href={`https://${data.personalWebsite}`}
                    isExternal
                  >{`https://${data.personalWebsite}`}</Link>
                </Text>
              )}
            </Flex>

            <Flex
              p={0}
              m={0}
              bgColor={devColor('#acffaf')}
              direction={'column'}
              justifyContent={'center'}
              alignItems={'flex-end'}
            >
              {isVisible('address') && <Text fontSize={'12px'}>{`${data.address}`}</Text>}
              <Flex direction={'row'} gap={`calc(12px / 3)`}>
                {isVisible('phoneNumber') && <Text>{`M:${data.phoneNumber}`}</Text>}
                {isVisible('phoneNumber') && isVisible('email') && <Text>{`|`}</Text>}
                {isVisible('email') && <Text>{`E: ${data.email}`}</Text>}
              </Flex>
            </Flex>
          </Row>
          {showIntro && (
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
  border-bottom: 3px solid var(--cv-separator-color, blue);
`
export const CVSection = styled(Flex)`
  flex-direction: column;
`
