import React, { useMemo, useState } from 'react'
import type { GetStaticProps } from 'next'
import { Box, Flex, Grid, Text } from '@chakra-ui/react'
import type { Root as HastRoot } from 'hast'

import LandingCVSections, { CV_WEBSITE_SECTIONS, hasChineseCv, renderedCvSections } from '../../components/LandingPage/LandingCVSections'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import MDXContent from '../../components/MDX/MDXContent'
import IdentityRail, { type RailPortrait } from '../../components/About/IdentityRail'
import { aboutNavEntries } from '../../components/About/aboutNav'
import { heroIdentity, portraitAlt, taglinePhrases, type HeroIdentity } from '../../components/LandingPage/heroIdentity'
import { ogPresetUrl } from '../../lib/og/presets'
import AboutRecommendations from '../../components/About/Recommendations'
import SectionHeading from '../../components/General-UI/SectionHeading'
import { recommendationsSection } from '../../components/CVViewerPage/recommendationView'
import type { WorkIndexItem } from '../../components/LandingPage/projectMatch'
import { availabilityView, type AvailabilityView } from '../../components/Common/contactForm'
import { resolveSocialLinks } from '../../components/Chrome/chrome'
import { absUrl, personNode, profilePageNode, breadcrumb, PERSON_NAME, type PersonFacts } from '../../lib/schema'
import type { CvSectionLike } from '../../lib/cvVisibility'
import type { HomeData } from '../../lib/homeShape'
import { safeHref } from '../../lib/cvFormat'
import { clearOfHeader } from '../../lib/anchorOffset'
import { referenceMonth } from '../../lib/clock'
import { PROFILE_REVALIDATE_SECONDS, revalidateAfter } from '../../lib/isr'

type Props = {
  /** Only the brand + tagline the page prints — not the whole home document. */
  hero: { brand: string; tagline: string }
  /** Display names from the website-pruned Personal Info (never the section itself). */
  identity: HeroIdentity
  /** The home portrait with its crop, size and upload srcset; null when none is set. */
  portrait: RailPortrait | null
  /** The owner's availability (Home editor); null when not set. */
  availability: AvailabilityView | null
  /** The owner's bio (admin → About bio), compiled on the server; null while it is empty. */
  bio: { tree: HastRoot; lang: string } | null
  /** Website-pruned CV, limited to the sections this page renders. */
  cv: { en: CvSectionLike[]; zh: CvSectionLike[] }
  /** /work case-study index (slug + title) for "Case study →" links on roles and CV projects. */
  work: WorkIndexItem[]
  /** schema.org Person facts — the site-wide loader (lib/personFacts), identical on every page. */
  personFacts: PersonFacts
  /** Server reference month ('YYYY-MM', lib/clock.ts) for "Present" / "Expected". */
  clockMonth: string
  /** Public home.socials for the persistent header / footer and the rail (null = none set). */
  chromeSocials?: HomeData['socials'] | null
  /** Website-pruned Recommendations section (permitted entries only), or null. */
  recommendations?: CvSectionLike | null
}

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

/** A jump target (the rail's section nav) clears the sticky header. */
const ANCHOR_SX = { scrollMarginTop: clearOfHeader('8px') } as const

/**
 * /about — the narrative page (home = summary, /cv = the record):
 *
 *   identity rail │ the tagline's lead and focus areas
 *   (sticky, lg)  │ Bio      the owner's own words (admin → About bio);
 *                 │          omitted while empty, never drafted from the CV
 *                 │ Recommendations  entries given with permission (CV Studio);
 *                 │          omitted while there is none
 *                 │ CV       every CV section, open, with the EN / 中 toggle
 *
 * Each block opens with the site's plain SectionHeading (no index numbers).
 *
 * The GitHub widgets and the experience timeline live on the home page only.
 * Below lg the rail is the page header; the section nav shows from lg up.
 */
