import { useSession } from 'next-auth/react'
import React, { useEffect, useState } from 'react'

import LandingCVSections from '../../components/LandingPage/LandingCVSections'
import { Flex, useMediaQuery } from '@chakra-ui/react'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'

const About = (props: any) => {
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
    <React.Fragment>
      <CustomHead
        title="About"
        description="About Hiko — background, skills, and interests."
        url={`https://${props.host || 'hiko.dev'}/about`}
        image="/images/hikoAvator.png"
      />
      <HeaderFooter isMobile={isMobile}>
        <Flex direction="column" alignItems="center" justifyContent="center" p={['20px', '40px']} gap={['20px', '40px']}>
          <LandingCVSections />
        </Flex>
      </HeaderFooter>
    </React.Fragment>
  )
}

export default About
