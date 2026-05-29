import { Box, Flex } from '@chakra-ui/react'
import React from 'react'

import PersonalInfo from './PersonalInfo'
import Content from './Content'
import Brands from '../BrandShowcase/BrandShowcase'
// Pure shape — must NOT import from lib/home (server-only / better-sqlite3).
import { isSectionVisible, type HomeData } from '../../lib/homeShape'

const LandingContent = ({
  isMobile,
  home,
  cv,
}: {
  isMobile: boolean
  home?: HomeData | null
  cv?: { en: any[]; zh: any[] } | null
}) => {
  const showIntro = isSectionVisible(home, 'introduction')
  const showBrands = isSectionVisible(home, 'brands')

  return (
    <Flex
      justifyContent="center"
      alignItems="center"
      flexWrap="wrap"
      borderRadius="20px"
      w="100%"
      bg="transparent"
      className="premium-home-shell"
      px={{ base: 2, md: 4 }}
      pb={{ base: 10, md: 16 }}
    >
      {showIntro && (
        <PersonalInfo isMobile={isMobile} home={home || undefined} cvEn={cv?.en} />
      )}

      {showBrands && (
        <Box w="100%" mt={{ base: 4, md: 8 }}>
          <Brands brands={home?.brands} />
        </Box>
      )}

      <Box w="100%" mt={{ base: 4, md: 10 }}>
        <Content
          quickAccess={home?.quickAccess}
          photos={home?.photos as any}
          cvEn={cv?.en}
          cvZh={cv?.zh}
          home={home || undefined}
        />
      </Box>
    </Flex>
  )
}

export default LandingContent
