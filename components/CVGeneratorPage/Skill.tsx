import { Button, Flex } from '@chakra-ui/react'
import { Skill } from '../../types/cvProps'
import { Dispatch, SetStateAction } from 'react'
import { ChevronUpIcon, ChevronDownIcon } from '@chakra-ui/icons'
import {
  POSITION_ACTION,
  handlePositionChange,
} from '../../services/position_action'

const SkillSession = ({
  setSkillData,
  skillData,
}: {
  skillData: Skill[]
  setSkillData: Dispatch<SetStateAction<Skill[]>>
}) => {
  const defaultData = {
    tag: '',
    details: [{ name: '', level: '' }],
  }

  return (
    <Flex direction="column">
      <Flex fontWeight="bold">SKILL</Flex>
      {skillData.map((_skill, i) => {
        return (
          <Flex key={i} direction="column">
            <Flex>Skill {i + 1}</Flex>
            <Flex direction={'row'}>
              <ChevronUpIcon
                onClick={() =>
                  handlePositionChange(setSkillData, i, POSITION_ACTION.UP)
                }
              />
              <ChevronDownIcon
                onClick={() =>
                  handlePositionChange(setSkillData, i, POSITION_ACTION.DOWN)
                }
              />
              <Flex
                onClick={() =>
                  handlePositionChange(setSkillData, i, POSITION_ACTION.DELETE)
                }
              >
                DELETE
              </Flex>
            </Flex>
            {/* {skill.details.map((detail, index) => {
              const updatedData = [...skillData]
              return (
                <Flex direction="column" key={index} border={'1px'}>
                  <Flex>{skillFields[index].label}</Flex>
                  <Input
                    value={
                      detail[skillFields[index].key as keyof typeof detail]
                    }
                    placeholder={skillFields[index].placeholder}
                    onChange={(e) => {
                      console.log('index:', i)
                      updatedData[i].details[index][
                        skillFields[index].key as keyof typeof detail
                      ] = e.target.value
                      setSkillData(updatedData)
                    }}
                  />
                </Flex>
              )
            })} */}
          </Flex>
        )
      })}
      <Button
        onClick={() =>
          handlePositionChange(
            setSkillData,
            skillData.length,
            POSITION_ACTION.INCREMENT,
            defaultData,
          )
        }
      >
        Add Skill
      </Button>
    </Flex>
  )
}

export default SkillSession
