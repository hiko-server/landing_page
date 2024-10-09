import { Button, Flex, Input } from '@chakra-ui/react'
import { EducationExperience } from '../../types/cvProps'
import { Dispatch, SetStateAction } from 'react'
import { ChevronUpIcon, ChevronDownIcon } from '@chakra-ui/icons'
import {
  POSITION_ACTION,
  handlePositionChange,
} from '../../services/position_action'
import { educationExperienceElements } from '../../types/elements'

const EducationSession = ({
  setEducationData,
  educationData,
}: {
  educationData: EducationExperience[]
  setEducationData: Dispatch<SetStateAction<EducationExperience[]>>
}) => {
  const defaultData = {
    schoolName: '',
    degree: '',
    fieldOfStudy: '',
    expiredGraduation: '',
    gpa: '',
  }

  return (
    <Flex direction="column">
      <Flex fontWeight="bold">EDUCATION EXPERIENCE</Flex>
      {educationData.map((_data: any, i: number) => {
        return (
          <Flex key={i} direction="column">
            <Flex>Education Experience {i + 1}</Flex>
            <Flex direction={'row'}>
              <ChevronUpIcon
                onClick={() =>
                  handlePositionChange(setEducationData, i, POSITION_ACTION.UP)
                }
              />
              <ChevronDownIcon
                onClick={() =>
                  handlePositionChange(
                    setEducationData,
                    i,
                    POSITION_ACTION.DOWN,
                  )
                }
              />
              <Flex
                onClick={() =>
                  handlePositionChange(
                    setEducationData,
                    i,
                    POSITION_ACTION.DELETE,
                  )
                }
              >
                DELETE
              </Flex>
            </Flex>
            {educationExperienceElements.map((element: any, index: number) => {
              const updatedEducationData = [...educationData]
              return (
                <Flex direction="column" key={index} border={'1px'}>
                  <Flex>{element.label}</Flex>
                  <Input
                    value={
                      educationData[i][element.key as keyof EducationExperience]
                    }
                    placeholder={element.placeholder}
                    onChange={(e) => {
                      console.log('index:', i)
                      updatedEducationData[i][
                        element.key as keyof EducationExperience
                      ] = e.target.value
                      setEducationData(updatedEducationData)
                    }}
                  />
                </Flex>
              )
            })}
          </Flex>
        )
      })}
      <Button
        onClick={() =>
          handlePositionChange(
            setEducationData,
            educationData.length,
            POSITION_ACTION.INCREMENT,
            defaultData,
          )
        }
      >
        Add Education Experience
      </Button>
    </Flex>
  )
}
export default EducationSession
