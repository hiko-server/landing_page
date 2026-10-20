/**
 * getStaticProps of /about and of its Chinese page /zh/about (F3).
 * SERVER-ONLY.
 *
 * Incremental static regeneration: regenerated right after a save of the
 * home document, the CV, the bio (either language) or a case study
 * (lib/revalidate.ts), and at most an hour after the previous render
 * (lib/isr.ts — "Present" / "Expected" follow the reference month). The
 * build renders without the content store; boot warm-up replaces that copy.
 * Every read is best effort.
 *
 * /zh/about exists only while the owner has written the Chinese bio (the
 * `about-zh` page, About editor → 中文; lib/zhSite): without it the page
 * answers 404. It renders only owner-written Chinese: the Chinese bio, the
 * lead and focus areas of the Chinese tagline (left out while it is not
 * written), the Chinese CV (the EN / 中 toggle starts on 中) and the Chinese
 * availability lines; recommendations come from the Chinese CV when it has
 * them, else from the English one, marked as English — never translated.
 */

import type { GetStaticPropsResult } from 'next'
import type { Root as HastRoot } from 'hast'
import { CV_WEBSITE_SECTIONS } from '../components/LandingPage/LandingCVSections'
import { heroIdentity, portraitAlt, type HeroIdentity } from '../components/LandingPage/heroIdentity'
import { recommendationsSection } from '../components/CVViewerPage/recommendationView'
import type { WorkIndexItem } from '../components/LandingPage/projectMatch'
import type { RailPortrait } from '../components/About/IdentityRail'
import { availabilityView, type AvailabilityView } from '../components/Common/availability'
import type { CvSectionLike } from './cvVisibility'
import type { HomeData } from './homeShape'
import type { PersonFacts } from './schema'
import { safeHref } from './cvFormat'
import { referenceMonth } from './clock'
import { PROFILE_REVALIDATE_SECONDS, revalidateAfter } from './isr'
import { aboutUiFor, type AboutUi } from './uiStrings/about'
import { contactUiFor } from './uiStrings/contact'
import { ownerNameZh, pairLanguageProps, type PageLanguageProps } from './pageLanguage'
import { ABOUT_ZH_PAGE, hasZhBio } from './zhSite'
import { ZH_LANG } from './zhRoutes'

export type AboutLang = 'en' | typeof ZH_LANG

export type AboutPageProps = PageLanguageProps & {
  /** Only the brand + tagline the page prints (the Chinese tagline on /zh/about) — not the whole home document. */
  hero: { brand: string; tagline: string }
  /** Display names from the website-pruned Personal Info (never the section itself). */
  identity: HeroIdentity
  /** The home portrait with its crop, size and upload srcset; null when none is set. */
  portrait: RailPortrait | null
  /** The owner's availability (Home editor); null when not set. */
  availability: AvailabilityView | null
  /** The owner's bio in the page's language (admin → About bio), compiled on the server; null while it is empty. */
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
  /** The CV language the recommendations come from. */
  recommendationsLang?: 'en' | 'zh'
  /** How many papers /publications lists (0: no page, no link on the rail). */
  publicationCount?: number
  /** The owner's public ORCID iD (website-audience Personal Info, lib/cvLinks orcidOf); '' when unset or hidden. */
  orcid?: string
  /** The owner connected that iD through ORCID's sign-in (the authenticated iD icon). */
  orcidAuthenticated?: boolean
  /** The page's words on a page in another language than English (lib/uiStrings/about); null on /about. */
  ui: AboutUi | null
  /** The owner's Chinese name (title suffix of a Chinese page); '' on /about. */
  nameZh: string
  /** Whether /publications exists, for the chrome's nav link. */
  chromePublications?: boolean
}

/** Drop undefined values (Next refuses them in props). */
function defined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}

type Loaded = { props: AboutPageProps; revalidate: number }

