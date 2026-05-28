import { Box } from '@chakra-ui/react'
import Footer from '../components/Footer/Footer'
import Header from '../components/Header/Header'
import React from 'react'

/**
 * Page chrome: <Header> + page content + <Footer>.
 *
 * v6 update — removed the two global background layers:
 *   - <AnimatedBackground/>  three blurred gradient blobs that read as a
 *                            web3-startup landing-page corner glow
 *   - <ParticlesBackground/> canvas constellation network
 *
 * Both clashed with the Hero photo (HeroAmbient mountains) and made the
 * /about CV cards sit on a busy, dated backdrop. The body now uses only
 * the global 8×8 dot grid defined in styles/globals.css, which keeps the
 * engineer signature without competing with foreground content.
 */
const HeaderFooter = ({
  children,
  isMobile,
}: {
  children: React.ReactNode
  isMobile: boolean
}) => {
  return (
    <Box gridTemplateRows="auto 1fr auto" minHeight="100vh" w="full">
      <Box position="relative" zIndex={1} className="no-print">
        <Header isMobile={isMobile} />
      </Box>
      <Box position="relative" zIndex={1} className="print-parent">
        {children}
      </Box>
      <Box position="relative" zIndex={1} className="no-print">
        <Footer />
      </Box>
    </Box>
  )
}

export default HeaderFooter
