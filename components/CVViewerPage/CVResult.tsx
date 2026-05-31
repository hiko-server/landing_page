import { Box, Flex } from '@chakra-ui/react'
import { useRouter } from 'next/router'
import React from 'react'
import styled from 'styled-components'
import {
  PersonalInformation,
  Education,
  Skill,
  Project,
  Experiences,
  ExtraSkill,
  CompetitionAwards,
  // Certification,
  CVData,
} from '../../types/cvProps'
// import CertificateSection from './Certification'
import EducationSection from './Education'
import ExtraSkillSection from './ExtraSkill'
import PersonalInformationSection from './PersonalInformation'
import ProjectSection from './Project'
import SkillSection from './Skill'
import WorkExperience from './WorkExperience'
import CompetitionAwardsSection from './CompetitionAwards'

/**
 * CVResult — renders the A4 sheet.
 *
 * v6: the original FaFileDownload button (which sat sticky-top with handlePrint)
 * has been removed. The /cv page now owns the print/download chrome via the
 * 'Print / Save as PDF' button in its toolbar, which simply calls
 * window.print(). The A4-specific print rules live in styles/globals.css so
 * window.print() produces a clean single-page document.
 */
const CVResult = ({
  cvData,
  style,
}: {
  cvData: CVData
  style?: React.CSSProperties
}) => {
  const router = useRouter()
  const pi = cvData.find(s => s.sessionName === 'personalInformation') as PersonalInformation | undefined
  const sepColor = pi?.separatorColor || 'blue'

  return (
    <Flex
      className="cv-print-flow"
      direction="column"
      flex={1}
      alignItems="center"
      justifyContent="center"
      h="100%"
      overflowY={router.asPath.includes('edit') ? 'scroll' : 'visible'}
      p="0px"
      style={style}
      gap="20px"
    >
      <PrintArea id="print-area">
        {/* Render CV content here */}
        {Array.from({ length: 1 }, (_, index) => (
          <A4Paper
            key={index}
            id="A4Paper"
            size="A4"
            p="20px"
            bgColor="white"
            minW="21cm"
            maxW="21cm"
            minH="29.7cm"
            style={{
              marginTop: router.asPath.includes('edit') ? '400px' : '0px',
              ['--cv-separator-color' as any]: sepColor,
            }}
          >
            {cvData
              .filter((section) => section.isVisible !== false)
              .map(
              (
                section: { sessionName: string | number },
                index: number
              ) => (
                <React.Fragment key={section.sessionName || index}>
                  {
                    {
                      personalInformation: (
                        <PersonalInformationSection
                          data={section as PersonalInformation}
                        />
                      ),
                      education: (
                        <EducationSection data={section as Education} />
                      ),
                      skill: <SkillSection data={section as Skill} />,
                      project: <ProjectSection data={section as Project} />,
                      workExperience: (
                        <WorkExperience data={section as Experiences} />
                      ),
                      competitionAwards: (
                        <CompetitionAwardsSection
                          data={section as CompetitionAwards}
                        />
                      ),
                      extraSkill: (
                        <ExtraSkillSection data={section as ExtraSkill} />
                      ),
                      // certification: (
                      //   <CertificateSection data={section as Certification} />
                      // ),
                    }[section.sessionName]
                  }
                </React.Fragment>
              )
            )}
          </A4Paper>
        ))}
      </PrintArea>
    </Flex>
  )
}

export default CVResult

const PrintArea = styled.div`
  /* Ensure this div contains all the content that should be printed */
  @media print {
    width: 210mm !important;
    margin: 0 !important;
    /* Flow in normal order so multi-page CVs paginate instead of overlapping
       (see styles/globals.css #print-area). */
    position: static !important;
  }
`

const A4Paper = styled(Box)`
  background: white;
  color: #111;
  font-family: 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji',
    'Segoe UI Symbol', 'Noto Color Emoji', sans-serif;
  display: block;
  margin-bottom: 0.5cm;
  margin-top: 0.5cm;
  box-sizing: border-box;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  page-break-inside: auto;
  break-inside: auto;

  @media print {
    width: 210mm !important;
    min-height: 297mm !important;
    margin: 0 !important;
    padding: 0 !important;
    box-shadow: none !important;
  }

  /* Add any other styles you want for the A4 paper component */
`
