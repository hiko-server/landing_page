import React from 'react'
import type { GetServerSideProps } from 'next'

import LandingContent from '../components/LandingPage/LandingContent'
import HeaderFooter from '../layout/HeaderFooter'
import CustomHead from '../components/General-UI/CustomHead'
import { absUrl, websiteNode, personNode, personFactsFromCv, ogImageUrl, type PersonFacts } from '../lib/schema'
import { isSectionVisible, type HomeData, type SectionKey } from '../lib/homeShape'
import type { CvSectionLike } from '../lib/cvVisibility'
import { deriveCurrentlyCoding, type CurrentlyCoding } from '../lib/currentlyCoding'
import { heroIdentity, type HeroIdentity } from '../components/LandingPage/heroIdentity'
import type { WorkIndexItem } from '../components/LandingPage/projectMatch'
import { referenceMonth } from '../lib/clock'

type Props = {
  home: HomeData | null
  /** Only the CV sections the home page renders (EN, website-pruned). */
  cv: { en: CvSectionLike[]; zh: CvSectionLike[] }
  identity: HeroIdentity
  /** CV-derived fallback for the hero's "currently coding" chip. */
  autoCoding: CurrentlyCoding
  /** /work case-study index, for linking project cards. */
  work: WorkIndexItem[]
  /** schema.org Person facts from PUBLIC website-visible CV data only. */
  personFacts: PersonFacts
  /** Server reference month ('YYYY-MM', lib/clock.ts) for "Present" / "Expected". */
  clockMonth: string
  /** Public home.socials for the persistent header / footer (null = none set). */
  chromeSocials?: HomeData['socials'] | null
}

const LandingPage = ({ home, cv, identity, autoCoding, work, personFacts }: Props) => {
  return (
    <>
      <CustomHead
        title="Home"
        description="Li Yanpei (Lucian) — software engineer in Hong Kong building full-stack web apps, machine-learning / computer-vision, and embedded systems. CV, projects, and contact."
        url={absUrl('/')}
        image={ogImageUrl({ kind: 'home', title: 'Li Yanpei (Lucian)', subtitle: 'Software engineer: full-stack, ML / computer vision, embedded' })}
        type="website"
        jsonLd={[websiteNode(), personNode(personFacts)]}
      />

      <HeaderFooter>
        <LandingContent home={home} cv={cv} identity={identity} autoCoding={autoCoding} work={work} />
      </HeaderFooter>
    </>
  )
}

export default LandingPage

/** CV section each home widget renders — shipped only when that widget is on. */
const CV_SECTION_FOR: Array<[SectionKey, string]> = [
  ['projects', 'project'],
  ['experience', 'workExperience'],
  ['certifications', 'certification'],
]

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  let home: HomeData | null = null
  let chromeSocials: HomeData['socials'] | null | undefined
  try {
    const { readPublicHome } = await import('../lib/home')
    home = readPublicHome()
    chromeSocials = home?.socials ?? null
  } catch {
    /* best effort — render with what we have */
  }

  const rendered = CV_SECTION_FOR.filter(([key]) => isSectionVisible(home, key)).map(([, name]) => name)
  let en: CvSectionLike[] = []
  let identity = heroIdentity(undefined, undefined)
  let autoCoding: CurrentlyCoding = { label: '', project: '', note: '' }
  let personFacts: PersonFacts = {}
  try {
    const { readCvData, readPublicCvSections } = await import('../lib/cvdata')
    // Server-only reads: the name and the "currently coding" fallback are
    // derived here so personalInformation / education never reach the page
    // payload — only the strings the hero actually prints do.
    const derivedFrom = readPublicCvSections('website', ['personalInformation', 'workExperience', 'project', 'education'], ['en', 'zh'])
    const pick = (list: CvSectionLike[], name: string) => list.find((s) => s.sessionName === name)
    // Whether the STORED CV has Personal Info at all (a server-side boolean,
    // nothing of the section is shipped): one switched off the website must
    // not bring back the built-in name.
    const stored = readCvData()
    const storedHasPersonalInfo = [...stored.en, ...stored.zh].some((s) => s?.sessionName === 'personalInformation')
    identity = heroIdentity(pick(derivedFrom.en, 'personalInformation'), pick(derivedFrom.zh, 'personalInformation'), {
      storedHasPersonalInfo,
    })
    autoCoding = deriveCurrentlyCoding(derivedFrom.en)
    // Structured data: schools and skills the visitor can already see on the
    // site — never contact details (personalInformation is not passed).
    personFacts = personFactsFromCv(readPublicCvSections('website', ['education', 'skill'], ['en']).en)
    en = rendered.length ? readPublicCvSections('website', rendered, ['en']).en : []
  } catch {
    /* best effort — render with what we have */
  }

  let work: WorkIndexItem[] = []
  if (isSectionVisible(home, 'projects')) {
    try {
      const { listWork } = await import('../lib/mdx')
      work = listWork().map(({ slug, frontmatter: fm }) => {
        const item: WorkIndexItem = { slug, title: String(fm?.title || slug) }
        if (Array.isArray(fm?.tech)) item.tech = fm.tech.filter((t): t is string => typeof t === 'string')
        if (typeof fm?.status === 'string') item.status = fm.status
        return item
      })
    } catch {
      /* best effort — cards simply render without case-study links */
    }
  }

  return {
    props: {
      home,
      cv: { en, zh: [] },
      identity,
      autoCoding,
      work,
      personFacts,
      clockMonth: referenceMonth(),
      // Omitted when the home document could not be read: the chrome then
      // loads the public view itself.
      ...(chromeSocials !== undefined ? { chromeSocials } : {}),
    },
  }
}
