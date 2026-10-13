import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box } from '@chakra-ui/react'
import Header from '../Header/Header'
import Footer from '../Footer/Footer'
import { ChromeContext } from './ChromeContext'
import { resolveSocialLinks } from './chrome'

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
 *
 * Profile links (header drawer, footer) come from the public home.socials:
 * `socials` is what the current page shipped (`pageProps.chromeSocials`;
 * null = the home document has no socials, which is an answer — nothing is
 * fetched). Only when the first page rendered did not ship it at all
 * (undefined) is the public /api/home view read once after mount. The last
 * known value is kept across navigations to pages that do not ship it.
 */

/** undefined = this page did not ship the value; null = the home document has none. */
type SocialsInput = Record<string, unknown> | null | undefined

export default function SiteChrome({ children, socials }: { children: React.ReactNode; socials?: SocialsInput }) {
  const [known, setKnown] = useState<SocialsInput>(socials)
  const fetchOnMount = useRef(socials === undefined)

  useEffect(() => {
    if (socials !== undefined) setKnown(socials)
  }, [socials])

  useEffect(() => {
    if (!fetchOnMount.current) return
    let alive = true
    fetch('/api/home')
      .then((r) => (r.ok ? (r.json() as Promise<{ socials?: unknown } | null>) : Promise.reject(new Error(String(r.status)))))
      .then((home) => {
        if (!alive) return
        const value = home && typeof home.socials === 'object' && !Array.isArray(home.socials) ? (home.socials as Record<string, unknown>) : null
        // A page that shipped its own value in the meantime wins.
        setKnown((prev) => (prev === undefined ? value : prev))
      })
      .catch(() => {
        // Best effort: the built-in links stay.
      })
    return () => {
      alive = false
    }
  }, [])

  const effective = socials !== undefined ? socials : known
  const links = useMemo(() => resolveSocialLinks(effective), [effective])

  return (
    <ChromeContext.Provider value>
      <Box display="flex" flexDirection="column" minHeight="100vh" w="full">
        <a className="skip-nav no-print" href="#main">
          Skip to content
        </a>
        {/* Its own view-transition snapshot: the header stays pinned while
            route transitions slide / fade the page beneath it (globals.css). */}
        <Box position="sticky" top={0} zIndex={40} className="no-print" style={{ viewTransitionName: 'site-header' }}>
          <Header socials={links} />
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
          <Footer socials={links} />
        </Box>
      </Box>
    </ChromeContext.Provider>
  )
}
