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
  Badge,
  useColorModeValue,
} from '@chakra-ui/react'
import styled from 'styled-components'
import { motion } from 'framer-motion'

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
import type { HomeData } from '../../lib/home'

const StyledBox = styled(Box)`
  display: block;
  width: 100%;
  max-width: 1100px;
`

const SurfaceCard = ({ children, id }: { children: React.ReactNode; id?: string }) => {
  const bg = useColorModeValue('rgba(255,255,255,0.9)', 'rgba(22,28,36,0.72)')
  const border = useColorModeValue('rgba(15,23,42,0.08)', 'rgba(226,232,240,0.14)')

  return (
    <Box
      id={id}
      bg={bg}
      border="1px solid"
      borderColor={border}
      borderRadius="20px"
      boxShadow="0 18px 45px rgba(2, 6, 23, 0.12)"
      backdropFilter="blur(14px)"
      p={{ base: 5, md: 7 }}
      mt={8}
    >
      {children}
    </Box>
  )
}

const SectionHeading = ({ icon, children }: { icon?: string; children: React.ReactNode }) => {
  const headingColor = useColorModeValue('gray.800', 'orange.100')
  const accentLine = useColorModeValue(
    'linear-gradient(90deg, #dd6b20, #f59e0b)',
    'linear-gradient(90deg, #f97316, #fbbf24)'
  )
  return (
    <Box mb={4}>
      <Flex align="center" gap={2} mb={2}>
        {icon && <Box fontSize="lg">{icon}</Box>}
        <Heading as="h3" size="md" color={headingColor} fontFamily="'Sora', sans-serif" letterSpacing="0.01em">
          {children}
        </Heading>
      </Flex>
      <Box h="2px" w="40px" bgImage={accentLine} borderRadius="2px" />
    </Box>
  )
}

const QuickAccessAccordionItem = ({ children }: { children: React.ReactNode | null }) => {  const expandedBg = useColorModeValue('orange.50', 'gray.700')
  const titleColor = useColorModeValue('gray.800', 'orange.200')
  const panelColor = useColorModeValue('gray.800', 'gray.100')
  const border = useColorModeValue('orange.100', 'gray.600')

  return (
    <AccordionItem borderWidth="1px" borderColor={border} mb={4} borderRadius="18px" overflow="hidden">
      <h2>
        <AccordionButton _expanded={{ bg: expandedBg, transition: 'background-color 0.3s ease' }} py={5}>
          <Box flex="1" textAlign="left" px={2}>
            <Badge mb={2} colorScheme="orange" px={3} py={1} borderRadius="full">
              Navigation
            </Badge>
            <Heading as="h3" size="md" color={titleColor} letterSpacing="0.5px">
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

const Content = ({
  quickAccess,
  photos,
  cvEn,
  cvZh,
  home,
}: {
  quickAccess?: { label: string; url: string }[]
  photos?: ScrollerImage[]
  cvEn?: any[]
  cvZh?: any[]
  home?: HomeData | null
}) => {
  const router = useRouter()
  const isEditMode = router.asPath.includes('edit')
  const panelBg = useColorModeValue('linear-gradient(180deg, rgba(255,255,255,0.85), rgba(255,250,242,0.72))', 'linear-gradient(180deg, rgba(30,41,59,0.6), rgba(15,23,42,0.5))')

  return (
    <Flex
      direction="row"
      alignItems="flex-start"
      justifyContent="center"
      p={{ base: '16px', md: '28px' }}
      gap={{ base: '16px', md: '28px' }}
      flexWrap="wrap"
      w="100%"
      maxW="1320px"
      mx="auto"
    >
      <Flex
        direction="column"
        alignItems="center"
        justifyContent="flex-start"
        p={{ base: '16px', md: '24px' }}
        gap={{ base: '16px', md: '24px' }}
        w={{ base: '100%', md: '390px' }}
        flexShrink={0}
      >
        <SectionReveal>
          <SurfaceCard>
            <StatsBar />
          </SurfaceCard>
        </SectionReveal>
        <SectionReveal>
          <SurfaceCard>
            <ImageScroller images={photos} />
          </SurfaceCard>
        </SectionReveal>
        <SectionReveal>
          <SurfaceCard>
            <ContactPro home={home || undefined} formOnly />
          </SurfaceCard>
        </SectionReveal>
      </Flex>

      <StyledBox
        id="A4Paper"
        size="A4"
        p={{ base: '18px', md: '26px' }}
        bg={panelBg}
        overflow="hidden"
        flex={1}
        minW={0}
        borderRadius="26px"
        border="1px solid"
        borderColor={useColorModeValue('rgba(120,53,15,0.12)', 'rgba(226,232,240,0.15)')}
        boxShadow="0 28px 60px rgba(2,6,23,0.18)"
        sx={{ boxSizing: 'border-box', position: 'relative', zIndex: 0 }}
        style={{
          breakInside: 'avoid',
          marginTop: isEditMode ? '320px' : '0px',
        }}
      >
        <SurfaceCard>
          <Accordion allowToggle width="100%" maxW="1000px" mt={0}>
            <QuickAccessAccordionItem>
              <VStack spacing={4} align="stretch" alignItems="center" justifyContent="center">
                <ButtonGroup quickAccess={quickAccess} />
              </VStack>
            </QuickAccessAccordionItem>
          </Accordion>
        </SurfaceCard>

        <SurfaceCard id="section-github">
          <SectionHeading icon="🐙">Top GitHub Repositories</SectionHeading>
          <TopRepos />
        </SurfaceCard>

        <SurfaceCard id="section-tech">
          <SectionHeading icon="⚙️">Tech Stack</SectionHeading>
          <TechCloud />
          <Box mt={8}>
            <LanguageBars />
          </Box>
        </SurfaceCard>

        <SurfaceCard id="section-activity">
          <SectionHeading icon="📈">Recent GitHub Activity</SectionHeading>
          <ActivityFeed />
        </SurfaceCard>

        <SurfaceCard id="section-projects">
          <SectionHeading icon="🚀">Project Spotlight</SectionHeading>
          <ProjectSpotlight cvEn={cvEn} />
        </SurfaceCard>

        <SurfaceCard id="section-experience">
          <SectionHeading icon="💼">Experience Timeline</SectionHeading>
          <ExperienceTimeline cvEn={cvEn} />
        </SurfaceCard>

        <SurfaceCard id="section-certs">
          <SectionHeading icon="🏅">Certifications</SectionHeading>
          <CertificationsPeek cvEn={cvEn} />
        </SurfaceCard>

        <SurfaceCard>
          <LandingCVSections en={cvEn} zh={cvZh} />
        </SurfaceCard>
      </StyledBox>
    </Flex>
  )
}

const ButtonGroup = ({ quickAccess }: { quickAccess?: { label: string; url: string }[] }) => {
  const textColor = useColorModeValue('gray.800', 'orange.100')
  const bg = useColorModeValue('orange.100', 'gray.700')

  return (
    <Flex mt={2} w={{ base: '100%', md: '430px' }} direction="column" alignItems="center" justifyContent="center">
      {(quickAccess || []).map((btn) => (
        <Button
          key={btn.label}
          size="lg"
          w="100%"
          fontSize={{ base: '16px', md: '18px' }}
          fontWeight="700"
          mb={3}
          px={6}
          py={6}
          borderRadius="14px"
          bg={bg}
          onClick={() => window.open(btn.url)}
          as={motion.button}
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.98 }}
        >
          <Text color={textColor}>{btn.label}</Text>
        </Button>
      ))}
    </Flex>
  )
}

export default Content
