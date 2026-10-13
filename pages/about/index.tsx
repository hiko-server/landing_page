import React from 'react'
import type { GetServerSideProps } from 'next'
import { Flex, Box, Heading } from '@chakra-ui/react'

import LandingCVSections, { CV_WEBSITE_SECTIONS } from '../../components/LandingPage/LandingCVSections'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import { absUrl, personNode, profilePageNode, breadcrumb, ogImageUrl, PERSON_NAME, type PersonFacts } from '../../lib/schema'
import ActivityFeed from '../../components/GitHub/ActivityFeed'
import StatsBar from '../../components/GitHub/StatsBar'
import ContributionGraph from '../../components/GitHub/ContributionGraph'
import ErrorBoundary, { WidgetFallback } from '../../components/Common/ErrorBoundary'
import SectionReveal from '../../components/General-UI/SectionReveal'
import AboutHero from '../../components/About/AboutHero'
import ExperienceTimeline from '../../components/LandingPage/ExperienceTimeline'
import CertificationsPeek from '../../components/LandingPage/CertificationsPeek'
import { heroIdentity, type HeroIdentity } from '../../components/LandingPage/heroIdentity'
import type { WorkIndexItem } from '../../components/LandingPage/projectMatch'
import type { GithubSummary } from '../../components/Common/githubEvents'
import type { CvSectionLike } from '../../lib/cvVisibility'
import type { HomeData } from '../../lib/homeShape'
import { referenceMonth } from '../../lib/clock'

type Props = {
  /** Only the brand + tagline the hero prints — not the whole home document. */
  hero: { brand: string; tagline: string }
  /** Display names from the website-pruned Personal Info (never the section itself). */
  identity: HeroIdentity
  /** Website-pruned CV, limited to the sections this page renders. */
  cv: { en: CvSectionLike[]; zh: CvSectionLike[] }
  githubUser: string | null
  /** GitHub data rendered into the HTML; null (or a null part) = the widget loads it in the browser. */
  github: GithubSummary | null
  /** /work case-study index (slug + title) for "Case study →" links on roles and CV projects. */
  work: WorkIndexItem[]
  /** schema.org Person facts — the site-wide loader (lib/personFacts), identical on every page. */
  personFacts: PersonFacts
  /** Server reference month ('YYYY-MM', lib/clock.ts) for "Present" / "Expected". */
  clockMonth: string
  /** Public home.socials for the persistent header / footer (null = none set). */
  chromeSocials?: HomeData['socials'] | null
}

/** Server-side ceiling for the GitHub summary; the page never waits longer on GitHub. */
const GITHUB_BUDGET_MS = 1500

/** True when the section is present and carries at least one visible entry. */
function hasSection(list: CvSectionLike[], name: string, key: string): boolean {
  const section = list.find((s) => s.sessionName === name)
  return Array.isArray(section?.[key]) && section[key].length > 0
}

const githubFallback = (p: { reset?: () => void }) => <WidgetFallback reset={p.reset} title="This GitHub section couldn’t load." />

const sectionHeading = { size: 'md', fontWeight: 500, letterSpacing: '-0.01em' } as const

const About = ({ hero, identity, cv, githubUser, github, work, personFacts }: Props) => {
  return (
    <React.Fragment>
      <CustomHead
        title="About"
        description="About Li Yanpei (Lucian), a software engineer in Hong Kong: background, education, skills, GitHub activity and project case studies."
        url={absUrl('/about')}
        image={ogImageUrl({ kind: 'page', title: 'About', subtitle: 'Background, skills & projects' })}
        jsonLd={[
          profilePageNode({ path: '/about', name: `About — ${PERSON_NAME}` }),
          personNode(personFacts),
          breadcrumb([
            { name: 'Home', path: '/' },
            { name: 'About', path: '/about' },
          ]),
        ]}
      />
      <HeaderFooter>
        <Flex direction="column" alignItems="center" justifyContent="center" px={{ base: 4, md: 10 }} py={{ base: 8, md: 10 }} gap={{ base: 8, md: 10 }}>
          {/* Not inside SectionReveal: the h1 must paint from the server HTML. */}
          <Box w="100%">
            <AboutHero brand={hero.brand} tagline={hero.tagline} identity={identity} />
          </Box>
          <SectionReveal>
            <Box w="100%" maxW="1100px" mx="auto">
              <ErrorBoundary name="about-github" fallback={githubFallback}>
                <StatsBar initialData={github?.stats} />
              </ErrorBoundary>
            </Box>
          </SectionReveal>
          {githubUser ? (
            <SectionReveal>
              <Box as="section" aria-labelledby="about-contributions" w="100%" maxW="1100px" mx="auto">
                <Heading as="h2" id="about-contributions" mb={4} {...sectionHeading}>
                  Contributions
                </Heading>
                <ErrorBoundary name="about-github" fallback={githubFallback}>
                  <ContributionGraph initialData={github?.contributions} whenUnavailable="notice" />
                </ErrorBoundary>
              </Box>
            </SectionReveal>
          ) : null}
          {hasSection(cv.en, 'workExperience', 'experiences') && (
            <SectionReveal>
              <Box as="section" aria-labelledby="about-experience" w="100%" maxW="1100px" mx="auto">
                <Heading as="h2" id="about-experience" mb={6} {...sectionHeading}>
                  Experience
                </Heading>
                <ExperienceTimeline cvEn={cv.en} work={work} defaultExpanded />
              </Box>
            </SectionReveal>
          )}
          {hasSection(cv.en, 'certification', 'certifications') && (
            <SectionReveal>
              <Box as="section" aria-labelledby="about-certifications" w="100%" maxW="1100px" mx="auto">
                <Heading as="h2" id="about-certifications" mb={4} {...sectionHeading}>
                  Certifications
                </Heading>
                <CertificationsPeek cvEn={cv.en} />
              </Box>
            </SectionReveal>
          )}
          <SectionReveal>
            <Box as="section" aria-labelledby="about-activity" w="100%" maxW="1100px" mx="auto">
              <Heading as="h2" id="about-activity" mb={4} {...sectionHeading}>
                Recent Activity
              </Heading>
              <ErrorBoundary name="about-github" fallback={githubFallback}>
                <ActivityFeed initialData={github?.events} />
              </ErrorBoundary>
            </Box>
          </SectionReveal>
          <SectionReveal>
            <LandingCVSections en={cv.en} zh={cv.zh} work={work} />
          </SectionReveal>
        </Flex>
      </HeaderFooter>
    </React.Fragment>
  )
}

