import React, { useMemo, useState } from 'react'
import type { GetStaticProps } from 'next'
import { Box, Flex, Grid, Text } from '@chakra-ui/react'

import LandingCVSections, { hasChineseCv, renderedCvSections } from '../../components/LandingPage/LandingCVSections'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import MDXContent from '../../components/MDX/MDXContent'
import IdentityRail from '../../components/About/IdentityRail'
import { aboutNavEntries } from '../../components/About/aboutNav'
import { taglinePhrases } from '../../components/LandingPage/heroIdentity'
import { ogPresetUrl } from '../../lib/og/presets'
import AboutRecommendations from '../../components/About/Recommendations'
import SectionHeading from '../../components/General-UI/SectionHeading'
import AskEntry from '../../components/Search/AskEntry'
import { resolveSocialLinks } from '../../components/Chrome/chrome'
import { absUrl, personNode, profilePageNode, breadcrumb, PERSON_NAME } from '../../lib/schema'
import { clearOfHeader } from '../../lib/anchorOffset'
import { fillUi } from '../../lib/uiStrings'
import { ABOUT_EN } from '../../lib/uiStrings/about'
import type { AboutPageProps } from '../../lib/aboutPage'

export type Props = AboutPageProps

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

/** A jump target (the rail's section nav) clears the sticky header. */
const ANCHOR_SX = { scrollMarginTop: clearOfHeader('8px') } as const

/**
 * /about — the narrative page (home = summary, /cv = the record):
 *
 *   identity rail │ the tagline's lead and focus areas
 *   (sticky, lg)  │ Ask Lucian  a question answered with quotes from the
 *                 │          site (the ⌘K palette's Ask mode); shown once
 *                 │          there is a bio or a CV section to quote
 *                 │ Bio      the owner's own words (admin → About bio);
 *                 │          omitted while empty, never drafted from the CV
 *                 │ Recommendations  entries given with permission (CV Studio);
 *                 │          omitted while there is none
 *                 │ CV       every CV section, open, with the EN / 中 toggle
 *
 * Each block opens with the site's plain SectionHeading (no index numbers).
 *
 * /zh/about (pages/zh/about.tsx, F3) renders this page in Chinese: the
 * Chinese bio (it exists only while that is written), the Chinese tagline's
 * lead and focus areas, the Chinese CV first, the interface in Chinese
 * (`ui`, lib/uiStrings/about). Data: lib/aboutPage.
 *
 * The GitHub widgets and the experience timeline live on the home page only.
 * Below lg the rail is the page header; the section nav shows from lg up.
 */
const About = ({
  hero,
  identity,
  portrait,
  availability,
  bio,
  cv,
  work,
  personFacts,
  chromeSocials,
  recommendations,
  recommendationsLang = 'en',
  publicationCount = 0,
  orcid = '',
  orcidAuthenticated = false,
  ui,
  lang: pageLang,
  alternates,
  nameZh,
  chromeZh,
}: Props) => {
  const t = ui?.t ?? ABOUT_EN
  const zhPage = pageLang !== 'en'
  const path = zhPage ? '/zh/about' : '/about'
  const owner = zhPage && nameZh ? `${nameZh}（Lucian）` : PERSON_NAME
  // The CV stack starts in the page's language.
  const [lang, setLang] = useState<'en' | 'zh'>(zhPage ? 'zh' : 'en')
  const [lead, ...focus] = taglinePhrases(hero.tagline)
  const socials = useMemo(() => resolveSocialLinks(chromeSocials), [chromeSocials])
  const active = lang === 'zh' && hasChineseCv(cv.zh) ? 'zh' : 'en'
  const nav = useMemo(
    () =>
      aboutNavEntries(renderedCvSections(active === 'zh' ? cv.zh : cv.en), {
        hasBio: !!bio,
        hasRecommendations: !!recommendations,
        lang: active,
        t,
        zh: zhPage,
      }),
    [active, cv.en, cv.zh, bio, recommendations, t, zhPage],
  )

  return (
    <React.Fragment>
      <CustomHead
        title={t.title}
        description={fillUi(t.description, { name: owner })}
        url={absUrl(path)}
        image={ogPresetUrl('about')}
        type="profile"
        lang={pageLang}
        nameZh={nameZh}
        alternates={alternates}
        jsonLd={[
          profilePageNode({ path, name: fillUi(t.profileName, { name: owner }), dateModified: personFacts.dateModified }),
          personNode(personFacts),
          breadcrumb([
            { name: t.home, path: zhPage && chromeZh?.includes('/') ? '/zh' : '/' },
            { name: t.title, path },
          ]),
        ]}
      />
      <HeaderFooter>
        <Box w="100%" maxW="var(--container-content)" mx="auto" px={{ base: 4, md: 6, lg: 8 }} py={{ base: 10, md: 14, lg: 16 }}>
          <Grid templateColumns={{ base: 'minmax(0, 1fr)', lg: 'minmax(0, 20rem) minmax(0, 1fr)' }} columnGap={{ lg: 16 }} rowGap={{ base: 10, md: 12 }} alignItems="start">
            <IdentityRail
              brand={hero.brand}
              identity={identity}
              portrait={portrait}
              availability={availability}
              socials={socials}
              nav={nav}
              cvLang={active}
              publicationCount={publicationCount}
              orcid={orcid}
              orcidAuthenticated={orcidAuthenticated}
              t={t}
              zh={zhPage}
            />

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
                      aria-label={t.focusAreas}
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

              {bio || cv.en.length || cv.zh.length ? <AskEntry mb={{ base: 14, md: 16 }} copy={t.ask} /> : null}

              {bio ? (
                <Box as="section" id="about-bio" aria-labelledby="about-bio-heading" mb={{ base: 14, md: 16 }} sx={{ scrollMarginTop: clearOfHeader('8px') }}>
                  <SectionHeading id="about-bio-heading">{t.bio}</SectionHeading>
                  <Box lang={bio.lang}>
                    <MDXContent tree={bio.tree} as="div" />
                  </Box>
                </Box>
              ) : null}

              {recommendations ? (
                <Box mb={{ base: 14, md: 16 }}>
                  <AboutRecommendations
                    section={recommendations}
                    lang={recommendationsLang}
                    pageLang={zhPage ? 'zh' : 'en'}
                    sourceNewTab={t.sourceNewTab}
                    title={
                      <SectionHeading id="about-recommendations" sx={ANCHOR_SX}>
                        {t.recommendations}
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
                  labels={t.cvToggle}
                  pageLang={zhPage ? 'zh' : 'en'}
                  title={
                    <SectionHeading id="about-cv-heading" mb={0} sx={ANCHOR_SX}>
                      {t.cv}
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

/** Data and regeneration: lib/aboutPage (shared with /zh/about). */
export const getStaticProps: GetStaticProps<Props> = async () => (await import('../../lib/aboutPage')).loadAboutPage('en')
