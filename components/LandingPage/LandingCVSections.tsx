import React, { useState } from 'react'
import EducationSection from '../PersonalInstruction/Education'
import ProjectSection from '../PersonalInstruction/Project'
import SkillSection from '../PersonalInstruction/Skill'
import CertificateSection from '../PersonalInstruction/Certificate'
import { cvDataChinese, cvDataEnglish } from '../../example/cvdata'
import {
  Certification,
  Education,
  Experiences,
  Project,
  Skill,
} from '../../types/cvProps'
import WorkExperience from '../PersonalInstruction/WorkExperience'

const LandingCVSections = () => {
  let cvData
  const [language, setLanguage] = useState('en')
  switch (language) {
    case 'en':
      cvData = cvDataEnglish
      break
    case 'zh':
      cvData = cvDataChinese
      break
    default:
      cvData = cvDataEnglish
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
        <React.Fragment key={key}>
          {
            [
              ['education', <EducationSection data={section as Education} />],
              ['skill', <SkillSection data={section as Skill} />],
              [
                'certification',
                <CertificateSection data={section as Certification} />,
              ],

              [
                'workExperience',
                <WorkExperience data={section as Experiences} />,
              ],
              ['project', <ProjectSection data={section as Project} />],
            ].find(([type]) => section.sessionName === type)?.[1]
          }
        </React.Fragment>
      ))}
    </>
  )
}

export default LandingCVSections