export default About

/** `promise`, or `fallback` once `ms` have passed (the timer never outlives the race). */
async function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<T>((resolve) => (timer = setTimeout(() => resolve(fallback), ms)))])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Server-rendered on every request (always fresh after a deploy: the Docker
 * build has no content store). The GitHub summary comes from lib/githubData's
 * in-memory cache and is raced against a 1.5 s budget, so a slow GitHub never
 * holds the page; whatever is missing loads in the browser.
 */
export const getServerSideProps: GetServerSideProps<Props> = async () => {
  let cv: Props['cv'] = { en: [], zh: [] }
  let identity: HeroIdentity = heroIdentity(undefined, undefined)
  let hero: Props['hero'] = { brand: '', tagline: '' }
  let githubUser: string | null = null
  let chromeSocials: HomeData['socials'] | null | undefined
  let work: WorkIndexItem[] = []
  let personFacts: PersonFacts = {}

  try {
    // Live CV from the content store, website audience, exactly the sections
    // rendered here (the accordion's set — it covers the timeline and
    // certification peek too). personalInformation is read only to derive
    // the display names; the section itself is never shipped.
    const { readCvData, readPublicCvSections } = await import('../../lib/cvdata')
    cv = readPublicCvSections('website', CV_WEBSITE_SECTIONS, ['en', 'zh'])
    const pi = readPublicCvSections('website', ['personalInformation'], ['en', 'zh'])
    const stored = readCvData()
    const storedHasPersonalInfo = [...stored.en, ...stored.zh].some((s) => s?.sessionName === 'personalInformation')
    identity = heroIdentity(pi.en[0], pi.zh[0], { storedHasPersonalInfo })
  } catch {
    /* best effort — render with what we have */
  }

  try {
    // The site-wide Person entity: the same facts the home and CV pages emit.
    personFacts = (await import('../../lib/personFacts')).loadPersonFacts()
  } catch {
    /* best effort — the node keeps its built-in defaults */
  }

  try {
    const { readPublicHome } = await import('../../lib/home')
    const { extractGithubUser } = await import('../../lib/github')
    const home = readPublicHome()
    hero = { brand: home?.hero?.brand || '', tagline: home?.hero?.tagline || '' }
    githubUser = extractGithubUser(home?.socials?.github)
    chromeSocials = home?.socials ?? null
  } catch {
    /* best effort — render with what we have */
  }

  // Only read the /work index when something on the page can link to it:
  // the experience timeline (roles) or the CV accordion's projects (either language).
  const linksCaseStudies =
    hasSection(cv.en, 'workExperience', 'experiences') ||
    hasSection(cv.en, 'project', 'projectExperience') ||
    hasSection(cv.zh, 'project', 'projectExperience')
  if (linksCaseStudies) {
    try {
      const { listWork } = await import('../../lib/mdx')
      work = listWork().map(({ slug, frontmatter: fm }) => ({ slug, title: String(fm?.title || slug) }))
    } catch {
      /* best effort — roles and projects simply render without case-study links */
    }
  }

  let github: GithubSummary | null = null
  if (githubUser) {
    const { loadGithubSummary } = await import('../../lib/githubData')
    github = await within(loadGithubSummary(githubUser), GITHUB_BUDGET_MS, null)
  }

  return {
    props: {
      hero,
      identity,
      cv,
      githubUser,
      github,
      work,
      personFacts,
      clockMonth: referenceMonth(),
      // Omitted when the home document could not be read: the chrome then
      // loads the public view itself.
      ...(chromeSocials !== undefined ? { chromeSocials } : {}),
    },
  }
}
