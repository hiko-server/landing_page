import { useContext, useState } from 'react'
import { PersonalInformation } from '../../types/cvProps'
import { Flex } from '@chakra-ui/react'
import { SettingsAppContext } from '../../context/settingsState'
import PersonalSession from './Personal'

const CVFormSidebar = ({} // setCvData,
// cvData,
: {
  // setCvData: Dispatch<SetStateAction<CVData>>
  // cvData: CVData
}) => {
  const [profileData, setProfileData] = useState<PersonalInformation>({
    sessionName: '',
    headerName: '',
    firstName: '',
    lastName: '',
    nickName: '',
    email: '',
    phoneNumber: '',
    personalWebsite: '',
    address: '',
    introduction: '',
  })

  // const [educationData, setEducationData] = useState<Education>({
  //   sessionName: '',
  //   headerName: '',
  //   educationExperience:[]
  // })
  // const [skillData, setSkillData] = useState<Skill>({
  //   sessionName: '',
  //   headerName: '',
  //   languages: [],
  //   technical: [],
  // });

  const appSetting = useContext(SettingsAppContext)
  console.log(appSetting)

  return (
    <Flex
      direction={'column'}
      overflow={'auto'}
      h={
        appSetting.state.isPortraitLayout
          ? appSetting.state.hideForm
            ? '0vh'
            : '30vh'
          : '100%'
      }
    >
      <PersonalSession
        setProfileData={setProfileData}
        profileData={profileData}
      />
      {/* <SkillSession setSkillData={setSkillData} skillData={skillData} /> */}
      {/* <EducationSession
        setEducationData={setEducationData}
        educationData={educationData}
      /> */}
    </Flex>
  )
}
export default CVFormSidebar
