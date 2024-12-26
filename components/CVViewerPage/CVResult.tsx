import { Box, Button, Flex } from '@chakra-ui/react'
import { useRouter } from 'next/router'
import React from 'react'
import { styled } from 'styled-components'
import {
  Certification,
  CVData,
  Education,
  Experiences,
  ExtraSkill,
  PersonalInformation,
  Project,
  Skill,
} from '../../types/cvProps'
import PersonalInformationSection from './PersonalInformation'
import EducationSection from './Education'
import SkillSection from './Skill'
import ExtraSkillSection from './ExtraSkill'
import ProjectSection from './Project'
import CertificateSection from './Certification'
import WorkExperience from './WorkExperience'

const CVResult = ({
  cvData,
  style,
}: {
  cvData: CVData
  style?: React.CSSProperties
}) => {
  const router = useRouter()

  // const [data, setData] = useState([])sí

  // useEffect(() => {
  //   setData((_prev) => (_prev = cvData))
  // }, [])

  // console.log(router.asPath)

  // const [isPageBreak, setIsPageBreak] = useState(false)

  const totalPage = 1
  // const [totalPage, setTotalPage] = useState(1)

  return (
    <Flex
      direction={'column'}
      bgColor={'rgb(204,204,204)'}
      flex={1}
      alignItems={'center'}
      justifyContent={'center'}
      h={'100%'}
      overflowY={router.asPath.includes('edit') ? 'scroll' : 'hidden'}
      p={'0px'}
      style={style}
      // pt={calc(${navbarHeight}px + 20px)}
      gap={'20px'}
    >
      {!router.asPath.includes('edit') && (
        <Flex
          id="download-button"
          position={'sticky'}
          pt={'20px'}
          // top={0}
          zIndex={999}
          flex={1}
          // bgColor={'red'}
          alignItems={'center'}
          justifyContent={'center'}
        >
          <Button
            onClick={() => {
              console.log('download cv')
              const A4Paper = document.getElementById('A4Paper')
              A4Paper!.style.boxShadow = 'none'
              const DownloadButton = document.getElementById('download-button')
              DownloadButton!.style.display = 'none'

              const printStyles = `@media print {
                @page {
                  margin: 0;
                }
                @page:not(:nth-child(n+2):nth-child(-n+4)) {
                  display: none;
                }
              }`

              const printStylesElement = document.createElement('style')
              printStylesElement.innerHTML = printStyles

              document.head.appendChild(printStylesElement)

              window.onbeforeprint = () => {
                A4Paper!.style.boxShadow = 'none'
                DownloadButton!.style.display = 'none'
              }

              window.onafterprint = () => {
                document.head.removeChild(printStylesElement)
                A4Paper!.style.boxShadow = '0 0 0.5cm rgba(0, 0, 0, 0.5)'
                DownloadButton!.style.display = 'flex'
              }

              // Wait for the styles to be applied before printing
              setTimeout(() => {
                window.print()
              }, 100)
            }}
          >
            Download
          </Button>
        </Flex>
      )}
      {Array.from({ length: totalPage }, (_, index) => index).map(
        (pageNumber: number) => (
          <A4Paper
            key={pageNumber}
            id={'A4Paper'}
            size="A4"
            p={'20px'}
            bgColor={'white'}
            minW={'21cm'}
            maxW={'21cm'}
            minH={'29.7cm'}
            // maxH={'29.7cm'}
            overflowY={'hidden'}
            style={{
              breakInside: 'avoid',
              marginTop: router.asPath.includes('edit') ? '400px' : '0px',
            }}
          >
            {cvData.map((_, key) => (
              <React.Fragment key={key}>
                {
                  {
                    personalInformation: (
                      <PersonalInformationSection
                        data={_ as PersonalInformation}
                      />
                    ),
                    education: <EducationSection data={_ as Education} />,
                    skill: <SkillSection data={_ as Skill} />,
                    project: <ProjectSection data={_ as Project} />,
                    workExperience: <WorkExperience data={_ as Experiences} />,
                    extraSkill: <ExtraSkillSection data={_ as ExtraSkill} />,
                    certification: (
                      <CertificateSection data={_ as Certification} />
                    ),
                  }[_.sessionName]
                }
              </React.Fragment>
            ))}
          </A4Paper>
        ),
      )}
    </Flex>
  )
}

export default CVResult

const A4Paper = styled(Box)`
  background: white;
  display: block;
  margin-bottom: 0.5cm;
  margin-top: 0.5cm;
  box-shadow: 0 0 0.5cm rgba(0, 0, 0, 0.5);

  /* Add any other styles you want for the A4 paper component */
`
