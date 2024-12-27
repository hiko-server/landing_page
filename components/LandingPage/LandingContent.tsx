import { Flex } from '@chakra-ui/react'
import React from 'react'

import PersonalInfo from './PersonalInfo'
import Content from './Content'


const LandingContent = ({ isMobile }: { isMobile: boolean }) => {
  
  return (
    // <LandingLayout>
    <Flex
    
      w={{ base: "100%", md: "80%" }} 
      p={{ base: 4, md: 8 }} 
      mx="auto"
      direction={{ base: 'column', md: 'row' }}
      justifyContent={'center'}
      alignItems={'center'}
      gap={{ base: '20px', md: '40px' }}
      flexWrap="wrap"
      backgroundColor={'#f8f9fa'}
      boxShadow={'0 4px 8px rgba(0, 0, 0, 0.1)'}
      borderRadius={'8px'}
    >
      <PersonalInfo isMobile={isMobile}/>
      <Content />
    </Flex>
    // </LandingLayout>
  )
}

export default LandingContent