const About = ({ hero, identity, portrait, availability, bio, cv, work, personFacts, chromeSocials, recommendations }: Props) => {
  const [lang, setLang] = useState<'en' | 'zh'>('en')
  const [lead, ...focus] = taglinePhrases(hero.tagline)
  const socials = useMemo(() => resolveSocialLinks(chromeSocials), [chromeSocials])
  const active = lang === 'zh' && hasChineseCv(cv.zh) ? 'zh' : 'en'
  const nav = useMemo(
    () =>
      aboutNavEntries(renderedCvSections(active === 'zh' ? cv.zh : cv.en), {
        hasBio: !!bio,
        hasRecommendations: !!recommendations,
        lang: active,
      }),
    [active, cv.en, cv.zh, bio, recommendations],
  )

  return (
    <React.Fragment>
      <CustomHead
        title="About"
        description="About Li Yanpei (Lucian), a software engineer in Hong Kong: background, education, experience, projects, skills, patents and awards."
        url={absUrl('/about')}
        image={ogPresetUrl('about')}
        type="profile"
        jsonLd={[
          profilePageNode({ path: '/about', name: `About — ${PERSON_NAME}`, dateModified: personFacts.dateModified }),
          personNode(personFacts),
          breadcrumb([
            { name: 'Home', path: '/' },
            { name: 'About', path: '/about' },
          ]),
        ]}
      />
      <HeaderFooter>
        <Box w="100%" maxW="var(--container-content)" mx="auto" px={{ base: 4, md: 6, lg: 8 }} py={{ base: 10, md: 14, lg: 16 }}>
          <Grid templateColumns={{ base: 'minmax(0, 1fr)', lg: 'minmax(0, 20rem) minmax(0, 1fr)' }} columnGap={{ lg: 16 }} rowGap={{ base: 10, md: 12 }} alignItems="start">
            <IdentityRail brand={hero.brand} identity={identity} portrait={portrait} availability={availability} socials={socials} nav={nav} cvLang={active} />

            <Box minW={0}>
              {lead || focus.length ? (
                <Box mb={{ base: 12, md: 14 }}>
                  {lead ? (
                    <Text className="lede" fontSize={{ base: 'lg', md: 'xl' }} lineHeight="1.5" color="page.fg" maxW="40ch" letterSpacing="-0.01em">
                      {lead}
                    </Text>
                  ) : null}
                  {focus.length ? (
                    <Flex
                      as="ul"
                      aria-label="Focus areas"
                      listStyleType="none"
                      wrap="wrap"
                      gap={2}
                      mt={lead ? 5 : 0}
                    >
                      {focus.map((p, i) => (
                        <Box
                          as="li"
                          key={`${i}-${p}`}
                          fontFamily={monoFont}
                          fontSize="12px"
                          lineHeight="1.4"
                          px={2.5}
                          py={1}
                          border="1px solid"
                          borderColor="page.border-strong"
                          borderRadius="full"
                          color="page.fg-secondary"
                        >
                          {p}
                        </Box>
                      ))}
                    </Flex>
                  ) : null}
                </Box>
              ) : null}

              {bio ? (
                <Box as="section" id="about-bio" aria-labelledby="about-bio-heading" mb={{ base: 14, md: 16 }} sx={{ scrollMarginTop: clearOfHeader('8px') }}>
                  <SectionHeading id="about-bio-heading">Bio</SectionHeading>
                  <Box lang={bio.lang}>
                    <MDXContent tree={bio.tree} as="div" />
                  </Box>
                </Box>
              ) : null}

              {recommendations ? (
                <Box mb={{ base: 14, md: 16 }}>
                  <AboutRecommendations
                    section={recommendations}
                    title={
                      <SectionHeading id="about-recommendations" sx={ANCHOR_SX}>
                        Recommendations
                      </SectionHeading>
                    }
                  />
                </Box>
              ) : null}

              <Box as="section" aria-labelledby="about-cv-heading">
                <LandingCVSections
                  en={cv.en}
                  zh={cv.zh}
                  work={work}
                  expanded
                  headingLevel="h3"
                  idPrefix="about-"
                  language={lang}
                  onLanguageChange={setLang}
                  title={
                    <SectionHeading id="about-cv-heading" mb={0} sx={ANCHOR_SX}>
                      CV
                    </SectionHeading>
                  }
                />
              </Box>
            </Box>
          </Grid>
        </Box>
      </HeaderFooter>
    </React.Fragment>
  )
}

export default About

/** Drop undefined values (Next refuses them in props). */
function defined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}

/**
 * Incremental static regeneration: regenerated right after a save of the
 * home document, the CV, the bio or a case study (lib/revalidate.ts), and at
 * most an hour after the previous render (lib/isr.ts — "Present" /
 * "Expected" follow the reference month). The build renders without the
 * content store; boot warm-up replaces that copy. Every read is best effort.
 */
