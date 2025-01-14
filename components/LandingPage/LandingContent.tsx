import { Box, Flex } from '@chakra-ui/react'
import React from 'react'

import PersonalInfo from './PersonalInfo'
import Content from './Content'


const LandingContent = ({ isMobile }: { isMobile: boolean }) => {
  
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
      <PersonalInfo isMobile={isMobile}/>
      <Box 
      // bgColor={'black'} 
      w={{ base: "full", md: "1/2" }}
      >

      <Content />
      </Box>
      
    </Flex>


  )
}

export default LandingContent