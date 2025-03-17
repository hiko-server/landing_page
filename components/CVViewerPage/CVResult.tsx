import { Box, Button, Flex } from '@chakra-ui/react'
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
import { FaFileDownload } from 'react-icons/fa'

const CVResult = ({
  cvData,
  style,
}: {
  cvData: CVData
  style?: React.CSSProperties
}) => {
  const router = useRouter()

  return (
    <Flex
      direction="column"
      // bgColor="rgb(204,204,204)"
      flex={1}
      alignItems="center"
      justifyContent="center"
      h="100%"
      overflowY={router.asPath.includes('edit') ? 'scroll' : 'hidden'}
      p="0px"
      style={style}
      gap="20px"
    >
      {!router.asPath.includes('edit') && (
        <PrintControl>
          <Button onClick={() => handlePrint()}>
            <FaFileDownload />
          </Button>
        </PrintControl>
      )}
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
            overflowY="hidden"
            style={{
              breakInside: 'avoid',
              marginTop: router.asPath.includes('edit') ? '400px' : '0px',
            }}
          >
            {cvData.map(
              (
                section: { sessionName: string | number },
                key: React.Key | null | undefined
              ) => (
                <React.Fragment key={key}>
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

  function handlePrint() {
    // Hide the download button and set up styles for printing.
    const downloadButton = document.getElementById('download-button')
    if (downloadButton) {
      downloadButton.style.display = 'none'
    }

    // Apply print-specific styles
    const printStyles = `
      @media print {
        body * {
          visibility: hidden;
        }
        #print-area, #print-area * {
          visibility: visible;
        }
        #print-area {
          position: absolute;
          left: 0;
          top: 0;
        }
        /* Ensure Chinese characters are displayed correctly */
        @font-face {
          font-family: 'Noto Sans SC';
          src: url('https://fonts.gstatic.com/s/notosanssc/v8/6xK3dSBYKcSV-LCoeQqfX1RYOo3qNa7lujY.woff2') format('woff2');
        }
        body {
          font-family: 'Noto Sans SC', sans-serif;
        }
      }
    `
    const printStylesElement = document.createElement('style')
    printStylesElement.type = 'text/css'
    printStylesElement.media = 'print'
    printStylesElement.appendChild(document.createTextNode(printStyles))
    document.head.appendChild(printStylesElement)

    window.onafterprint = () => {
      document.head.removeChild(printStylesElement)
      document.getElementById('download-button')!.style.display = 'flex'
    }

    window.print()
  }
}

export default CVResult

const PrintControl = styled(Flex)`
  position: sticky;
  top: 0;
  z-index: 999;
  flex: 1;
  align-items: center;
  justify-content: center;
`

const PrintArea = styled.div`
  /* Ensure this div contains all the content that should be printed */
`

const A4Paper = styled(Box)`
  background: white;
  display: block;
  margin-bottom: 0.5cm;
  margin-top: 0.5cm;

  /* Add any other styles you want for the A4 paper component */
`
