/**
 * getStaticProps of the home page / and of its Chinese page /zh (F3).
 * SERVER-ONLY.
 *
 * Incremental static regeneration: regenerated right after every save that
 * changes what the page shows (lib/revalidate.ts HOME_PAGE_PATHS and the
 * collection / restore paths) and at most an hour after the previous render
 * (lib/isr.ts: the reference month for "Present" / "Expected", relative
 * GitHub times and numbers change without a save). Visitors get a cached
 * page and Next prefetches its data for client navigations; bfcache works.
 *
 * The build renders without the content store (Docker) and without calling
 * GitHub; that copy lives for a second and is replaced at boot
 * (scripts/warm-isr.mjs). Every read is best effort — a failing store
 * yields an honest, emptier page.
 *
 * /zh exists only while the owner has written the home page's Chinese
 * tagline (lib/zhSite): without it the page answers 404. It shows the
 * owner's Chinese copy (lib/homeLocale), the Chinese CV, the posts and case
 * studies in Chinese, and the interface in Chinese (lib/uiStrings/home); its
 * links lead to the Chinese pages that exist.
 */

import type { GetStaticPropsResult } from 'next'
import type { HomeData, SectionKey } from './homeShape'
import { isSectionVisible } from './homeSections'
import type { CvSectionLike } from './cvVisibility'
import { safeHref } from './cvFormat'
import { deriveCurrentlyCoding, type CurrentlyCoding } from './currentlyCoding'
import { heroCopy, heroIdentity, heroMeta, type HeroIdentity, type HeroMeta } from '../components/LandingPage/heroIdentity'
import { latestWriting, type WorkIndexItem } from '../components/LandingPage/projectMatch'
import type { AvatarMeta } from '../components/LandingPage/PersonalInfo'
import type { HomeWriting } from '../components/LandingPage/Content'
import type { HomeLinks } from '../components/LandingPage/homeUi'
import type { SelectedPublications } from './publications/selected'
import type { ScrollerImage } from '../components/imageScoller/imageScroller'
import { githubPageData, type GithubPageData, type GithubSummary } from '../components/Common/githubEvents'
import type { PersonFacts } from './schema'
import { referenceMonth } from './clock'
import { PROFILE_REVALIDATE_SECONDS, isBuildPhase, revalidateAfter } from './isr'
import { homeUiFor, type HomeUi } from './uiStrings/home'
import { chineseHome, englishHome, zhCaption, zhHomeDescription } from './homeLocale'
import { ownerNameZh, pairLanguageProps, type PageLanguageProps } from './pageLanguage'
import { hasZhHomeCopy, isChineseLang, zhAvailable } from './zhSite'
import { ZH_LANG, zhHref } from './zhRoutes'

export type HomeLang = 'en' | typeof ZH_LANG

export type HomePageProps = PageLanguageProps & {
  /** Public home document in the page's language (field-note photos travel separately, in `photos`). */
  home: HomeData | null
  /** Only the CV sections the home page renders (website-pruned): `en` on /, `zh` on /zh. */
  cv: { en: CvSectionLike[]; zh: CvSectionLike[] }
  identity: HeroIdentity
  /** CV-derived "currently coding" chip (only a role or study that is current), from the page's CV. */
  autoCoding: CurrentlyCoding
  /** Hero location / languages from the page's public CV (only the strings). */
  meta: HeroMeta
  /** /work case-study index, for linking project cards and roles (the page's language where a case study has it). */
  work: WorkIndexItem[]
  /** Portrait facts: intrinsic size and upload-variant srcset. */
  avatar: AvatarMeta
  /** Field-note photos with intrinsic sizes / srcsets (captions in the page's language). */
  photos: ScrollerImage[]
  /** GitHub data rendered into the HTML, trimmed to the rendered fields (null when unavailable in time). */
  github: GithubPageData | null
  /** Newest posts + case studies in the page's language (null when the section is off). */
  writing: HomeWriting | null
  /** "Selected publications" from the /publications list (null when the section is off or there is no public paper). */
  publications: SelectedPublications | null
  /** schema.org Person facts — the site-wide loader (lib/personFacts), identical on every page. */
  personFacts: PersonFacts
  /** Server reference month ('YYYY-MM', lib/clock.ts) for "Present" / "Expected". */
  clockMonth: string
  /** Public home.socials for the persistent header / footer (null = none set). */
  chromeSocials?: HomeData['socials'] | null
  /** Whether /publications exists, for the chrome's nav link. */
  chromePublications?: boolean
  /** The page's words (lib/uiStrings/home). */
  ui: HomeUi
  /** Where the page's links lead (/zh: the Chinese pages that exist). */
  links: HomeLinks
  /** The owner's Chinese name (the Chinese page's title); '' on /. */
  nameZh: string
  /** The Chinese page's meta description, from the owner's Chinese tagline; '' on /. */
  descriptionZh: string
  /** The role line of the page's tagline (the title's job title). */
  role: string
}

