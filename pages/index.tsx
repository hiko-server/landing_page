import { useSession } from 'next-auth/react'
import React, { useState, useEffect } from 'react'
import { GetServerSideProps } from 'next'
import { Flex, Spinner } from '@chakra-ui/react'

import DisplayMobileInfo from '../components/mobileDisplay/mobileDisplay'
import LandingContent from '../components/LandingPage/LandingContent'
import HeaderFooter from '../layout/HeaderFooter'



const LandingPage = (props: any) => {
  console.log('props', props)

  const { data: session, status } = useSession()
  console.log('session', session)
  console.log('status', status)
  console.log(session?.accessToken)

  const [, setIsHostCV] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isMobile, setIsMobile] = useState<boolean>(false)

  useEffect(() => {
    if (props.host && props.host === 'cv.hiko.dev') {
      setIsHostCV(true)
    }
    setIsLoading(false)

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
    <>
 
      {isLoading ? (
        <Flex
          h={'100vh'}
          w={'100vw'}
          alignItems={'center'}
          justifyContent={'center'}
        >
          <Spinner size="xl" />
        </Flex>
      ) : (
        <HeaderFooter isMobile={isMobile}>
          
          {isMobile ? (
            <DisplayMobileInfo isMobile={isMobile} setIsMobile={setIsMobile} />
          ) : (
            
            <Flex
              direction="column"
              alignItems="center"
              justifyContent="center"
              // p={['20px', '40px']}
              gap={['20px', '40px']}
            >

              <LandingContent isMobile={isMobile} />

            </Flex>
            
          )}
          
        </HeaderFooter>
      )}
    </>
  )
}

export default LandingPage

export const getServerSideProps: GetServerSideProps = async (context: any) => {
  const host = context.req.headers.host
  console.log({ host })
  return {
    props: { host: host },
  }
}
