import React, { useState, useEffect } from 'react'
import { Box, Button, Flex, Text } from '@chakra-ui/react'

import PersonalInfo from '../LandingPage/PersonalInfo'
import LandingLayout from '../../layout/LandingLayout'

const DisplayMobileInfo = ({ isMobile,setIsMobile }: { isMobile: boolean,setIsMobile: React.Dispatch<React.SetStateAction<boolean>> }) => {
  // const router = useRouter()
  const [screenSize, setScreenSize] = useState('')
  const [browserInfo, setBrowserInfo] = useState('')
  const [ipInfo, setIpInfo] = useState('')

  useEffect(() => {
    setScreenSize(`${window.screen.width} x ${window.screen.height}`)
    setBrowserInfo(window.navigator.userAgent)
    setIpInfo(window.location.host)
  }, [])

  return (
    <LandingLayout>
      <Box mt={4}>
        <PersonalInfo isMobile={isMobile} />
        <Text mt={4}>
          <strong>Current Screen Size:</strong> {screenSize}
        </Text>
        <Text>
          <strong>Suggested Screen Size:</strong> 1920 x 1080
        </Text>
        <Text>
          <strong>Browser Info:</strong> {browserInfo}
        </Text>
        <Text>
          <strong>IP Info:</strong> {ipInfo}
        </Text>
      </Box>
      <Flex direction="column" mt={4}>
        <Text>
        <strong>You can change to Desktop Version by clicking</strong>
        </Text>
        <Button 
          onClick={() => setIsMobile(false)} 
          ml={2} 
          size="sm"
        >
          Desktop Version (Not Recommended)
        </Button>
        </Flex>
    </LandingLayout >
  )
}

export default DisplayMobileInfo
