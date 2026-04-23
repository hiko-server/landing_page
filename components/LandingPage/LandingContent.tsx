import { Box, Flex } from '@chakra-ui/react'

import PersonalInfo from './PersonalInfo'
import Content from './Content'
import Brands from '../BrandShowcase/BrandShowcase'
import type { HomeData } from '../../lib/home'

const LandingContent = ({ home, cv }: { home?: HomeData | null; cv?: { en: any[]; zh: any[] } | null }) => {
  return (
    <Flex
      direction="column"
      justifyContent={'center'}
      alignItems={'center'}
      gap={{ base: '6', md: '10' }}
      flexWrap="wrap"
      borderRadius={'8px'}
      w="full"
      px={{ base: 0, md: 4 }}
      pb={{ base: 10, md: 14 }}
    >
      <PersonalInfo home={home || undefined} />

      <Brands brands={home?.brands} />
      <Box
        w="full"
      >
        <Content quickAccess={home?.quickAccess} photos={home?.photos as any} cvEn={cv?.en} cvZh={cv?.zh} home={home || undefined} />
      </Box>
      {/* <CryptoPriceTracker /> */}
    </Flex>
  )
}

export default LandingContent
