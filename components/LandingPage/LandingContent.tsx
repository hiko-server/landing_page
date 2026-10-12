import { Box } from '@chakra-ui/react'
import React from 'react'

import PersonalInfo from './PersonalInfo'
import Content from './Content'
import Brands from '../BrandShowcase/BrandShowcase'
// Pure shape — must NOT import from lib/home (server-only / better-sqlite3).
import { isSectionVisible, type HomeData } from '../../lib/homeShape'
import type { CvSectionLike } from '../../lib/cvVisibility'
import type { CurrentlyCoding } from '../../lib/currentlyCoding'
import type { HeroIdentity } from './heroIdentity'
import type { WorkIndexItem } from './projectMatch'

/**
 * Home page body: hero → affiliations strip → [02]…[09] sections.
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
}: {
  home?: HomeData | null
  cv?: { en: CvSectionLike[]; zh: CvSectionLike[] } | null
  identity: HeroIdentity
  autoCoding: CurrentlyCoding
  work?: WorkIndexItem[]
}) => {
  return (
    <Box w="100%" pb={{ base: 10, md: 16 }}>
      {isSectionVisible(home, 'introduction') && (
        <PersonalInfo home={home || undefined} identity={identity} autoCoding={autoCoding} />
      )}

      {isSectionVisible(home, 'brands') && (
        <Box w="100%" mt={{ base: 2, md: 6 }}>
          <Brands brands={home?.brands} />
        </Box>
      )}

      <Box w="100%" mt={{ base: 2, md: 6 }}>
        <Content photos={home?.photos} cvEn={cv?.en} home={home || undefined} work={work} />
      </Box>
    </Box>
  )
}

export default LandingContent
