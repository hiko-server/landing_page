import { Box } from '@chakra-ui/react'
import React from 'react'

import PersonalInfo, { type AvatarMeta } from './PersonalInfo'
import Content, { type HomeWriting } from './Content'
import Brands from '../BrandShowcase/BrandShowcase'
// Pure shape — must NOT import from lib/home (server-only / better-sqlite3).
import { isSectionVisible, type HomeData } from '../../lib/homeShape'
import type { CvSectionLike } from '../../lib/cvVisibility'
import type { CurrentlyCoding } from '../../lib/currentlyCoding'
import type { HeroIdentity } from './heroIdentity'
import type { WorkIndexItem } from './projectMatch'
import type { ScrollerImage } from '../imageScoller/imageScroller'
import type { GithubSummary } from '../Common/githubEvents'

/**
 * Home page body: hero → affiliations strip → [02]… sections.
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
  work,
  avatar,
  photos,
  github,
  writing,
}: {
  home?: HomeData | null
  cv?: { en: CvSectionLike[]; zh: CvSectionLike[] } | null
  identity: HeroIdentity
  autoCoding: CurrentlyCoding
  work?: WorkIndexItem[]
  /** Portrait file facts (size, upload variants) from the server. */
  avatar?: AvatarMeta
  /** Field-note photos with their intrinsic sizes / srcsets (server-enriched). */
  photos?: ScrollerImage[]
  github?: GithubSummary | null
  writing?: HomeWriting | null
}) => {
  return (
    <Box w="100%" pb={{ base: 10, md: 16 }}>
      {isSectionVisible(home, 'introduction') && (
        <PersonalInfo home={home || undefined} identity={identity} autoCoding={autoCoding} avatar={avatar} />
      )}

      {isSectionVisible(home, 'brands') && (
        <Box w="100%" mt={{ base: 2, md: 6 }}>
          <Brands brands={home?.brands} />
        </Box>
      )}

      <Box w="100%" mt={{ base: 2, md: 6 }}>
        <Content photos={photos} cvEn={cv?.en} home={home || undefined} work={work} github={github} writing={writing} />
      </Box>
    </Box>
  )
}

export default LandingContent
