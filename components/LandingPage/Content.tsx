import React from 'react'
import dynamic from 'next/dynamic'
import { Box, Grid, Text } from '@chakra-ui/react'

import type { ScrollerImage } from '../imageScoller/imageScroller'
import TopRepos from '../GitHub/TopRepos'
import LanguageStack from '../GitHub/LanguageStack'
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
import ContactBand from './ContactBand'
import SectionReveal from '../General-UI/SectionReveal'
import SectionHeading from '../General-UI/SectionHeading'
import FloatingNav from '../General-UI/FloatingNav'
// The read-side helpers only (lib/homeSections): never lib/home (server-only /
// better-sqlite3), and not lib/homeShape's runtime (the admin's validation).
import type { HomeData } from '../../lib/homeShape'
import { isSectionVisible, resolveSectionOrder, type SortableSectionKey } from '../../lib/homeSections'
import type { CvSectionLike } from '../../lib/cvVisibility'
import { clearOfHeader } from '../../lib/anchorOffset'
import { list } from '../CVViewerPage/fields'
import { HOME_REPO_LIMIT, type GithubPageData } from '../Common/githubEvents'
import type { WorkIndexItem, WritingItem } from './projectMatch'
import type { SelectedPublications } from '../../lib/publications/selected'

// Below the fold and interactive-only: its code loads when it is about to
// scroll into view (WhenVisible), not with the page.
const ImageScroller = dynamic(() => import('../imageScoller/imageScroller'), { ssr: false })
// Server-rendered, but its code ships only with a page that has public
// papers (the owner may have none): no JavaScript for an absent section.
const SelectedPublicationsList = dynamic(() => import('./SelectedPublications'))

export type HomeWriting = { items: WritingItem[]; hasPosts: boolean; hasWork: boolean }

/** Whether the public CV section has any visible entry (an empty section is left out). */
function hasEntries(cvEn: CvSectionLike[] | undefined, sessionName: string, key: string): boolean {
  const section = Array.isArray(cvEn) ? cvEn.find((s) => s?.sessionName === sessionName) : undefined
  return list(section, key).length > 0
}

type SectionDef = {
  key: SortableSectionKey
  id: string
  label: string
  /** Rows inside run their own stagger: reveal only the section heading. */
  labelOnly?: boolean
  /** Rendered without the reveal wrapper (deferred / full-width rows). */
  plain?: boolean
  body: React.ReactNode
}

const monoLabel = {
  fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
  fontSize: '11px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color: 'page.fg-subtle',
  fontWeight: 400,
  mb: 4,
}

/**
 * Home sections in the owner's order (home.sectionOrder, completed by
 * resolveSectionOrder): Open Source, Skills, Recent Activity, Selected
 * Projects, Selected Publications, Writing & case studies, Experience,
 * Certifications, Field Notes and Get In Touch by default.
 *
 * - Each section is gated by `isSectionVisible(home, key)` (Home editor) and
 *   by having something to show (no empty sections). Each opens with a plain
 *   SectionHeading (h2, id `${id}-label`) — no index numbers.
 * - Open Source is one compact band: stats, the contribution calendar beside
 *   the language stack (lg), and the pinned repositories.
 * - Data the server already has (GitHub, CV, writing index) is rendered into
 *   the HTML; only the photo strip is code-split and mounts just before it
 *   scrolls into view. Contact is a link to /contact, not the form.
 */
const Content = ({
  photos,
  cvEn,
  home,
  work,
  github,
  writing,
  publications,
}: {
  photos?: ScrollerImage[]
  /** Website-pruned EN CV, limited to the sections rendered here. */
  cvEn?: CvSectionLike[]
  home?: HomeData | null
  /** /work case-study index used to link project cards and roles. */
  work?: WorkIndexItem[]
  /** GitHub data loaded on the server (trimmed); a null part makes that widget fetch it. */
  github?: GithubPageData | null
  writing?: HomeWriting | null
  /** The first papers of /publications (null / empty: no section). */
  publications?: SelectedPublications | null
}) => {
  const calendarKnownMissing = github?.calendar?.available === false
  const defs: Partial<Record<SortableSectionKey, SectionDef>> = {
    'open-source': {
      key: 'open-source',
      id: 'section-open-source',
      label: 'Open Source',
      labelOnly: true,
      body: (
        <ErrorBoundary name="home-open-source" fallback={(p) => <WidgetFallback {...p} />}>
          <StatsBar initialData={github?.stats} />
          <Grid
            mt={8}
            templateColumns={{ base: 'minmax(0, 1fr)', lg: calendarKnownMissing ? 'minmax(0, 1fr)' : 'minmax(0, 2fr) minmax(0, 1fr)' }}
            gap={{ base: 10, lg: 12 }}
            alignItems="start"
          >
            {/* Known-unavailable: no calendar. Unknown (not ready in the server budget): it fetches. */}
            {!calendarKnownMissing && (
              <Box minW={0}>
                <ContributionGraph initialData={github?.calendar} />
              </Box>
            )}
            <Box minW={0}>
              <Text as="h3" sx={monoLabel}>
                Languages
              </Text>
              <LanguageStack initialData={github?.languages} />
            </Box>
          </Grid>
          <Box mt={10}>
            <Text as="h3" sx={monoLabel}>
              Repositories
            </Text>
            <TopRepos initialData={github?.repos} limit={HOME_REPO_LIMIT} />
          </Box>
        </ErrorBoundary>
      ),
    },
    'tech-stack': {
      key: 'tech-stack',
      id: 'section-tech-stack',
      label: 'Skills',
      labelOnly: true,
      body: <Skills cvEn={cvEn} />,
    },
    activity: {
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
      ? { projects: { key: 'projects' as const, id: 'section-projects', label: 'Selected Projects', body: <ProjectSpotlight cvEn={cvEn} work={work} /> } }
      : {}),
    ...(publications && publications.items.length
      ? {
          publications: {
            key: 'publications' as const,
            id: 'section-publications',
            label: 'Selected Publications',
            body: <SelectedPublicationsList data={publications} />,
          },
        }
      : {}),
    ...(writing && writing.items.length
      ? {
          writing: {
            key: 'writing' as const,
            id: 'section-writing',
            label: 'Writing & case studies',
            body: <LatestWriting items={writing.items} hasPosts={writing.hasPosts} hasWork={writing.hasWork} />,
          },
        }
      : {}),
    ...(hasEntries(cvEn, 'workExperience', 'experiences')
      ? {
          experience: {
            key: 'experience' as const,
            id: 'section-experience',
            label: 'Experience',
            labelOnly: true,
            body: <ExperienceTimeline cvEn={cvEn} work={work} />,
          },
        }
      : {}),
    ...(hasEntries(cvEn, 'certification', 'certifications')
      ? {
          certifications: {
            key: 'certifications' as const,
            id: 'section-certifications',
            label: 'Certifications',
            labelOnly: true,
            body: <CertificationsPeek cvEn={cvEn} />,
          },
        }
      : {}),
    ...(Array.isArray(photos) && photos.length
      ? {
          photos: {
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
        }
      : {}),
    contact: {
      key: 'contact',
      id: 'section-contact',
      label: 'Get In Touch',
      body: <ContactBand home={home} />,
    },
  }
  const visible = resolveSectionOrder(home?.sectionOrder)
    .map((key) => defs[key])
    .filter((s): s is SectionDef => !!s && isSectionVisible(home, s.key))

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
            <SectionHeading id={`${s.id}-label`}>{s.label}</SectionHeading>
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
