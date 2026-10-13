import type { GetStaticProps } from 'next'
import Head from 'next/head'

import LandingContent from '../components/LandingPage/LandingContent'
import HeaderFooter from '../layout/HeaderFooter'
import CustomHead from '../components/General-UI/CustomHead'
import { HERO_AVIF_SRCSET, HERO_SIZES } from '../components/Background/HeroAmbient'
import { absUrl, websiteNode, personNode, profilePageNode, type PersonFacts } from '../lib/schema'
import { ogPresetUrl } from '../lib/og/presets'
import type { HomeData, SectionKey } from '../lib/homeShape'
import { isSectionVisible } from '../lib/homeSections'
import type { CvSectionLike } from '../lib/cvVisibility'
import { safeHref } from '../lib/cvFormat'
import { deriveCurrentlyCoding, type CurrentlyCoding } from '../lib/currentlyCoding'
import { heroIdentity, heroMeta, type HeroIdentity, type HeroMeta } from '../components/LandingPage/heroIdentity'
import { latestWriting, type WorkIndexItem } from '../components/LandingPage/projectMatch'
import type { AvatarMeta } from '../components/LandingPage/PersonalInfo'
import type { HomeWriting } from '../components/LandingPage/Content'
import type { ScrollerImage } from '../components/imageScoller/imageScroller'
import { githubPageData, type GithubPageData, type GithubSummary } from '../components/Common/githubEvents'
import { referenceMonth } from '../lib/clock'
import { PROFILE_REVALIDATE_SECONDS, isBuildPhase, revalidateAfter } from '../lib/isr'

type Props = {
  /** Public home document (field-note photos travel separately, in `photos`). */
  home: HomeData | null
  /** Only the CV sections the home page renders (EN, website-pruned). */
  cv: { en: CvSectionLike[]; zh: CvSectionLike[] }
  identity: HeroIdentity
  /** CV-derived "currently coding" chip (only a role or study that is current). */
  autoCoding: CurrentlyCoding
  /** Hero location / languages from the public CV (only the strings). */
  meta: HeroMeta
  /** /work case-study index, for linking project cards and roles. */
  work: WorkIndexItem[]
  /** Portrait facts: intrinsic size and upload-variant srcset. */
  avatar: AvatarMeta
  /** Field-note photos with intrinsic sizes / srcsets. */
  photos: ScrollerImage[]
  /** GitHub data rendered into the HTML, trimmed to the rendered fields (null when unavailable in time). */
  github: GithubPageData | null
  /** Newest posts + case studies (null when the section is off). */
  writing: HomeWriting | null
  /** schema.org Person facts — the site-wide loader (lib/personFacts), identical on every page. */
  personFacts: PersonFacts
  /** Server reference month ('YYYY-MM', lib/clock.ts) for "Present" / "Expected". */
  clockMonth: string
  /** Public home.socials for the persistent header / footer (null = none set). */
  chromeSocials?: HomeData['socials'] | null
}

