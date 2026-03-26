import React, { useState } from 'react'
import EducationSection from '../PersonalInstruction/Education'
import ProjectSection from '../PersonalInstruction/Project'
import SkillSection from '../PersonalInstruction/Skill'
import CertificateSection from '../PersonalInstruction/Certificate'
// Accept cv data via props instead of static imports
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

const LandingCVSections = ({ en, zh }: { en?: any[]; zh?: any[] }) => {
  let cvData: any[] = []
  const [language, setLanguage] = useState('en')
  switch (language) {
    case 'en':
      cvData = en || []
      break
    case 'zh':
      cvData = zh || []
      break
    default:
      cvData = en || []
  }

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
        return (
          <CompetitionAwardsSection
            data={section as CompetitionAwards}
          />
        )
      case 'project':
        return <ProjectSection data={section as Project} />
      default:
        return null
    }
  }

  return (
    <>
      <div>
        <label htmlFor="language-select">Select Language: </label>
        <select
          id="language-select"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="en">English</option>
          <option value="zh">Chinese</option>
        </select>
      </div>
      {cvData.map((section: any, key: number) => (
        <React.Fragment key={key}>{renderSection(section)}</React.Fragment>
      ))}
    </>
  )
}

export default LandingCVSections