export const getStaticProps: GetStaticProps<Props> = async () => {
  let cv: Props['cv'] = { en: [], zh: [] }
  let identity: HeroIdentity = heroIdentity(undefined, undefined)
  let hero: Props['hero'] = { brand: '', tagline: '' }
  let portrait: Props['portrait'] = null
  let availability: Props['availability'] = null
  let bio: Props['bio'] = null
  let chromeSocials: HomeData['socials'] | null | undefined
  let work: WorkIndexItem[] = []
  let personFacts: PersonFacts = {}

  try {
    // Live CV from the content store, website audience, exactly the sections
    // rendered here. personalInformation is read only to derive the display
    // names; the section itself is never shipped.
    const { readCvData, readPublicCvSections } = await import('../../lib/cvdata')
    cv = readPublicCvSections('website', CV_WEBSITE_SECTIONS, ['en', 'zh'])
    const pi = readPublicCvSections('website', ['personalInformation'], ['en', 'zh'])
    const stored = readCvData()
    const storedHasPersonalInfo = [...stored.en, ...stored.zh].some((s) => s?.sessionName === 'personalInformation')
    identity = heroIdentity(pi.en[0], pi.zh[0], { storedHasPersonalInfo })
  } catch {
    /* best effort — render with what we have */
  }

  // Recommendations (E11): the website view of the English CV keeps only
  // entries with permission; the section renders only when one is left.
  let recommendations: CvSectionLike | null = null
  try {
    const { readPublicCvSections } = await import('../../lib/cvdata')
    recommendations = recommendationsSection(readPublicCvSections('website', ['recommendations'], ['en']).en)
  } catch {
    /* no recommendations section */
  }

  try {
    // The site-wide Person entity: the same facts the home and CV pages emit.
    personFacts = (await import('../../lib/personFacts')).loadPersonFacts()
  } catch {
    /* best effort — the node keeps its built-in defaults */
  }

  try {
    const { readPublicHome } = await import('../../lib/home')
    const home = readPublicHome()
    hero = { brand: home?.hero?.brand || '', tagline: home?.hero?.tagline || '' }
    chromeSocials = home?.socials ?? null
    availability = availabilityView(home?.availability)
    const avatarUrl = safeHref(home?.hero?.avatarUrl)
    if (avatarUrl) {
      const t = home?.hero?.avatarTransform
      let facts: { width?: number; height?: number; srcSet?: string } = {}
      if (avatarUrl.startsWith('/')) {
        try {
          const [{ localImageSize }, { variantSrcSet }] = await Promise.all([import('../../lib/rehype/imageSize'), import('../../lib/uploadVariants')])
          const size = localImageSize(avatarUrl)
          facts = defined({ width: size?.width, height: size?.height, srcSet: variantSrcSet(avatarUrl) })
        } catch {
          /* the portrait renders without its size / variants */
        }
      }
      portrait = defined({
        src: avatarUrl,
        ...facts,
        x: clamp(t?.x, 0, 100, 50),
        y: clamp(t?.y, 0, 100, 50),
        scale: clamp(t?.scale, 0.5, 3, 1),
        alt: portraitAlt(identity),
      })
    }
  } catch {
    /* best effort — render with what we have */
  }

  try {
    // The owner's bio: rendered only when it has real content. Never a
    // fallback to the CV's introduction.
    const { getPage } = await import('../../lib/contentStore')
    if ((getPage('about')?.body || '').trim()) {
      const { getStaticMdxPage } = await import('../../lib/mdx')
      const page = await getStaticMdxPage('about')
      if (page) bio = { tree: page.tree, lang: page.lang }
    }
  } catch {
    bio = null
  }

  // Only read the /work index when something on the page can link to it:
  // a role or a CV project (either language).
  const has = (list: CvSectionLike[], name: string, key: string) => {
    const s = list.find((x) => x.sessionName === name)
    return Array.isArray(s?.[key]) && s[key].length > 0
  }
  if (has(cv.en, 'workExperience', 'experiences') || has(cv.en, 'project', 'projectExperience') || has(cv.zh, 'project', 'projectExperience')) {
    try {
      const { listWork } = await import('../../lib/mdx')
      work = listWork().map(({ slug, frontmatter: fm }) => ({ slug, title: String(fm?.title || slug) }))
    } catch {
      /* best effort — roles and projects simply render without case-study links */
    }
  }

  return {
    revalidate: revalidateAfter(PROFILE_REVALIDATE_SECONDS),
    props: {
      hero,
      identity,
      portrait,
      availability,
      bio,
      cv,
      work,
      personFacts,
      recommendations,
      clockMonth: referenceMonth(),
      // Omitted when the home document could not be read: the chrome then
      // loads the public view itself.
      ...(chromeSocials !== undefined ? { chromeSocials } : {}),
      // Whether /publications exists, for the nav link (lib/publicationsData).
      ...(await import('../../lib/publicationsData')).chromePublicationsProp(),
    },
  }
}
