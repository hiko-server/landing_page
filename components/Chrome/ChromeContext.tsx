import { createContext, useContext } from 'react'

/**
 * True below a <SiteChrome>: the header/footer are already on screen, so
 * layout/HeaderFooter.tsx renders its children only (exactly one header and
 * footer per page, whether the chrome comes from _app or from the page).
 */
export const ChromeContext = createContext(false)

export function useChromeProvided(): boolean {
  return useContext(ChromeContext)
}
