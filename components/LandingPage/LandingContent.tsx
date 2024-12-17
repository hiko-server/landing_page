import { Flex } from '@chakra-ui/react'
import React from 'react'

import PersonalInfo from './PersonalInfo'
import Content from './Content'

const LandingContent = ({ isMobile }: { isMobile: boolean }) => {
  return (
    <Flex
      padding={['20px', '40px']}
      direction={'row'}
      justifyContent={'center'}
      alignItems={'center'}
      gap={['20px', '40px']}
      wrap={'wrap'}
      backgroundColor={'#f8f9fa'}
      boxShadow={'0 4px 8px rgba(0, 0, 0, 0.1)'}
      borderRadius={'8px'}
    >
      <PersonalInfo isMobile={isMobile}/>
      <Content />
    </Flex>
  )
}

export default LandingContent
