import { Box } from '@chakra-ui/react'

import PersonalInfo, { type AvatarMeta } from './PersonalInfo'
import Content, { type HomeWriting } from './Content'
import ProofStrip from './ProofStrip'
import Brands from '../BrandShowcase/BrandShowcase'
// The read-side helpers only (lib/homeSections): never lib/home (server-only /
// better-sqlite3), and not lib/homeShape's runtime (the admin's validation).
import type { HomeData } from '../../lib/homeShape'
import { isSectionVisible, visibleHighlights } from '../../lib/homeSections'
import type { CvSectionLike } from '../../lib/cvVisibility'
import type { CurrentlyCoding } from '../../lib/currentlyCoding'
import type { HeroIdentity, HeroMeta } from './heroIdentity'
import type { WorkIndexItem } from './projectMatch'
import type { ScrollerImage } from '../imageScoller/imageScroller'
import type { GithubPageData } from '../Common/githubEvents'
import type { SelectedPublications } from '../../lib/publications/selected'

/**
 * Home page body: hero → highlights (proof strip) → affiliations strip →
 * the numbered sections in the owner's order.
 *
 * Every size and direction is a CSS/Chakra responsive value — nothing reads
 * the viewport in JS, so the server-rendered HTML is already the final
 * layout on every screen (no post-hydration flip, no layout shift).
 */
const LandingContent = ({
  home,
  cv,
  identity,
  autoCoding,
  meta,
  work,
  avatar,
  photos,
  github,
  writing,
  publications,
}: {
  home?: HomeData | null
  cv?: { en: CvSectionLike[]; zh: CvSectionLike[] } | null
  identity: HeroIdentity
  autoCoding: CurrentlyCoding
  /** Hero location / languages from the public CV. */
  meta?: HeroMeta
  work?: WorkIndexItem[]
  /** Portrait file facts (size, upload variants) from the server. */
  avatar?: AvatarMeta
  /** Field-note photos with their intrinsic sizes / srcsets (server-enriched). */
  photos?: ScrollerImage[]
  github?: GithubPageData | null
  writing?: HomeWriting | null
  /** "Selected publications" (server data; null without a public paper). */
  publications?: SelectedPublications | null
}) => {
  const highlights = isSectionVisible(home, 'highlights') ? visibleHighlights(home?.highlights) : []
  return (
    <Box w="100%" pb={{ base: 10, md: 16 }}>
      {isSectionVisible(home, 'introduction') && (
        <PersonalInfo home={home || undefined} identity={identity} autoCoding={autoCoding} avatar={avatar} meta={meta} />
      )}

      {highlights.length > 0 && (
        <Box w="100%" mt={{ base: 0, md: -6 }} mb={{ base: 4, md: 6 }}>
          <ProofStrip highlights={highlights} />
        </Box>
      )}

      {isSectionVisible(home, 'brands') && (
        <Box w="100%" mt={{ base: 2, md: 6 }}>
          <Brands brands={home?.brands} />
        </Box>
      )}

      <Box w="100%" mt={{ base: 2, md: 6 }}>
        <Content photos={photos} cvEn={cv?.en} home={home || undefined} work={work} github={github} writing={writing} publications={publications} />
      </Box>
    </Box>
  )
}

export default LandingContent
