import { useSession } from 'next-auth/react'
import React, { useEffect, useState } from 'react'

import { Flex, Spinner } from '@chakra-ui/react'

import HeaderFooter from '../../layout/HeaderFooter'
import Payment from '../../components/QuickPayment/Payment'

const QuickPayment = (props: any) => {
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
          <Flex
            direction="column"
            alignItems="center"
            justifyContent="center"
            p={['20px', '40px']}
            gap={['20px', '40px']}
          >
            <Payment />
          </Flex>
        </HeaderFooter>
      )}
    </React.Fragment>
  )
}

export default QuickPayment
