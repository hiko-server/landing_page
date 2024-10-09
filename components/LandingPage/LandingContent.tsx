import { Flex } from '@chakra-ui/react'
import React from 'react'
import { useRouter } from 'next/router'
import PersonalInfo from './PersonalInfo'
import Content from './Content'

const LandingContent = () => {
  const router = useRouter()
  return (
    <Flex
      padding={'20px'}
      direction={'row'}
      justifyContent={'center'}
      alignItems={'center'}
      gap={'20px'}
    >
      <PersonalInfo />
      <Content />
    </Flex>
  )
}

export default LandingContent
