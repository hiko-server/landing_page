import { useSession } from 'next-auth/react'
import React, { useState, useEffect } from 'react'
import { GetServerSideProps } from 'next'
import { Flex, Spinner } from '@chakra-ui/react'

import DisplayMobileInfo from '../components/mobileDisplay/mobileDisplay'
import LandingContent from '../components/LandingPage/LandingContent'
import Footer from '../components/Footer/Footer'
import Header from '../components/Header/Header'

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
    <React.Fragment>
      <Header />
      {isLoading ? (
        <Flex
          h={'100vh'}
          w={'100vw'}
          alignItems={'center'}
          justifyContent={'center'}
        >
          <Spinner size="xl" />
        </Flex>
      ) : isMobile ? (
        <DisplayMobileInfo isMobile={isMobile}/>
      ) : (
        <LandingContent isMobile={isMobile}/>
      )}
      <Footer />
    </React.Fragment>
  )
}

export default LandingPage

export const getServerSideProps: GetServerSideProps = async (context: any) => {
  const host = context.req.headers.host
  console.log({ host })
  return {
    props: { host: host }, // will be passed to the page component as props
  }
}