/** CV section each home widget renders — shipped only when that widget is on. */
const CV_SECTION_FOR: Array<[SectionKey, string]> = [
  ['projects', 'project'],
  ['experience', 'workExperience'],
  ['certifications', 'certification'],
  ['tech-stack', 'skill'],
]

/** Server budget for GitHub data; past it the widgets fetch in the browser. */
const GITHUB_BUDGET_MS = 1500
const WRITING_COUNT = 3

/** Drop undefined values (Next refuses them in props). */
function defined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

function timeout<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(value), ms)
    t.unref?.()
  })
}

type Loaded = { props: HomePageProps; revalidate: number }

/** / always renders; /zh answers 404 without the owner's Chinese tagline. */
export async function loadHomePage(lang?: 'en'): Promise<Loaded>
export async function loadHomePage(lang: typeof ZH_LANG): Promise<GetStaticPropsResult<HomePageProps>>
export async function loadHomePage(lang: HomeLang = 'en'): Promise<GetStaticPropsResult<HomePageProps>> {
  const zh = lang !== 'en'
  const cvLang = zh ? 'zh' : 'en'
  const clockMonth = referenceMonth()
  let stored: HomeData | null = null
  let chromeSocials: HomeData['socials'] | null | undefined
  try {
    const { readPublicHome } = await import('./home')
    stored = readPublicHome()
    chromeSocials = stored?.socials ?? null
  } catch {
    /* best effort — render with what we have */
  }
  if (zh && !hasZhHomeCopy(stored)) return { notFound: true, revalidate: revalidateAfter(PROFILE_REVALIDATE_SECONDS) }
  const home = stored ? (zh ? chineseHome(stored) : englishHome(stored)) : null
  const available = zhAvailable()

  const show = (key: SectionKey) => isSectionVisible(home, key)
  const githubWanted = (show('open-source') || show('activity')) && !isBuildPhase()
  const githubPromise: Promise<GithubSummary | null> = githubWanted
    ? import('./githubData')
        .then(({ loadGithubSummary }) => Promise.race([loadGithubSummary(), timeout<GithubSummary | null>(GITHUB_BUDGET_MS, null)]))
        .catch(() => null)
    : Promise.resolve(null)

  const rendered = CV_SECTION_FOR.filter(([key]) => show(key)).map(([, name]) => name)
  let sections: CvSectionLike[] = []
  let identity = heroIdentity(undefined, undefined)
  let autoCoding: CurrentlyCoding = { label: '', project: '', note: '' }
  let meta: HeroMeta = { location: '', languages: '' }
  let personFacts: PersonFacts = {}
  try {
    const { readCvData, readPublicCvSections } = await import('./cvdata')
    // Server-only reads: the name, the meta line and the "currently coding"
    // chip are derived here so personalInformation / education never reach
    // the page payload — only the strings the hero actually prints do.
    const derivedFrom = readPublicCvSections('website', ['personalInformation', 'workExperience', 'education', 'extraSkill'], ['en', 'zh'])
    const pick = (list: CvSectionLike[], name: string) => list.find((s) => s.sessionName === name)
    // Whether the STORED CV has Personal Info at all (a server-side boolean,
    // nothing of the section is shipped): one switched off the website must
    // not bring back the built-in name.
    const storedCv = readCvData()
    const storedHasPersonalInfo = [...storedCv.en, ...storedCv.zh].some((s) => s?.sessionName === 'personalInformation')
    identity = heroIdentity(pick(derivedFrom.en, 'personalInformation'), pick(derivedFrom.zh, 'personalInformation'), {
      storedHasPersonalInfo,
    })
    autoCoding = deriveCurrentlyCoding(derivedFrom[cvLang], clockMonth)
    meta = heroMeta(derivedFrom[cvLang])
    sections = rendered.length ? readPublicCvSections('website', rendered, [cvLang])[cvLang] : []
    // Evidence links resolved like /cv (lib/cvLinks): a project's `caseStudy`
    // becomes the slug of a PUBLISHED case study or '', so a draft's slug never
    // ships; profile links come from the public socials.
    if (sections.length) {
      const { withEvidenceLinks } = await import('./cvLinks')
      const { listWork } = await import('./mdx')
      sections = withEvidenceLinks(sections, { works: listWork().map(({ slug, frontmatter: fm }) => ({ slug, title: String(fm?.title || slug), link: typeof fm?.link === 'string' ? fm.link : undefined, repo: typeof fm?.repo === 'string' ? fm.repo : undefined })) })
    }
  } catch {
    /* best effort — render with what we have */
  }
  try {
    // The site-wide Person entity: the same facts /about and the CV pages emit.
    personFacts = (await import('./personFacts')).loadPersonFacts()
  } catch {
    /* best effort — the node keeps its built-in defaults */
  }

  let work: WorkIndexItem[] = []
  let writing: HomeWriting | null = null
  if (show('projects') || show('experience') || show('writing')) {
    try {
      const { listPosts, listWork } = await import('./mdx')
      const { collapseTranslations } = await import('./translations')
      const works = listWork()
      if (show('projects') || show('experience')) {
        // One entry per case study, in the page's language where it has one (F2, F3).
        work = collapseTranslations(works, lang).map(({ entry: { slug, frontmatter: fm } }) => {
          const item: WorkIndexItem = { slug, title: String(fm?.title || slug) }
          if (Array.isArray(fm?.tech)) item.tech = fm.tech.filter((t): t is string => typeof t === 'string')
          if (typeof fm?.status === 'string') item.status = fm.status
          return item
        })
      }
      if (show('writing')) {
        const posts = listPosts()
        // One entry per piece: in English on /, the pieces in Chinese on /zh (lib/indexPages).
        const { inLanguage } = await import('./indexPages')
        const once = <T extends Parameters<typeof inLanguage>[0][number]>(list: T[]) => inLanguage(list, lang).map((c) => c.entry)
        const ownPosts = zh ? posts.filter((p) => isChineseLang(p.lang)) : posts
        const ownWorks = zh ? works.filter((w) => isChineseLang(w.lang)) : works
        writing = { items: latestWriting(once(posts), once(works), WRITING_COUNT), hasPosts: ownPosts.length > 0, hasWork: ownWorks.length > 0 }
      }
    } catch {
      /* best effort — cards render without case-study links, no writing row */
    }
  }

  // Selected publications: the first papers of the /publications list
  // (website view) — only the strings the rows print, their labels in the page's language.
  let publications: SelectedPublications | null = null
  if (show('publications')) {
    try {
      publications = (await import('./publicationsData')).readHomePublications(cvLang)
    } catch {
      /* best effort — no publications row */
    }
  }

  // File facts for the portrait and the field-note photos: intrinsic size
  // (no layout shift), the variants (WebP / AVIF srcsets) and the blur
  // placeholder (lib/uploadVariants imageSources).
  let avatar: AvatarMeta = {}
  let photos: ScrollerImage[] = []
  const caption = (p: { describe?: string; describe_zh?: string }) => (zh ? zhCaption(p) : { describe: p.describe })
  const visiblePhotos = Array.isArray(stored?.photos) ? stored!.photos.filter((p) => p && p.visible !== false && safeHref(p.url)) : []
  try {
    const [{ localImageSize }, { imageSources }] = await Promise.all([import('./rehype/imageSize'), import('./uploadVariants')])
    const facts = (url: string) => {
      const local = url.startsWith('/')
      const size = local ? localImageSize(url) : null
      return defined({ width: size?.width, height: size?.height, ...(local ? imageSources(url) : {}) })
    }
    const avatarUrl = safeHref(home?.hero?.avatarUrl)
    if (avatarUrl) avatar = facts(avatarUrl)
    photos = visiblePhotos.map((p) => {
      const url = safeHref(p.url)
      return defined({ url, ...caption(p), redirectTo: p.redirectTo, ...facts(url) })
    })
  } catch {
    photos = visiblePhotos.map((p) => defined({ url: p.url, ...caption(p), redirectTo: p.redirectTo }))
  }

  const github = githubPageData(await githubPromise)
  const nameZh = zh ? await ownerNameZh() : ''
  // From /zh, a link leads to the Chinese page of its target where that exists.
  const to = (path: string) => (zh ? zhHref(path, available) : path)
  const links: HomeLinks = { cv: to('/cv'), contact: to('/contact'), blog: to('/blog'), work: to('/work'), publications: '/publications' }

  let chromePublications: { chromePublications?: boolean } = {}
  try {
    // Whether /publications exists, for the nav link (lib/publicationsData).
    chromePublications = (await import('./publicationsData')).chromePublicationsProp()
  } catch {
    /* no link */
  }

  return {
    revalidate: revalidateAfter(PROFILE_REVALIDATE_SECONDS),
    props: {
      home: home ? { ...home, photos: [] } : null,
      cv: { en: zh ? [] : sections, zh: zh ? sections : [] },
      identity,
      autoCoding,
      meta,
      work,
      avatar,
      photos,
      github,
      writing,
      publications,
      personFacts,
      clockMonth,
      ui: homeUiFor(lang),
      links,
      nameZh,
      descriptionZh: zh ? zhHomeDescription(nameZh, stored?.hero?.tagline_zh || '') : '',
      role: heroCopy(home?.hero?.tagline).role,
      ...pairLanguageProps('/', lang, available),
      // Omitted when the home document could not be read: the chrome then
      // loads the public view itself.
      ...(chromeSocials !== undefined ? { chromeSocials } : {}),
      ...chromePublications,
    },
  }
}
