import { useSession } from 'next-auth/react'
import React, { useEffect, useState } from 'react'

import { Flex, useMediaQuery } from '@chakra-ui/react'

import ContactCard from '../../components/Contact/ConatactCard'
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
        title="Contact"
        description="Get in touch with Hiko. Protected by hCaptcha."
        url={`https://${props.host || 'hiko.dev'}/contact`}
        image="/images/hikoAvator.png"
      />
      <HeaderFooter isMobile={isMobile}>
        <Flex direction="column" alignItems="center" justifyContent="center" p={['20px', '40px']} gap={['20px', '40px']}>
          <ContactCard />
        </Flex>
      </HeaderFooter>
    </React.Fragment>
  )
}

export default About
