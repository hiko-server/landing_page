import React, { useState, useEffect } from 'react'
import { Box, Button, Flex, Text } from '@chakra-ui/react'

import PersonalInfo from '../LandingPage/PersonalInfo'
import LandingLayout from '../../layout/LandingLayout'

const DisplayMobileInfo = () => {
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
        <Text>
          <strong>This site cannot be displayed on mobile phones.</strong>
        </Text>
        <Text>
          <strong>For more information, you can visit:</strong>
        </Text>
        <PersonalInfo />
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
    </LandingLayout>
  )
}

export default DisplayMobileInfo
