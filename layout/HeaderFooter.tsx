import { Box } from '@chakra-ui/react'
import Footer from '../components/Footer/Footer'
import Header from '../components/Header/Header'
import React from 'react'

const HeaderFooter = ({
  children,
  isMobile,
}: {
  children: React.ReactNode
  isMobile: boolean
}) => {
  return (
    <Box
      // display="grid"
      gridTemplateRows="auto 1fr auto"
      minHeight="100vh"
      w="full"
    >
    {/* <React.Fragment> */}
      <Header isMobile={isMobile} />
      <Box>{children}</Box>
      <Footer />
    </Box>
    // {/* </React.Fragment> */}
  )
}

export default HeaderFooter