/** /about always renders; /zh/about answers 404 without the owner's Chinese bio. */
export async function loadAboutPage(lang?: 'en'): Promise<Loaded>
export async function loadAboutPage(lang: typeof ZH_LANG): Promise<GetStaticPropsResult<AboutPageProps>>
export async function loadAboutPage(lang: AboutLang = 'en'): Promise<GetStaticPropsResult<AboutPageProps>> {
  const zh = lang !== 'en'
  if (zh) {
    let written = false
    try {
      written = hasZhBio()
    } catch {
      written = false
    }
    if (!written) return { notFound: true, revalidate: revalidateAfter(PROFILE_REVALIDATE_SECONDS) }
  }

  let cv: AboutPageProps['cv'] = { en: [], zh: [] }
  let identity: HeroIdentity = heroIdentity(undefined, undefined)
  let hero: AboutPageProps['hero'] = { brand: '', tagline: '' }
  let portrait: AboutPageProps['portrait'] = null
  let availability: AboutPageProps['availability'] = null
  let bio: AboutPageProps['bio'] = null
  let chromeSocials: HomeData['socials'] | null | undefined
  let work: WorkIndexItem[] = []
  let personFacts: PersonFacts = {}
  let orcid = ''
  let orcidAuthenticated = false

  try {
    // Live CV from the content store, website audience, exactly the sections
    // rendered here. personalInformation is read only to derive the display
    // names and the public ORCID iD; the section itself is never shipped.
    const { readCvData, readPublicCvSections } = await import('./cvdata')
    const { orcidAuthenticatedOf, orcidOf } = await import('./orcid/cv')
    cv = readPublicCvSections('website', CV_WEBSITE_SECTIONS, ['en', 'zh'])
    // Evidence links resolved like /cv (lib/cvLinks): `caseStudy` is a PUBLISHED slug or ''.
    {
      const { withEvidenceLinks } = await import('./cvLinks')
      const { listWork } = await import('./mdx')
      const works = listWork().map(({ slug, frontmatter: fm }) => ({ slug, title: String(fm?.title || slug), link: typeof fm?.link === 'string' ? fm.link : undefined, repo: typeof fm?.repo === 'string' ? fm.repo : undefined }))
      cv = { en: withEvidenceLinks(cv.en, { works }), zh: withEvidenceLinks(cv.zh, { works }) }
    }
    const pi = readPublicCvSections('website', ['personalInformation'], ['en', 'zh'])
    const stored = readCvData()
    const storedHasPersonalInfo = [...stored.en, ...stored.zh].some((s) => s?.sessionName === 'personalInformation')
    identity = heroIdentity(pi.en[0], pi.zh[0], { storedHasPersonalInfo })
    const orcidPi = orcidOf(pi.en[0]) ? pi.en[0] : pi.zh[0]
    orcid = orcidOf(orcidPi)
    orcidAuthenticated = orcidAuthenticatedOf(orcidPi)
  } catch {
    /* best effort — render with what we have */
  }

  // Recommendations (E11): the website view keeps only entries with
  // permission; the section renders only when one is left. On /zh/about the
  // Chinese CV's, else the English CV's (shown as written).
  let recommendations: CvSectionLike | null = null
  let recommendationsLang: 'en' | 'zh' = 'en'
  try {
    const { readPublicCvSections } = await import('./cvdata')
    const both = readPublicCvSections('website', ['recommendations'], ['en', 'zh'])
    const zhSection = zh ? recommendationsSection(both.zh) : null
    if (zhSection) {
      recommendations = zhSection
      recommendationsLang = 'zh'
    } else recommendations = recommendationsSection(both.en)
  } catch {
    /* no recommendations section */
  }

  try {
    // The site-wide Person entity: the same facts the home and CV pages emit.
    personFacts = (await import('./personFacts')).loadPersonFacts()
  } catch {
    /* best effort — the node keeps its built-in defaults */
  }

  try {
    const { readPublicHome } = await import('./home')
    const home = readPublicHome()
    hero = { brand: home?.hero?.brand || '', tagline: (zh ? home?.hero?.tagline_zh : home?.hero?.tagline) || '' }
    chromeSocials = home?.socials ?? null
    availability = availabilityView(home?.availability, zh ? { zh: true, t: contactUiFor(lang).t } : {})
    const avatarUrl = safeHref(home?.hero?.avatarUrl)
    if (avatarUrl) {
      const t = home?.hero?.avatarTransform
      let facts: { width?: number; height?: number; srcSet?: string; avifSrcSet?: string } = {}
      if (avatarUrl.startsWith('/')) {
        try {
          const [{ localImageSize }, { variantAvifSrcSet, variantSrcSet }] = await Promise.all([import('./rehype/imageSize'), import('./uploadVariants')])
          const size = localImageSize(avatarUrl)
          const srcSet = variantSrcSet(avatarUrl)
          facts = defined({ width: size?.width, height: size?.height, srcSet, avifSrcSet: srcSet ? variantAvifSrcSet(avatarUrl) : undefined })
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
        alt: zh && identity.nameZh ? `${identity.nameZh}${identity.name ? `（${identity.name}）` : ''}` : portraitAlt(identity),
      })
    }
  } catch {
    /* best effort — render with what we have */
  }

  try {
    // The owner's bio in the page's language: rendered only when it has real
    // content. Never a fallback to the CV's introduction or the other language.
    const name = zh ? ABOUT_ZH_PAGE : 'about'
    const { getPage } = await import('./contentStore')
    if ((getPage(name)?.body || '').trim()) {
      const { getStaticMdxPage } = await import('./mdx')
      const page = await getStaticMdxPage(name)
      if (page) bio = { tree: page.tree, lang: page.lang }
    }
  } catch {
    bio = null
  }
  // The Chinese page exists for its bio: without one it must not render (a store that failed mid-way).
  if (zh && !bio) return { notFound: true, revalidate: revalidateAfter(PROFILE_REVALIDATE_SECONDS) }

  // Only read the /work index when something on the page can link to it:
  // a role or a CV project (either language).
  const has = (list: CvSectionLike[], name: string, key: string) => {
    const s = list.find((x) => x.sessionName === name)
    return Array.isArray(s?.[key]) && s[key].length > 0
  }
  if (has(cv.en, 'workExperience', 'experiences') || has(cv.en, 'project', 'projectExperience') || has(cv.zh, 'project', 'projectExperience')) {
    try {
      const { listWork } = await import('./mdx')
      work = listWork().map(({ slug, frontmatter: fm }) => ({ slug, title: String(fm?.title || slug) }))
    } catch {
      /* best effort — roles and projects simply render without case-study links */
    }
  }

  // The rail links /publications with its count (the website view the page lists).
  let publicationCount = 0
  let chromePublications: { chromePublications?: boolean } = {}
  try {
    const data = await import('./publicationsData')
    publicationCount = data.publicationCount()
    // Whether /publications exists, for the nav link (lib/publicationsData).
    chromePublications = data.chromePublicationsProp()
  } catch {
    /* no link */
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
      recommendationsLang,
      publicationCount,
      orcid,
      orcidAuthenticated,
      clockMonth: referenceMonth(),
      ui: zh ? aboutUiFor(lang) : null,
      nameZh: zh ? await ownerNameZh() : '',
      ...pairLanguageProps('/about', lang),
      // Omitted when the home document could not be read: the chrome then
      // loads the public view itself.
      ...(chromeSocials !== undefined ? { chromeSocials } : {}),
      ...chromePublications,
    },
  }
}
