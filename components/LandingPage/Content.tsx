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
import { motion } from 'framer-motion'
import { useColorModeValue } from '@chakra-ui/react'
import ImageScroller from '../imageScoller/imageScroller'
import type { ScrollerImage } from '../imageScoller/imageScroller'

import LandingCVSections from './LandingCVSections'
import ContactPro from '../Contact/ContactPro'
import TopRepos from '../GitHub/TopRepos'
import TechCloud from '../TechStack/TechCloud'
import LanguageBars from '../GitHub/LanguageBars'
import ActivityFeed from '../GitHub/ActivityFeed'
import StatsBar from '../GitHub/StatsBar'
import ProjectSpotlight from './ProjectSpotlight'
import ExperienceTimeline from './ExperienceTimeline'
import CertificationsPeek from './CertificationsPeek'
import SectionReveal from '../General-UI/SectionReveal'

const StyledBox = styled(Box)`
  display: block;
  margin-bottom: 0.5cm;
  margin-top: 0.5cm;
  width: 100%;
  max-width: 1100px; /* 稍微加宽，改善可读性 */
`

const QuickAccessAccordionItem = ({ children }: { children: React.ReactNode | null }) => {
  const expandedBg = useColorModeValue('gray.100','gray.700')
  const titleColor = useColorModeValue('blue.700','blue.200')
  const panelColor = useColorModeValue('gray.800','gray.100')
  const border = useColorModeValue('gray.200','gray.600')
  return (
    <AccordionItem borderWidth="1px" borderColor={border} mb={4}>
      <h2>
        <AccordionButton _expanded={{ bg: expandedBg, transition: 'background-color 0.3s ease' }}>
          <Box flex="1" textAlign="center" fontWeight="bold" p={4}>
            <Heading as="h3" size="md" textTransform="uppercase" color={titleColor}>
              Quick Access
            </Heading>
          </Box>
          <AccordionIcon />
        </AccordionButton>
      </h2>
      <AccordionPanel px={6} py={4} color={panelColor} transition="color 0.3s ease">
        {children}
      </AccordionPanel>
    </AccordionItem>
  )
}

import type { HomeData } from '../../lib/home'

const Content = ({ quickAccess, photos, cvEn, cvZh, home }: { quickAccess?: { label: string; url: string }[]; photos?: ScrollerImage[]; cvEn?: any[]; cvZh?: any[]; home?: HomeData | null }) => {
  const router = useRouter()
  const isEditMode = router.asPath.includes('edit')
  const sectionTitleColor = useColorModeValue('blue.700', 'blue.200')
  const paperBg = useColorModeValue('white', 'transparent')

  return (
    <Flex
      direction={{ base: 'column', xl: 'row' }}
      alignItems="stretch"
      justifyContent="center"
      p={{ base: '16px', md: '40px' }}
      gap={{ base: '8', md: '10' }}
      w="100%"
      maxW="1200px"
      mx="auto"
    >
      <Flex
        direction="column"
        alignItems="center"
        justifyContent="flex-start"
        p={{ base: '0', md: '40px' }}
        gap={{ base: '6', md: '10' }}
        w={{ base: '100%', xl: '420px' }}
        flexShrink={0}
      >
        <SectionReveal>
          <StatsBar />
        </SectionReveal>
        <SectionReveal>
          <ImageScroller images={photos} />
        </SectionReveal>
        <SectionReveal>
          <ContactPro home={home || undefined} formOnly />
        </SectionReveal>
      </Flex>
      <StyledBox
        id="A4Paper"
        size="A4"
        p={{ base: '16px', md: '20px' }}
        bgColor={paperBg}
        overflow={'hidden'}
        flex={1}
        minW={0}
        sx={{ boxSizing: 'border-box', position: 'relative', zIndex: 0 }}
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
              <ButtonGroup quickAccess={quickAccess} />
            </VStack>
          </QuickAccessAccordionItem>
        </Accordion>

        <SectionReveal>
          <Heading as="h2" size="md" mt={8} mb={2} textAlign="center" color={sectionTitleColor}>Top GitHub Repositories</Heading>
          <TopRepos />
        </SectionReveal>

        <SectionReveal>
          <Heading as="h2" size="md" mt={10} mb={2} textAlign="center" color={sectionTitleColor}>Tech Stack</Heading>
          <TechCloud />
          <Box mt={8}>
            <LanguageBars />
          </Box>
        </SectionReveal>

        <SectionReveal>
          <Heading as="h2" size="md" mt={10} mb={2} textAlign="center" color={sectionTitleColor}>Recent GitHub Activity</Heading>
          <ActivityFeed />
        </SectionReveal>

        <SectionReveal>
          <Heading as="h2" size="md" mt={10} mb={2} textAlign="center" color={sectionTitleColor}>Project Spotlight</Heading>
          <ProjectSpotlight cvEn={cvEn} />
        </SectionReveal>

        <SectionReveal>
          <Heading as="h2" size="md" mt={10} mb={2} textAlign="center" color={sectionTitleColor}>Experience Timeline</Heading>
          <ExperienceTimeline cvEn={cvEn} />
        </SectionReveal>

        <SectionReveal>
          <CertificationsPeek cvEn={cvEn} />
        </SectionReveal>

        <SectionReveal>
          <LandingCVSections en={cvEn} zh={cvZh} />
        </SectionReveal>
      </StyledBox>
    </Flex>
  )
}

const ButtonGroup = ({ quickAccess }: { quickAccess?: { label: string; url: string }[] }) => {
  const buttonTextColor = useColorModeValue('blue.700', 'blue.200')

  return (
    <Flex
      mt={8}
      w="100%"
      maxW="360px"
      direction="column"
      alignItems="center"
      justifyContent="center"
    >
      {(quickAccess || []).map((btn) => (
        <Button
          key={btn.label}
          size="lg"
          w="100%"
          fontSize={{ base: 'lg', md: '2xl' }}
          mb={3}
          onClick={() => window.open(btn.url)}
          as={motion.button}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
        >
          <Text color={buttonTextColor}>{btn.label}</Text>
        </Button>
      ))}
    </Flex>
  )
}


export default Content
