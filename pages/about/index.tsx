import { useSession } from 'next-auth/react'
import React from 'react'


import Header from '../../components/Header/Header'
import Footer from '../../components/Footer/Footer'
import LandingCVSections from '../../components/LandingPage/LandingCVSections'
import { Flex } from '@chakra-ui/react'


const About = (props: any) => {
  console.log('props', props)

  const { data: session, status } = useSession()
  console.log('session', session)
  console.log('status', status)
  console.log(session?.accessToken)


  return (
    <React.Fragment>
      <Header />
      <Flex           
      position={'sticky'}
      direction={'column'}
            h={'100vh'}
          w={'100vw'}
          alignItems={'center'}
        //   justifyContent={'center'}
          >
      <LandingCVSections />
      </Flex>
        
      <Footer />
    </React.Fragment>
  )
}

export default About