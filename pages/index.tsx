import { useSession } from 'next-auth/react'
import React, { useState, useEffect } from 'react'
import { GetServerSideProps } from 'next'
import { Flex, useMediaQuery } from '@chakra-ui/react'

import DisplayMobileInfo from '../components/mobileDisplay/mobileDisplay'
import LandingContent from '../components/LandingPage/LandingContent'
import HeaderFooter from '../layout/HeaderFooter'
import CustomHead from '../components/General-UI/CustomHead'



const LandingPage = (props: any) => {
  console.log('props', props)

  const { data: session, status } = useSession()
  console.log('session', session)
  console.log('status', status)
  console.log(session?.accessToken)

  const [, setIsHostCV] = useState<boolean>(false)
  const [isMobile] = useMediaQuery('(max-width: 767px)')

  useEffect(() => {
    if (props.host && props.host === 'cv.hiko.dev') {
      setIsHostCV(true)
    }
  }, [props.host])

  return (
    <>
      <CustomHead
        title="Home"
        description="Hiko — Full-stack engineer. View CV, projects, and contact."
        url={`https://${props.host}`}
        image="/images/hikoAvator.png"
        type="website"
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'HIKO.DEV',
            url: `https://${props.host}`,
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Person',
            name: 'Li Yanpei (Hiko)',
            url: `https://${props.host}`,
            sameAs: [
              'https://github.com/HikoPLi',
              'https://gitlab.com/HikoPLi',
              'https://www.linkedin.com/in/liyanpeihiko/',
            ],
            jobTitle: 'Software Engineer',
          },
        ]}
      />

      <HeaderFooter isMobile={isMobile}>
        {isMobile ? (
          <DisplayMobileInfo isMobile={isMobile} setIsMobile={() => {}} />
        ) : (
          <Flex direction="column" alignItems="center" justifyContent="center" gap={['20px', '40px']}>
            <LandingContent isMobile={isMobile} />
          </Flex>
        )}
      </HeaderFooter>
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
