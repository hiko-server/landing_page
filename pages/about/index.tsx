import React from 'react'
import type { GetServerSideProps } from 'next'
import { Flex, Box, Image, Heading } from '@chakra-ui/react'

import LandingCVSections, { CV_WEBSITE_SECTIONS } from '../../components/LandingPage/LandingCVSections'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import { absUrl, personNode, personFactsFromCv, breadcrumb, ogImageUrl, PERSON_ID } from '../../lib/schema'
import ActivityFeed from '../../components/GitHub/ActivityFeed'
import StatsBar from '../../components/GitHub/StatsBar'
import SectionReveal from '../../components/General-UI/SectionReveal'
import AboutHero from '../../components/About/AboutHero'
import ExperienceTimeline from '../../components/LandingPage/ExperienceTimeline'
import CertificationsPeek from '../../components/LandingPage/CertificationsPeek'
import type { CvSectionLike } from '../../lib/cvVisibility'
import type { HomeData } from '../../lib/homeShape'
import { referenceMonth } from '../../lib/clock'

type Props = {
  /** Only the brand + tagline the hero prints — not the whole home document. */
  hero: { brand: string; tagline: string }
  /** Website-pruned CV, limited to the sections this page renders. */
  cv: { en: CvSectionLike[]; zh: CvSectionLike[] }
  githubUser: string | null
  /** Server reference month ('YYYY-MM', lib/clock.ts) for "Present" / "Expected". */
  clockMonth: string
  /** Public home.socials for the persistent header / footer (null = none set). */
  chromeSocials?: HomeData['socials'] | null
}

/** True when the section is present and carries at least one visible entry. */
function hasSection(list: CvSectionLike[], name: string, key: string): boolean {
  const section = list.find((s) => s.sessionName === name)
  return Array.isArray(section?.[key]) && section[key].length > 0
}

const About = ({ hero, cv, githubUser }: Props) => {
  return (
    <React.Fragment>
      <CustomHead
        title="About"
        description="About Li Yanpei (Lucian), a software engineer in Hong Kong: background, education, skills, GitHub activity and project case studies."
        url={absUrl('/about')}
        image={ogImageUrl({ kind: 'page', title: 'About', subtitle: 'Background, skills & projects' })}
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'ProfilePage',
            name: 'About — Li Yanpei (Lucian)',
            url: absUrl('/about'),
            mainEntity: { '@id': PERSON_ID },
          },
          personNode(personFactsFromCv(cv.en)),
          breadcrumb([
            { name: 'Home', path: '/' },
            { name: 'About', path: '/about' },
          ]),
        ]}
      />
      <HeaderFooter>
        <Flex direction="column" alignItems="center" justifyContent="center" px={{ base: 4, md: 10 }} py={{ base: 8, md: 10 }} gap={{ base: 8, md: 10 }}>
          <SectionReveal>
            <AboutHero brand={hero.brand} tagline={hero.tagline} />
          </SectionReveal>
          <SectionReveal>
            <Box w="100%" maxW="1100px" mx="auto">
              <StatsBar />
            </Box>
          </SectionReveal>
          {hasSection(cv.en, 'workExperience', 'experiences') && (
            <SectionReveal>
              <Box as="section" aria-labelledby="about-experience" w="100%" maxW="1100px" mx="auto">
                <Heading as="h2" id="about-experience" size="md" mb={6} fontWeight={500} letterSpacing="-0.01em">
                  Experience
                </Heading>
                <ExperienceTimeline cvEn={cv.en} />
              </Box>
            </SectionReveal>
          )}
          {hasSection(cv.en, 'certification', 'certifications') && (
            <SectionReveal>
              <Box as="section" aria-labelledby="about-certifications" w="100%" maxW="1100px" mx="auto">
                <Heading as="h2" id="about-certifications" size="md" mb={4} fontWeight={500} letterSpacing="-0.01em">
                  Certifications
                </Heading>
                <CertificationsPeek cvEn={cv.en} />
              </Box>
            </SectionReveal>
          )}
          <SectionReveal>
            <Box as="section" aria-labelledby="about-activity" w="100%" maxW="1100px" mx="auto">
              <Heading as="h2" id="about-activity" size="md" mb={4} fontWeight={500} letterSpacing="-0.01em">
                Recent Activity
              </Heading>
              <ActivityFeed />
            </Box>
          </SectionReveal>
          {githubUser ? (
            <SectionReveal>
              <Box as="section" aria-labelledby="about-contributions" w="100%" maxW="1100px" mx="auto">
                <Heading as="h2" id="about-contributions" size="md" mb={4} fontWeight={500} letterSpacing="-0.01em">
                  Contributions
                </Heading>
                {/* Intrinsic size attributes reserve the chart's box before it loads (no layout shift). */}
                <Image
                  src={`https://ghchart.rshah.org/${encodeURIComponent(githubUser)}`}
                  alt={`GitHub contribution chart for ${githubUser}`}
                  htmlWidth="663"
                  htmlHeight="104"
                  loading="lazy"
                  decoding="async"
                  w="100%"
                  h="auto"
                  borderRadius="md"
                />
              </Box>
            </SectionReveal>
          ) : null}
          <SectionReveal>
            <LandingCVSections en={cv.en} zh={cv.zh} />
          </SectionReveal>
        </Flex>
      </HeaderFooter>
    </React.Fragment>
  )
}

export default About

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  let cv: Props['cv'] = { en: [], zh: [] }
  let hero: Props['hero'] = { brand: '', tagline: '' }
  let githubUser: string | null = null
  let chromeSocials: HomeData['socials'] | null | undefined
  try {
    // Live CV from the content store, website audience, exactly the sections
    // rendered here (the accordion's set — it covers the timeline and
    // certification peek too). personalInformation is not shipped.
    const { readPublicCvSections } = await import('../../lib/cvdata')
    cv = readPublicCvSections('website', CV_WEBSITE_SECTIONS, ['en', 'zh'])
  } catch {
    /* best effort — render with what we have */
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
  return {
    props: {
      hero,
      cv,
      githubUser,
      clockMonth: referenceMonth(),
      // Omitted when the home document could not be read: the chrome then
      // loads the public view itself.
      ...(chromeSocials !== undefined ? { chromeSocials } : {}),
    },
  }
}
