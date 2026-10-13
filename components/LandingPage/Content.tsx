import React from 'react'
import dynamic from 'next/dynamic'
import { Box } from '@chakra-ui/react'

import type { ScrollerImage } from '../imageScoller/imageScroller'
import TopRepos from '../GitHub/TopRepos'
import LanguageBars from '../GitHub/LanguageBars'
import ActivityFeed from '../GitHub/ActivityFeed'
import StatsBar from '../GitHub/StatsBar'
import ContributionGraph from '../GitHub/ContributionGraph'
import ErrorBoundary, { WidgetFallback } from '../Common/ErrorBoundary'
import WhenVisible from '../Common/WhenVisible'
import Skills from './Skills'
import ProjectSpotlight from './ProjectSpotlight'
import LatestWriting from './LatestWriting'
import ExperienceTimeline from './ExperienceTimeline'
import CertificationsPeek from './CertificationsPeek'
import SectionReveal from '../General-UI/SectionReveal'
import SectionLabel from '../General-UI/SectionLabel'
import FloatingNav from '../General-UI/FloatingNav'
// Pure shape — must NOT import from lib/home (server-only / better-sqlite3).
import { isSectionVisible, type HomeData, type SectionKey } from '../../lib/homeShape'
import type { CvSectionLike } from '../../lib/cvVisibility'
import { clearOfHeader } from '../../lib/anchorOffset'
import { list } from '../CVViewerPage/fields'
import type { GithubSummary } from '../Common/githubEvents'
import type { WorkIndexItem, WritingItem } from './projectMatch'

// Below the fold and interactive-only: their code loads when they are about
// to scroll into view (WhenVisible), not with the page.
const ContactPro = dynamic(() => import('../Contact/ContactPro'), { ssr: false })
const ImageScroller = dynamic(() => import('../imageScoller/imageScroller'), { ssr: false })

export type HomeWriting = { items: WritingItem[]; hasPosts: boolean; hasWork: boolean }

/** Whether the public CV section has any visible entry (an empty section gets no [NN] row). */
function hasEntries(cvEn: CvSectionLike[] | undefined, sessionName: string, key: string): boolean {
  const section = Array.isArray(cvEn) ? cvEn.find((s) => s?.sessionName === sessionName) : undefined
  return list(section, key).length > 0
}

type SectionDef = {
  key: SectionKey
  id: string
  label: string
  /** Rows inside run their own stagger: reveal only the [NN] label. */
  labelOnly?: boolean
  /** Rendered without the reveal wrapper (deferred / full-width rows). */
  plain?: boolean
  body: React.ReactNode
}

/**
 * Home sections [02]…: Open Source, Skills, Recent Activity, Selected
 * Projects, Writing & case studies, Experience, Certifications, Field Notes
 * and Contact.
 *
 * - Each section is gated by `isSectionVisible(home, key)` (Home editor) and
 *   by having something to show (no empty [NN] rows), and numbered by its
 *   position among the visible ones, so the labels never skip a number.
 * - Data the server already has (GitHub summary, CV, writing index) is
 *   rendered into the HTML; ContactPro and the photo strip are code-split
 *   and mount just before they scroll into view.
 * - Field Notes and Contact each get a full-width row.
 */
