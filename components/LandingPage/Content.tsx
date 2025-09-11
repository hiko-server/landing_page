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
import ContactCard from '../Contact/ConatactCard'
import TopRepos from '../GitHub/TopRepos'
import TechCloud from '../TechStack/TechCloud'
import LanguageBars from '../GitHub/LanguageBars'
import ActivityFeed from '../GitHub/ActivityFeed'
import StatsBar from '../GitHub/StatsBar'
import SectionReveal from '../General-UI/SectionReveal'

const StyledBox = styled(Box)`
  background: white;
  display: block;
  margin-bottom: 0.5cm;
  margin-top: 0.5cm;
  width: 100%;
  max-width: 21cm;
  /* Add any other styles you want for the A4 paper component */
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

const Content = ({ quickAccess, photos, cvEn, cvZh }: { quickAccess?: { label: string; url: string }[]; photos?: ScrollerImage[]; cvEn?: any[]; cvZh?: any[] }) => {
  const router = useRouter()
  const isEditMode = router.asPath.includes('edit')

  return (
    <Flex
      direction="row"
      alignItems="center"
      justifyContent="center"
      p={['20px', '40px']}
      gap={['20px', '40px']}
    >
      <Flex
        direction="column"
        alignItems="center"
        justifyContent="center"
        p={['20px', '40px']}
        gap={['20px', '40px']}
      >
        <SectionReveal>
          <StatsBar />
        </SectionReveal>
        <SectionReveal>
          <ImageScroller images={photos} />
        </SectionReveal>
        <SectionReveal>
          <ContactCard />
        </SectionReveal>
      </Flex>
      <StyledBox
        id="A4Paper"
        size="A4"
        p={'20px'}
        bgColor={'white'}
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
              <ButtonGroup quickAccess={quickAccess} />
            </VStack>
          </QuickAccessAccordionItem>
        </Accordion>

        <SectionReveal>
          <Heading as="h3" size="md" mt={8} mb={2} textAlign="center" color={useColorModeValue('blue.700','blue.200')}>Top GitHub Repositories</Heading>
          <TopRepos />
        </SectionReveal>

        <SectionReveal>
          <Heading as="h3" size="md" mt={10} mb={2} textAlign="center" color={useColorModeValue('blue.700','blue.200')}>Tech Stack</Heading>
          <TechCloud />
          <Box mt={8}>
            <LanguageBars />
          </Box>
        </SectionReveal>

        <SectionReveal>
          <Heading as="h3" size="md" mt={10} mb={2} textAlign="center" color={useColorModeValue('blue.700','blue.200')}>Recent GitHub Activity</Heading>
          <ActivityFeed />
        </SectionReveal>

        <SectionReveal>
          <LandingCVSections en={cvEn} zh={cvZh} />
        </SectionReveal>
      </StyledBox>
    </Flex>
  )
}



const ButtonGroup = ({ quickAccess }: { quickAccess?: { label: string; url: string }[] }) => (
  <Flex
    mt={8}
    w={['100%', '350px']}
    direction="column"
    alignItems="center"
    justifyContent="center"
  >
    {(quickAccess || []).map((btn) => (
      <Button
        key={btn.label}
        size="lg"
        w="70%"
        fontSize={'24px'}
        mb={3}
        onClick={() => window.open(btn.url)}
        as={motion.button}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
      >
        <Text color={useColorModeValue('blue.700','blue.200')}>{btn.label}</Text>
      </Button>
    ))}
  </Flex>
)


export default Content
