import React from 'react'
import SiteChrome from '../components/Chrome/SiteChrome'
import { useChromeProvided } from '../components/Chrome/ChromeContext'

/**
 * Page-level chrome wrapper, kept for every existing page (contract G).
 *
 * pages/_app.tsx renders the persistent <SiteChrome> around the page outlet on
 * chrome routes, so here this is a lightweight pass-through and the page shows
 * exactly one header and footer. Rendered anywhere without that provider (a
 * chrome-less route, an isolated render), it draws the full chrome itself.
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
  const chromeProvided = useChromeProvided()
  if (chromeProvided) return <>{children}</>
  return <SiteChrome>{children}</SiteChrome>
}

export default HeaderFooter
