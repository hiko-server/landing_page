import { Box, Flex } from '@chakra-ui/react'
import React from 'react'

import PersonalInfo from './PersonalInfo'
import Content from './Content'
<<<<<<< HEAD
// import CryptoPriceTracker from '../Stock/CoinStock'

const LandingContent = ({ isMobile }: { isMobile: boolean }) => {
=======
import Brands from '../BrandShowcase/BrandShowcase'


const LandingContent = ({ isMobile }: { isMobile: boolean }) => {


  
>>>>>>> fff69c61fa55ec4ddbd3d0cbb53549c4c33ada94
  return (
    <Flex
      // w={{ base: "100%", md: "80%" }}
      // p={{ base: 4, md: 8 }}
      // mx="auto"
      // direction={{ base: 'column', md: 'row' }}
      justifyContent={'center'}
      alignItems={'center'}
      // gap={{ base: '20px', md: '40px' }}
      flexWrap="wrap"
      // zIndex={-2}
      // backgroundColor={'black'}
      // boxShadow={'0 4px 8px rgba(0, 0, 0, 0.1)'}
      borderRadius={'8px'}
    >
<<<<<<< HEAD
      <PersonalInfo isMobile={isMobile} />
      <Box
        // bgColor={'black'}
        w={{ base: 'full', md: '1/2' }}
=======
      <PersonalInfo isMobile={isMobile}/>
      
      <Brands />
      <Box 
      // bgColor={'black'} 
      w={{ base: "full", md: "1/2" }}
>>>>>>> fff69c61fa55ec4ddbd3d0cbb53549c4c33ada94
      >
        <Content />
      </Box>
      {/* <CryptoPriceTracker /> */}
    </Flex>
  )
}

export default LandingContent