const Content = ({
  photos,
  cvEn,
  home,
  work,
  github,
  writing,
}: {
  photos?: ScrollerImage[]
  /** Website-pruned EN CV, limited to the sections rendered here. */
  cvEn?: CvSectionLike[]
  home?: HomeData | null
  /** /work case-study index used to link project cards and roles. */
  work?: WorkIndexItem[]
  /** GitHub data loaded on the server; a null part makes that widget fetch it. */
  github?: GithubSummary | null
  writing?: HomeWriting | null
}) => {
  const contributions = github?.contributions
  const sections: SectionDef[] = [
    {
      key: 'open-source',
      id: 'section-open-source',
      label: 'Open Source',
      labelOnly: true,
      body: (
        <ErrorBoundary name="home-open-source" fallback={(p) => <WidgetFallback {...p} />}>
          <StatsBar initialData={github?.stats} />
          {/* Known-unavailable: no row. Unknown (not ready in the server budget): it fetches. */}
          {contributions?.available !== false && (
            <Box mt={8}>
              <ContributionGraph initialData={contributions} />
            </Box>
          )}
          <Box mt={6}>
            <TopRepos initialData={github?.topRepos} />
          </Box>
        </ErrorBoundary>
      ),
    },
    {
      key: 'tech-stack',
      id: 'section-tech-stack',
      label: 'Skills',
      labelOnly: true,
      body: (
        <>
          <Skills cvEn={cvEn} />
          <Box mt={10}>
            <ErrorBoundary name="home-languages" fallback={(p) => <WidgetFallback {...p} />}>
              <LanguageBars initialData={github?.languages} />
            </ErrorBoundary>
          </Box>
        </>
      ),
    },
    {
      key: 'activity',
      id: 'section-activity',
      label: 'Recent Activity',
      labelOnly: true,
      body: (
        <ErrorBoundary name="home-activity" fallback={(p) => <WidgetFallback {...p} />}>
          <ActivityFeed initialData={github?.events} />
        </ErrorBoundary>
      ),
    },
    ...(hasEntries(cvEn, 'project', 'projectExperience')
      ? [
          {
            key: 'projects' as const,
            id: 'section-projects',
            label: 'Selected Projects',
            body: <ProjectSpotlight cvEn={cvEn} work={work} />,
          },
        ]
      : []),
    ...(writing && writing.items.length
      ? [
          {
            key: 'writing' as const,
            id: 'section-writing',
            label: 'Writing & case studies',
            body: <LatestWriting items={writing.items} hasPosts={writing.hasPosts} hasWork={writing.hasWork} />,
          },
        ]
      : []),
    ...(hasEntries(cvEn, 'workExperience', 'experiences')
      ? [
          {
            key: 'experience' as const,
            id: 'section-experience',
            label: 'Experience',
            labelOnly: true,
            body: <ExperienceTimeline cvEn={cvEn} work={work} />,
          },
        ]
      : []),
    ...(hasEntries(cvEn, 'certification', 'certifications')
      ? [
          {
            key: 'certifications' as const,
            id: 'section-certifications',
            label: 'Certifications',
            labelOnly: true,
            body: <CertificationsPeek cvEn={cvEn} />,
          },
        ]
      : []),
    ...(Array.isArray(photos) && photos.length
      ? [
          {
            key: 'photos' as const,
            id: 'section-photos',
            label: 'Field Notes',
            plain: true,
            body: (
              <WhenVisible minHeight={{ base: '300px', md: '360px' }}>
                <ImageScroller images={photos} />
              </WhenVisible>
            ),
          },
        ]
      : []),
    {
      key: 'contact',
      id: 'section-contact',
      label: 'Get In Touch',
      plain: true,
      body: (
        <WhenVisible minHeight={{ base: '760px', md: '600px' }}>
          <ContactPro home={home || undefined} formOnly />
        </WhenVisible>
      ),
    },
  ]
  const visible = sections.filter((s) => isSectionVisible(home, s.key))

  // Anchor targets land a little below the sticky header (the header's
  // height + 16px + 8px of air, lib/anchorOffset.ts), and focus (for
  // keyboard users jumping via the section nav) doesn't paint an outline box.
  const sectionSx = { scrollMarginTop: clearOfHeader('8px'), '&:focus': { outline: 'none' } }

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
      {visible.map((s, i) => {
        const section = (
          <Box
            as="section"
            aria-labelledby={`${s.id}-label`}
            mb={i === visible.length - 1 ? 0 : { base: 16, md: 24 }}
            id={s.id}
            data-nav-label={s.label}
            tabIndex={-1}
            sx={sectionSx}
          >
            <SectionLabel n={i + 2} id={`${s.id}-label`} mb={6}>
              {s.label}
            </SectionLabel>
            {s.body}
          </Box>
        )
        if (s.plain) return <React.Fragment key={s.key}>{section}</React.Fragment>
        return (
          <SectionReveal key={s.key} labelOnly={s.labelOnly}>
            {section}
          </SectionReveal>
        )
      })}
    </Box>
  )
}

export default Content
