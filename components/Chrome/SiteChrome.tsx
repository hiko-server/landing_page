import React from 'react'
import { Box } from '@chakra-ui/react'
import Header from '../Header/Header'
import Footer from '../Footer/Footer'
import { ChromeContext } from './ChromeContext'

/**
 * Page chrome: skip link + sticky <Header> + <main id="main"> + <Footer>.
 *
 * _app renders this ONCE around the page outlet, so the header and footer stay
 * mounted across client-side navigations (no fade / re-mount, the last-commit
 * pill and the admin-session check are not refetched, and the active-nav
 * underline can glide between items). Pages still wrap themselves in
 * layout/HeaderFooter, which becomes a pass-through below this provider.
 *
 * The sticky element is the header's own wrapper (a sticky child inside a
 * wrapper of the same height can never move), and it sits above page content
 * in the stacking order.
 */
export default function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <ChromeContext.Provider value>
      <Box display="flex" flexDirection="column" minHeight="100vh" w="full">
        <a className="skip-nav no-print" href="#main">
          Skip to content
        </a>
        <Box position="sticky" top={0} zIndex={40} className="no-print">
          <Header />
        </Box>
        <Box
          as="main"
          id="main"
          tabIndex={-1}
          flex="1"
          position="relative"
          zIndex={1}
          className="print-parent"
          _focus={{ outline: 'none' }}
        >
          {children}
        </Box>
        <Box position="relative" zIndex={1} className="no-print">
          <Footer />
        </Box>
      </Box>
    </ChromeContext.Provider>
  )
}
