import React, { useState } from 'react'
import {
  Badge,
  Box,
  Button,
  ButtonGroup,
  Stack,
  Text,
  useColorModeValue,
} from '@chakra-ui/react'
import EducationSection from '../PersonalInstruction/Education'
import ProjectSection from '../PersonalInstruction/Project'
import SkillSection from '../PersonalInstruction/Skill'
import CertificateSection from '../PersonalInstruction/Certificate'
import {
  Certification,
  Education,
  Experiences,
  Project,
  Skill,
  CompetitionAwards,
} from '../../types/cvProps'
import WorkExperience from '../PersonalInstruction/WorkExperience'
import CompetitionAwardsSection from '../PersonalInstruction/CompetitionAwards'
import SectionStatusCard from '../General-UI/SectionStatusCard'

const LandingCVSections = ({ en, zh }: { en?: any[]; zh?: any[] }) => {
  const [language, setLanguage] = useState('en')
  const labelColor = useColorModeValue('gray.600', 'gray.300')

  const cvData = language === 'zh' ? zh || [] : en || []
  const hasChinese = Array.isArray(zh) && zh.length > 0

  const renderSection = (section: any) => {
    switch (section.sessionName) {
      case 'education':
        return <EducationSection data={section as Education} />
      case 'skill':
        return <SkillSection data={section as Skill} />
      case 'certification':
        return <CertificateSection data={section as Certification} />
      case 'workExperience':
        return <WorkExperience data={section as Experiences} />
      case 'competitionAwards':
        return <CompetitionAwardsSection data={section as CompetitionAwards} />
      case 'project':
        return <ProjectSection data={section as Project} />
      default:
        return null
    }
  }

  return (
    <Stack spacing={5} w="100%">
      <Stack spacing={3} alignItems="flex-start">
        <Badge colorScheme="teal" px={3} py={1} borderRadius="full">
          CV sections
        </Badge>
        <Text color={labelColor}>
          Switch languages to browse the available resume sections without leaving the page.
        </Text>
        <ButtonGroup>
          <Button
            colorScheme={language === 'en' ? 'teal' : 'gray'}
            variant={language === 'en' ? 'solid' : 'outline'}
            onClick={() => setLanguage('en')}
          >
            English
          </Button>
          <Button
            colorScheme={language === 'zh' ? 'teal' : 'gray'}
            variant={language === 'zh' ? 'solid' : 'outline'}
            onClick={() => setLanguage('zh')}
            isDisabled={!hasChinese}
          >
            中文
          </Button>
        </ButtonGroup>
      </Stack>

      {cvData.length ? (
        cvData.map((section: any, key: number) => (
          <React.Fragment key={section.sessionName || key}>
            {renderSection(section)}
          </React.Fragment>
        ))
      ) : (
        <Box w="100%">
          <SectionStatusCard
            title="CV sections are not available yet"
            description="Resume data for this language has not been added yet. You can still use the main contact page to request the latest version."
          />
        </Box>
      )}
    </Stack>
  )
}

export default LandingCVSections
