import React, { useEffect, useState } from 'react'

import LandingCVSections from '../../components/LandingPage/LandingCVSections'
import { Flex, useMediaQuery, Box, Image, Heading } from '@chakra-ui/react'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
// import LanguageBars from '../../components/GitHub/LanguageBars'
import ActivityFeed from '../../components/GitHub/ActivityFeed'
import StatsBar from '../../components/GitHub/StatsBar'
import SectionReveal from '../../components/General-UI/SectionReveal'
import AboutHero from '../../components/About/AboutHero'
// import ProjectSpotlight from '../../components/LandingPage/ProjectSpotlight'
import ExperienceTimeline from '../../components/LandingPage/ExperienceTimeline'
import CertificationsPeek from '../../components/LandingPage/CertificationsPeek'
// import ContactPro from '../../components/Contact/ContactPro'

const About = (props: any) => {
  const [, setIsHostCV] = useState<boolean>(false)
  const [isMobile] = useMediaQuery('(max-width: 767px)')

  useEffect(() => {
    if (props.host && props.host === 'cv.hiko.dev') {
      setIsHostCV(true)
    }
  }, [props.host])

  return (
    <React.Fragment>
      <CustomHead
        title="About"
        description="About Hiko — background, skills, and interests."
        url={`https://${props.host || 'hiko.dev'}/about`}
        image="/images/hikoAvator.png"
      />
      <HeaderFooter isMobile={isMobile}>
        <Flex
          direction="column"
          alignItems="center"
          justifyContent="center"
          p={['20px', '40px']}
          gap={['20px', '40px']}
        >
          <SectionReveal>
            <AboutHero
              brand={props.home?.hero?.brand}
              tagline={props.home?.hero?.tagline}
            />
          </SectionReveal>
          <SectionReveal>
            <StatsBar />
          </SectionReveal>
          {/* <SectionReveal>
            <ProjectSpotlight cvEn={props.cv?.en} />
          </SectionReveal> */}
          <SectionReveal>
            <ExperienceTimeline cvEn={props.cv?.en} />
          </SectionReveal>
          <SectionReveal>
            <CertificationsPeek cvEn={props.cv?.en} />
          </SectionReveal>
          {/* 技术语言分布（如需恢复可取消注释） */}
          <SectionReveal>
            <Box mt={2} w="100%" maxW="1100px">
              <Heading as="h3" size="md" mb={2}>
                Recent Activity
              </Heading>
              <ActivityFeed />
            </Box>
          </SectionReveal>
          {props.githubUser ? (
            <SectionReveal>
              <Box mt={2} w="100%" maxW="1100px">
                <Heading as="h3" size="md" mb={2}>
                  Contributions
                </Heading>
                <Image
                  src={`https://ghchart.rshah.org/${props.githubUser}`}
                  alt="GitHub contributions"
                  w="100%"
                  borderRadius="md"
                />
              </Box>
            </SectionReveal>
          ) : null}
          <SectionReveal>
            <LandingCVSections en={props.cv?.en} zh={props.cv?.zh} />
          </SectionReveal>
          {/* <SectionReveal>
            <ContactPro home={props.home} />
          </SectionReveal> */}
        </Flex>
      </HeaderFooter>
    </React.Fragment>
  )
}

export default About
export async function getServerSideProps(context: any) {
  const host = context.req.headers.host || 'hiko.dev'
  let en: any[] = []
  let zh: any[] = []
  let githubUser: string | null = null
  let home: any = null
  try {
    const fs = await import('fs')
    const path = await import('path')
    const dataPath = path.join(process.cwd(), 'data', 'cvdata.json')
    try {
      const raw = fs.readFileSync(dataPath, 'utf-8') as unknown as string
      const json = JSON.parse(raw)
      en = json.en || []
      zh = json.zh || []
    } catch {}
    // No example fallback — use only real data
    try {
      const mod = await import('../../lib/home')
      home = mod.readHome()
      const url = home?.socials?.github
      if (url) {
        try {
          const u = new URL(url)
          const parts = u.pathname.split('/').filter(Boolean)
          githubUser = parts[0] || null
        } catch {}
      }
    } catch {}
  } catch {}
  return { props: { host, cv: { en, zh }, githubUser, home } }
}
