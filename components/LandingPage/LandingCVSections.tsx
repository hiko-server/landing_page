import React from 'react'
import EducationSection from '../PersonalInstruction/Education'
import ProjectSection from '../PersonalInstruction/Project'
import SkillSection from '../PersonalInstruction/Skill'
import CertificateSection from '../PersonalInstruction/Certificate'
import { cvData } from '../../example/cvdata'
import {
  Certification,
  Education,
  Experiences,
  Project,
  Skill,
} from '../../types/cvProps'
import WorkExperience from '../PersonalInstruction/WorkExperience'


const LandingCVSections = () => (
    <>
      {cvData.map((section, key) => (
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

  export default LandingCVSections