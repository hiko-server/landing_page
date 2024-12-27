import { useSession } from 'next-auth/react'
import React, { useEffect, useState } from 'react'


import Header from '../../components/Header/Header'
import Footer from '../../components/Footer/Footer'

import { Flex } from '@chakra-ui/react'
import PersonalInfo from '../../components/LandingPage/PersonalInfo'


const About = (props: any) => {
  console.log('props', props)

  const { data: session, status } = useSession()
  console.log('session', session)
  console.log('status', status)
  console.log(session?.accessToken)

  const [, setIsHostCV] = useState<boolean>(false)

  const [isMobile, setIsMobile] = useState<boolean>(false)

  useEffect(() => {
    if (props.host && props.host === 'cv.hiko.dev') {
      setIsHostCV(true)
    }


    const mediaQuery = window.matchMedia('(max-width: 767px)')
    setIsMobile(mediaQuery.matches)

    const handleResize = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
    }

    mediaQuery.addEventListener('change', handleResize)

    return () => {
      mediaQuery.removeEventListener('change', handleResize)
    }
  }, [])


  return (
    <React.Fragment>
      <Header />
    <Flex
      direction="column"
      alignItems="center"
      justifyContent="center"
      p={['20px', '40px']}
      gap={['20px', '40px']}
    >
      <PersonalInfo isMobile={isMobile}/>
      </Flex>
        
      <Footer />
      
    </React.Fragment>
  )
}

export default About