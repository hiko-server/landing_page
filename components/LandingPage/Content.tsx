import React from 'react'
import { useRouter } from 'next/router'
import { Box, Flex, useColorModeValue } from '@chakra-ui/react'

import ImageScroller from '../imageScoller/imageScroller'
import type { ScrollerImage } from '../imageScoller/imageScroller'

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
import SectionLabel from '../General-UI/SectionLabel'
import type { HomeData } from '../../lib/home'

/**
 * v6 home Content.
 *
 * Replaces v5's two-column layout with a centered single-column flow under the
 * Hero. No more A4Paper-styled wrapper / orange border / heavy panel chrome —
 * each section is announced with a monospace [NN] label and sits flat on the
 * dot-grid background.
 *
 * Left column from v5 (StatsBar + ImageScroller + ContactPro) is hoisted into
 * the main flow: StatsBar runs full-width above the section grid (sets the
 * engineer-credibility tone), photo strip + contact form remain available but
 * intermixed with the editorial sections.
 *
 * Removed: A4Paper StyledBox wrapper, Quick Access accordion (CTAs already
 * live in the Hero and Header).
 */

const Content = ({
  photos,
  cvEn,
  home,
}: {
  // `quickAccess` and `cvZh` no longer rendered here (Hero CTAs cover quick
  // access; full bilingual CV lives at /cv) but the props are kept for
  // backward-compat with the parent LandingContent component.
  quickAccess?: { label: string; url: string }[]
  photos?: ScrollerImage[]
  cvEn?: any[]
  cvZh?: any[]
  home?: HomeData | null
}) => {
  const router = useRouter()
  const isEditMode = router.asPath.includes('edit')
  const border = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.10)')

  return (
    <Box
      w="100%"
      maxW="var(--container-content)"
      mx="auto"
      px={{ base: 4, md: 6, lg: 8 }}
      pt={{ base: 10, md: 16 }}
      pb={{ base: 12, md: 20 }}
      style={{ marginTop: isEditMode ? '320px' : '0px' }}
    >
      {/* [02] OPEN SOURCE — GitHub stats banner spanning full width */}
      <SectionReveal>
        <Box mb={{ base: 16, md: 24 }}>
          <SectionLabel n={2} mb={6}>
            Open Source
          </SectionLabel>
          <StatsBar />
          <Box mt={6}>
            <TopRepos />
          </Box>
        </Box>
      </SectionReveal>

      {/* [03] TECH STACK */}
      <SectionReveal>
        <Box mb={{ base: 16, md: 24 }}>
          <SectionLabel n={3} mb={6}>
            Tech Stack
          </SectionLabel>
          <TechCloud />
          <Box mt={10}>
            <LanguageBars />
          </Box>
        </Box>
      </SectionReveal>

      {/* [04] RECENT ACTIVITY */}
      <SectionReveal>
        <Box mb={{ base: 16, md: 24 }}>
          <SectionLabel n={4} mb={6}>
            Recent Activity
          </SectionLabel>
          <ActivityFeed />
        </Box>
      </SectionReveal>

      {/* [05] SELECTED PROJECTS — horizontal scroller */}
      <SectionReveal>
        <Box mb={{ base: 16, md: 24 }}>
          <SectionLabel n={5} mb={6}>
            Selected Projects
          </SectionLabel>
          <ProjectSpotlight cvEn={cvEn} />
        </Box>
      </SectionReveal>

      {/* [06] EXPERIENCE TIMELINE */}
      <SectionReveal>
        <Box mb={{ base: 16, md: 24 }}>
          <SectionLabel n={6} mb={6}>
            Experience
          </SectionLabel>
          <ExperienceTimeline cvEn={cvEn} />
        </Box>
      </SectionReveal>

      {/* [07] CERTIFICATIONS */}
      <SectionReveal>
        <Box mb={{ base: 16, md: 24 }}>
          <SectionLabel n={7} mb={6}>
            Certifications
          </SectionLabel>
          <CertificationsPeek cvEn={cvEn} />
        </Box>
      </SectionReveal>

      {/* Photos + Contact (side by side on desktop, stacked on mobile) */}
      <Flex
        direction={{ base: 'column', md: 'row' }}
        gap={{ base: 12, md: 8 }}
        align="flex-start"
        pt={{ base: 8, md: 12 }}
        borderTop="1px solid"
        borderColor={border}
      >
        <Box flex={{ base: 'none', md: '0 0 380px' }} w={{ base: '100%', md: '380px' }}>
          <SectionLabel n={8} mb={6}>
            Field Notes
          </SectionLabel>
          <ImageScroller images={photos} />
        </Box>
        <Box flex="1" minW={0} w="100%">
          <SectionLabel n={9} mb={6}>
            Get In Touch
          </SectionLabel>
          <ContactPro home={home || undefined} formOnly />
        </Box>
      </Flex>
    </Box>
  )
}

export default Content
