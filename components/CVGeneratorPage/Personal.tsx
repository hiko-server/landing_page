import { Flex, Textarea, Input } from '@chakra-ui/react'

import { Dispatch, SetStateAction } from 'react'
import { personalInformationElements } from '../../types/elements'
import { PersonalInformation } from '../../types/cvProps'

const PersonalSession = ({
  setProfileData,
  profileData,
}: {
  setProfileData: Dispatch<SetStateAction<PersonalInformation>>
  profileData: PersonalInformation
}) => {
  return (
    <Flex direction={'column'}>
      <Flex fontWeight="bold">PERSONAL INFORMATION</Flex>
      {personalInformationElements.map((element: any, index: number) => {
        return (
          <Flex direction={'column'} key={index}>
            <Flex>{element.label}</Flex>
            {element.key == 'introduction' ? (
              <Textarea
                placeholder={element.placeholder}
                onChange={(e) =>
                  setProfileData({
                    ...profileData,
                    [element.key]: e.target.value,
                  })
                }
              />
            ) : (
              <Input
                placeholder={element.placeholder}
                onChange={(e) =>
                  setProfileData({
                    ...profileData,
                    [element.key]: e.target.value,
                  })
                }
              />
            )}
          </Flex>
        )
      })}
    </Flex>
  )
}
export default PersonalSession
