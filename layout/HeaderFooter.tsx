import { Box } from '@chakra-ui/react'
import Footer from '../components/Footer/Footer'
import Header from '../components/Header/Header'
import React from 'react'

/**
 * Page chrome: skip link + sticky <Header> + <main> + <Footer>.
 *
 * The sticky element is the header's own wrapper (a sticky child inside a
 * wrapper of the same height can never move), and it sits above page
 * content in the stacking order.
 *
 * `isMobile` is accepted for backwards compatibility with existing pages but
 * no longer used — the header switches layouts with CSS breakpoints.
 */
const HeaderFooter = ({
  children,
}: {
  children: React.ReactNode
  isMobile?: boolean
}) => {
  return (
    <Box display="flex" flexDirection="column" minHeight="100vh" w="full">
      <a className="skip-nav no-print" href="#main">
        Skip to content
      </a>
      <Box position="sticky" top={0} zIndex={40} className="no-print">
        <Header />
      </Box>
      <Box as="main" id="main" tabIndex={-1} flex="1" position="relative" zIndex={1} className="print-parent" _focus={{ outline: 'none' }}>
        {children}
      </Box>
      <Box position="relative" zIndex={1} className="no-print">
        <Footer />
      </Box>
    </Box>
  )
}

export default HeaderFooter
