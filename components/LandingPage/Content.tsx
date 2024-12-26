import React from 'react'
import { useRouter } from 'next/router'
import {
  Text,
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Flex,
  VStack,
  Button,
  Box,
  Heading,
} from '@chakra-ui/react'
import styled from 'styled-components'
import ImageScroller from '../imageScoller/imageScroller'
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

const StyledBox = styled(Box)`
  background: white;
  display: block;
  margin-bottom: 0.5cm;
  margin-top: 0.5cm;
  /* Add any other styles you want for the A4 paper component */
`

const QuickAccessAccordionItem = ({
  children,
}: {
  children: React.ReactNode | null
}) => (
  <AccordionItem borderWidth="1px" borderColor="gray.200" mb={4}>
    <h2>
      <AccordionButton _expanded={{ bg: 'gray.100' }}>
        <Box flex="1" textAlign="center" fontWeight="bold" p={4}>
          <Heading as="h3" size="md" textTransform="uppercase" color="blue.700">
            Quick Access
          </Heading>
        </Box>
        <AccordionIcon />
      </AccordionButton>
    </h2>
    <AccordionPanel px={6} py={4}>
      {children}
    </AccordionPanel>
  </AccordionItem>
)

const Content = () => {
  const router = useRouter()
  const isEditMode = router.asPath.includes('edit')

  return (
    <Flex
      direction="column"
      alignItems="center"
      justifyContent="center"
      p={['20px', '40px']}
      gap={['20px', '40px']}
    >
      <IntroductionText />
      <ImageScroller />
      <StyledBox
        id="A4Paper"
        size="A4"
        p={'20px'}
        bgColor={'white'}
        minW={'21cm'}
        maxW={'21cm'}
        overflowY={isEditMode ? 'scroll' : 'hidden'}
        style={{
          breakInside: 'avoid',
          marginTop: isEditMode ? '400px' : '0px',
        }}
      >
        <Accordion
          allowToggle
          width="100%"
          maxW="1000px"
          mt={[8, 16]}
          boxShadow="lg"
          borderRadius="md"
        >
          <QuickAccessAccordionItem>
            <VStack
              spacing={4}
              align="stretch"
              alignItems="center"
              justifyContent="center"
            >
              <ButtonGroup />
            </VStack>
          </QuickAccessAccordionItem>
        </Accordion>
        <CVSections />
      </StyledBox>
    </Flex>
  )
}

const IntroductionText = () => (
  <Text
    fontSize={['20px', '22px']}
    textAlign="center"
    maxW="600px"
    fontWeight="bold"
  >
    Self-Taught Full-Stack Software Engineer | Exploring Innovative Solutions in
    Computer Science | Machine Learning | Computer Vision | Typescript | React |
    Next.js | NestJS | Python FastAPI
  </Text>
)

const ButtonGroup = () => (
  <Flex
    mt={8}
    w={['100%', '350px']}
    direction="column"
    alignItems="center"
    justifyContent="center"
  >
    <Button
      size="lg"
      w="70%"
      fontSize={'24px'}
      mb={3}
      onClick={() => window.open('https://asa.hiko-prime.com/')}
    >
      ASA
    </Button>
    <Button
      size="lg"
      w="70%"
      fontSize={'24px'}
      mb={6}
      onClick={() => window.open('https://hiko.dev/cv/edit')}
    >
      CV Generator Demo
    </Button>
  </Flex>
)

const CVSections = () => (
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

export default Content
