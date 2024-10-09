import React, { useState, useEffect } from 'react'
import { Box, Button, Flex, Text } from '@chakra-ui/react'

import { useRouter } from 'next/router'
import LinkedInBadge from '../linkedIn/linkedIn'

const DisplayMobileInfo = () => {
  const router = useRouter()
  const [screenSize, setScreenSize] = useState('')
  const [browserInfo, setBrowserInfo] = useState('')
  const [ipInfo, setIpInfo] = useState('')

  useEffect(() => {
    setScreenSize(`${window.screen.width} x ${window.screen.height}`)
    setBrowserInfo(window.navigator.userAgent)
    setIpInfo(window.location.host)
  }, [])

  return (
    <Box mt={4}>
      <Text>
        <strong>This site cannot be displayed on mobile phones.</strong>
      </Text>
      <Text>
        <strong>For more information, you can visit:</strong>
      </Text>
      <Flex direction="column" gap={3} alignItems="center">
        <LinkedInBadge />
        <Button
          size="lg"
          fontSize="15px"
          onClick={() => {
            router.push('https://www.linkedin.com/in/yan-pei-li-21ba52263/')
          }}
        >
          LinkedIn
        </Button>

        <Button
          size="lg"
          fontSize="15px"
          onClick={() => {
            router.push('https://github.com/HikoPLi')
          }}
        >
          GitHub
        </Button>

        <Button
          size="lg"
          fontSize="15px"
          onClick={() => {
            router.push('https://gitlab.com/HikoPLi')
          }}
        >
          GitLab
        </Button>
      </Flex>
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
  )
}

export default DisplayMobileInfo
