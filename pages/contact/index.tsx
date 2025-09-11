import { useSession } from 'next-auth/react'
import React, { useEffect, useState } from 'react'

import { Flex, useMediaQuery } from '@chakra-ui/react'

import ContactPro from '../../components/Contact/ContactPro'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'

const About = (props: any) => {
  useSession()

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
          <ContactPro home={props.home || undefined} />
        </Flex>
      </HeaderFooter>
    </React.Fragment>
  )
}

export default About

export async function getServerSideProps(context: any) {
  const host = context.req.headers.host || 'hiko.dev'
  let home = null
  try {
    const mod = await import('../../lib/home')
    home = mod.readHome()
  } catch {}
  return { props: { host, home } }
}
