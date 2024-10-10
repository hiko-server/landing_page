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
} from '@chakra-ui/react'
import { styled } from 'styled-components'
import { useRouter } from 'next/router'
import 'react-photo-view/dist/react-photo-view.css'
import ImageScroller from '../imageScoller/imageScroller'
import React from 'react'
import { Education, Skill, Project } from '../../types/cvProps'
import EducationSection from '../PersonalInstruction/Education'
import ProjectSection from '../PersonalInstruction/Project'
import SkillSection from '../PersonalInstruction/Skill'
import { exampleCvData } from '../../example/example'

const Content = () => {
  const router = useRouter()

  return (
    <Flex
      direction="column"
      alignItems="center"
      justifyContent="center"
      p={['20px', '40px']}
      gap={['20px', '40px']}
    >
      <Flex
        direction="column"
        flex={1}
        alignItems="center"
        justifyContent="center"
        h="100%"
        overflowY={router.asPath.includes('edit') ? 'scroll' : 'hidden'}
        p="0px"
        gap={['20px', '40px']}
      >
        <Text
          fontSize={['20px', '22px']}
          textAlign="center"
          maxW="600px"
          fontWeight="bold"
        >
          Passionate Self-Taught Full-Stack Software Engineer | Exploring
          Innovative Solutions in Computer Science | Typescript | React |
          Next.js | NestJS | Python FastAPI
        </Text>
        {/* vvv image scroller vvv */}
        <ImageScroller />
        {/* ^^^ image scroller ^^^ */}

        <Accordion allowToggle width="100%" maxW="1000px" mt={[4, 8]}>
          <AccordionItem>
            <AccordionButton _expanded={{ bg: 'gray.100' }}>
              <Flex
                flex="1"
                textAlign="left"
                fontWeight="bold"
                alignItems="center"
                justifyContent="center"
              >
                <Text fontSize="25" fontWeight="bold">
                  Quick Access
                </Text>
              </Flex>
              <AccordionIcon />
            </AccordionButton>

            <AccordionPanel pb={4}>
              <VStack
                spacing={4}
                align="stretch"
                alignItems="center"
                justifyContent="center"
              >
                <Flex
                  mt={8}
                  w={['100%', '350px']}
                  direction="column"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Button
                    size="25"
                    w="70%"
                    fontSize={'24px'}
                    mb={3}
                    onClick={() => window.open('https://asa.hiko-prime.com/')}
                  >
                    ASA
                  </Button>
                  <Button
                    size="25"
                    w="70%"
                    fontSize={'24px'}
                    mb={6}
                    onClick={() => window.open('https://hiko.dev/cv/edit')}
                  >
                    CV Generator Demo
                  </Button>
                </Flex>
              </VStack>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>

        {/*  */}
        <Flex direction="column" alignItems="center" justifyContent="center">
          {Array.from({ length: 1 }, (_, index) => index).map(
            (pageNumber: number) => (
              <A4Paper
                key={pageNumber}
                id={'A4Paper'}
                size="A4"
                p={'20px'}
                bgColor={'white'}
                minW={'21cm'}
                maxW={'21cm'}
                // minH={'29.7cm'}
                overflowY={'hidden'}
                style={{
                  breakInside: 'avoid',
                  marginTop: router.asPath.includes('edit') ? '400px' : '0px',
                }}
              >
                {exampleCvData.map((_, key) => (
                  <React.Fragment key={key}>
                    {
                      {
                        education: <EducationSection data={_ as Education} />,
                        skill: <SkillSection data={_ as Skill} />,
                        project: <ProjectSection data={_ as Project} />,
                      }[_.sessionName]
                    }
                  </React.Fragment>
                ))}
              </A4Paper>
            ),
          )}
        </Flex>
      </Flex>
    </Flex>
  )
}

export default Content

const A4Paper = styled(Box)`
  background: white;
  display: block;
  margin-bottom: 0.5cm;
  margin-top: 0.5cm;

  /* Add any other styles you want for the A4 paper component */
`