const LandingPage = ({ home, cv, identity, autoCoding, meta, work, avatar, photos, github, writing, personFacts }: Props) => {
  return (
    <>
      <CustomHead
        home
        description="Li Yanpei (Lucian) — software engineer in Hong Kong building full-stack web apps, machine-learning / computer-vision, and embedded systems. CV, projects, and contact."
        url={absUrl('/')}
        image={ogPresetUrl('home')}
        type="profile"
        jsonLd={[websiteNode(), profilePageNode({ path: '/', dateModified: personFacts.dateModified }), personNode(personFacts)]}
      />
      <Head>
        {/* The hero backdrop is the LCP element: fetch it with the HTML. AVIF
            matches the <source> nearly every browser picks; a browser without
            AVIF ignores a typed preload and uses the WebP <img>. */}
        <link
          key="hero-preload"
          rel="preload"
          as="image"
          type="image/avif"
          imageSrcSet={HERO_AVIF_SRCSET}
          imageSizes={HERO_SIZES}
          {...{ fetchpriority: 'high' }}
        />
      </Head>

      <HeaderFooter>
        <LandingContent
          home={home}
          cv={cv}
          identity={identity}
          autoCoding={autoCoding}
          meta={meta}
          work={work}
          avatar={avatar}
          photos={photos}
          github={github}
          writing={writing}
        />
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

/**
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
 */
export const getStaticProps: GetStaticProps<Props> = async () => {
  const clockMonth = referenceMonth()
  let home: HomeData | null = null
  let chromeSocials: HomeData['socials'] | null | undefined
  try {
    const { readPublicHome } = await import('../lib/home')
    home = readPublicHome()
    chromeSocials = home?.socials ?? null
  } catch {
    /* best effort — render with what we have */
  }

  const show = (key: SectionKey) => isSectionVisible(home, key)
  const githubWanted = (show('open-source') || show('activity')) && !isBuildPhase()
  const githubPromise: Promise<GithubSummary | null> = githubWanted
    ? import('../lib/githubData')
        .then(({ loadGithubSummary }) => Promise.race([loadGithubSummary(), timeout<GithubSummary | null>(GITHUB_BUDGET_MS, null)]))
        .catch(() => null)
    : Promise.resolve(null)

  const rendered = CV_SECTION_FOR.filter(([key]) => show(key)).map(([, name]) => name)
  let en: CvSectionLike[] = []
  let identity = heroIdentity(undefined, undefined)
  let autoCoding: CurrentlyCoding = { label: '', project: '', note: '' }
  let meta: HeroMeta = { location: '', languages: '' }
  let personFacts: PersonFacts = {}
  try {
    const { readCvData, readPublicCvSections } = await import('../lib/cvdata')
    // Server-only reads: the name, the meta line and the "currently coding"
    // chip are derived here so personalInformation / education never reach
    // the page payload — only the strings the hero actually prints do.
    const derivedFrom = readPublicCvSections('website', ['personalInformation', 'workExperience', 'education', 'extraSkill'], ['en', 'zh'])
    const pick = (list: CvSectionLike[], name: string) => list.find((s) => s.sessionName === name)
    // Whether the STORED CV has Personal Info at all (a server-side boolean,
    // nothing of the section is shipped): one switched off the website must
    // not bring back the built-in name.
    const stored = readCvData()
    const storedHasPersonalInfo = [...stored.en, ...stored.zh].some((s) => s?.sessionName === 'personalInformation')
    identity = heroIdentity(pick(derivedFrom.en, 'personalInformation'), pick(derivedFrom.zh, 'personalInformation'), {
      storedHasPersonalInfo,
    })
    autoCoding = deriveCurrentlyCoding(derivedFrom.en, clockMonth)
    meta = heroMeta(derivedFrom.en)
    en = rendered.length ? readPublicCvSections('website', rendered, ['en']).en : []
  } catch {
    /* best effort — render with what we have */
  }
  try {
    // The site-wide Person entity: the same facts /about and the CV pages emit.
    personFacts = (await import('../lib/personFacts')).loadPersonFacts()
  } catch {
    /* best effort — the node keeps its built-in defaults */
  }

  let work: WorkIndexItem[] = []
  let writing: HomeWriting | null = null
  if (show('projects') || show('experience') || show('writing')) {
    try {
      const { listPosts, listWork } = await import('../lib/mdx')
      const works = listWork()
      if (show('projects') || show('experience')) {
        work = works.map(({ slug, frontmatter: fm }) => {
          const item: WorkIndexItem = { slug, title: String(fm?.title || slug) }
          if (Array.isArray(fm?.tech)) item.tech = fm.tech.filter((t): t is string => typeof t === 'string')
          if (typeof fm?.status === 'string') item.status = fm.status
          return item
        })
      }
      if (show('writing')) {
        const posts = listPosts()
        writing = { items: latestWriting(posts, works, WRITING_COUNT), hasPosts: posts.length > 0, hasWork: works.length > 0 }
      }
    } catch {
      /* best effort — cards render without case-study links, no writing row */
    }
  }

  // File facts for the portrait and the field-note photos: intrinsic size
  // (no layout shift) and the upload variants (responsive srcset).
  let avatar: AvatarMeta = {}
  let photos: ScrollerImage[] = []
  try {
    const [{ localImageSize }, { variantSrcSet }] = await Promise.all([import('../lib/rehype/imageSize'), import('../lib/uploadVariants')])
    const facts = (url: string) => {
      const size = url.startsWith('/') ? localImageSize(url) : null
      return defined({ width: size?.width, height: size?.height, srcSet: url.startsWith('/') ? variantSrcSet(url) : undefined })
    }
    const avatarUrl = safeHref(home?.hero?.avatarUrl)
    if (avatarUrl) avatar = facts(avatarUrl)
    photos = (Array.isArray(home?.photos) ? home.photos : [])
      .filter((p) => p && p.visible !== false && safeHref(p.url))
      .map((p) => {
        const url = safeHref(p.url)
        return defined({ url, describe: p.describe, redirectTo: p.redirectTo, ...facts(url) })
      })
  } catch {
    photos = (Array.isArray(home?.photos) ? home.photos : []).map((p) => defined({ url: p.url, describe: p.describe, redirectTo: p.redirectTo }))
  }

  const github = githubPageData(await githubPromise)

  return {
    revalidate: revalidateAfter(PROFILE_REVALIDATE_SECONDS),
    props: {
      home: home ? { ...home, photos: [] } : null,
      cv: { en, zh: [] },
      identity,
      autoCoding,
      meta,
      work,
      avatar,
      photos,
      github,
      writing,
      personFacts,
      clockMonth,
      // Omitted when the home document could not be read: the chrome then
      // loads the public view itself.
      ...(chromeSocials !== undefined ? { chromeSocials } : {}),
    },
  }
}
