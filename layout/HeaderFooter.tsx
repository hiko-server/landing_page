import { Box } from '@chakra-ui/react'
import Footer from '../components/Footer/Footer'
import Header from '../components/Header/Header'
import AnimatedBackground from '../components/Background/AnimatedBackground'
import ParticlesBackground from '../components/Background/ParticlesBackground'

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
      {/* Background layers */}
      <div className="no-print">
        <AnimatedBackground />
        <ParticlesBackground />
      </div>

      {/* Foreground content */}
      <Box position="relative" zIndex={1} className="no-print">
        <Header isMobile={isMobile} />
      </Box>
      <Box position="relative" zIndex={1} className="print-parent">{children}</Box>
      <Box position="relative" zIndex={1} className="no-print">
        <Footer />
      </Box>
    </Box>
    // {/* </React.Fragment> */}
  )
}

export default HeaderFooter
