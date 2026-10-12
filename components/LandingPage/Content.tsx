import React from 'react'
import { Box, Flex } from '@chakra-ui/react'

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
import FloatingNav from '../General-UI/FloatingNav'
// Pure shape — must NOT import from lib/home (server-only / better-sqlite3).
import { isSectionVisible, type HomeData } from '../../lib/homeShape'
import type { CvSectionLike } from '../../lib/cvVisibility'
import type { WorkIndexItem } from './projectMatch'

/**
 * v6 home Content.
 *
 * Each [NN] section is now gated through `isSectionVisible(home, key)` so
 * the admin can hide whole rows from the Home editor without code
 * changes. Sections default to visible if the key is missing — clean
 * install keeps the full page.
 *
 * Photos + Contact share a single bottom row on desktop; when only one of
 * them is enabled the surviving side stretches to fill the row instead
 * of leaving a ghost column.
 */

const Content = ({
  photos,
  cvEn,
  home,
  work,
}: {
  photos?: ScrollerImage[]
  /** Website-pruned EN CV, limited to the sections rendered here. */
  cvEn?: CvSectionLike[]
  home?: HomeData | null
  /** /work case-study index used to link project cards. */
  work?: WorkIndexItem[]
}) => {

  const show = {
    openSource: isSectionVisible(home, 'open-source'),
    techStack: isSectionVisible(home, 'tech-stack'),
    activity: isSectionVisible(home, 'activity'),
    projects: isSectionVisible(home, 'projects'),
    experience: isSectionVisible(home, 'experience'),
    certifications: isSectionVisible(home, 'certifications'),
    photos: isSectionVisible(home, 'photos'),
    contact: isSectionVisible(home, 'contact'),
  }

  const hasBottomRow = show.photos || show.contact
  // Anchor targets land below the sticky header, and focus (for keyboard
  // users jumping via the section nav) doesn't paint an outline box.
  const sectionSx = { scrollMarginTop: '80px', '&:focus': { outline: 'none' } }

  return (
    <Box
      w="100%"
      maxW="var(--container-content)"
      mx="auto"
      px={{ base: 4, md: 6, lg: 8 }}
      pt={{ base: 10, md: 16 }}
      pb={{ base: 12, md: 20 }}
    >
      <FloatingNav />
      {/* [02] OPEN SOURCE — GitHub stats banner spanning full width */}
      {show.openSource && (
        <SectionReveal>
          <Box mb={{ base: 16, md: 24 }} id="section-open-source" data-nav-label="Open Source" tabIndex={-1} sx={sectionSx}>
            <SectionLabel n={2} mb={6}>
              Open Source
            </SectionLabel>
            <StatsBar />
            <Box mt={6}>
              <TopRepos />
            </Box>
          </Box>
        </SectionReveal>
      )}

      {/* [03] TECH STACK */}
      {show.techStack && (
        <SectionReveal>
          <Box mb={{ base: 16, md: 24 }} id="section-tech-stack" data-nav-label="Tech Stack" tabIndex={-1} sx={sectionSx}>
            <SectionLabel n={3} mb={6}>
              Tech Stack
            </SectionLabel>
            <TechCloud />
            <Box mt={10}>
              <LanguageBars />
            </Box>
          </Box>
        </SectionReveal>
      )}

      {/* [04] RECENT ACTIVITY */}
      {show.activity && (
        <SectionReveal>
          <Box mb={{ base: 16, md: 24 }} id="section-activity" data-nav-label="Recent Activity" tabIndex={-1} sx={sectionSx}>
            <SectionLabel n={4} mb={6}>
              Recent Activity
            </SectionLabel>
            <ActivityFeed />
          </Box>
        </SectionReveal>
      )}

      {/* [05] SELECTED PROJECTS — horizontal scroller */}
      {show.projects && (
        <SectionReveal>
          <Box mb={{ base: 16, md: 24 }} id="section-projects" data-nav-label="Selected Projects" tabIndex={-1} sx={sectionSx}>
            <SectionLabel n={5} mb={6}>
              Selected Projects
            </SectionLabel>
            <ProjectSpotlight cvEn={cvEn} work={work} />
          </Box>
        </SectionReveal>
      )}

      {/* [06] EXPERIENCE TIMELINE */}
      {show.experience && (
        <SectionReveal>
          <Box mb={{ base: 16, md: 24 }} id="section-experience" data-nav-label="Experience" tabIndex={-1} sx={sectionSx}>
            <SectionLabel n={6} mb={6}>
              Experience
            </SectionLabel>
            <ExperienceTimeline cvEn={cvEn} />
          </Box>
        </SectionReveal>
      )}

      {/* [07] CERTIFICATIONS */}
      {show.certifications && (
        <SectionReveal>
          <Box mb={{ base: 16, md: 24 }} id="section-certifications" data-nav-label="Certifications" tabIndex={-1} sx={sectionSx}>
            <SectionLabel n={7} mb={6}>
              Certifications
            </SectionLabel>
            <CertificationsPeek cvEn={cvEn} />
          </Box>
        </SectionReveal>
      )}

      {/* Photos + Contact (side by side on desktop, stacked on mobile) */}
      {hasBottomRow && (
        <Flex
          direction={{ base: 'column', md: 'row' }}
          gap={{ base: 12, md: 8 }}
          align="flex-start"
          pt={{ base: 8, md: 12 }}
          borderTop="1px solid"
          borderColor="page.border"
        >
          {show.photos && (
            <Box
              flex={
                show.contact
                  ? { base: 'none', md: '0 0 380px' }
                  : { base: 'none', md: '1' }
              }
              w={{ base: '100%', md: show.contact ? '380px' : '100%' }}
              id="section-photos"
              data-nav-label="Field Notes"
              tabIndex={-1}
              sx={sectionSx}
            >
              <SectionLabel n={8} mb={6}>
                Field Notes
              </SectionLabel>
              <ImageScroller images={photos} />
            </Box>
          )}
          {show.contact && (
            <Box flex="1" minW={0} w="100%" id="section-contact" data-nav-label="Get In Touch" tabIndex={-1} sx={sectionSx}>
              <SectionLabel n={9} mb={6}>
                Get In Touch
              </SectionLabel>
              <ContactPro home={home || undefined} formOnly />
            </Box>
          )}
        </Flex>
      )}
    </Box>
  )
}

export default Content
