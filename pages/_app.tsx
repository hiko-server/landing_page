import React, { useEffect, useState } from 'react'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import localFont from 'next/font/local'
import { ChakraProvider } from '@chakra-ui/react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'

// v6 global design layer (CSS variables, dot grid, helper classes,
// reduced-motion, view transitions, print). Loaded once for the entire app.
import '../styles/globals.css'

import theme from '../theme/chakra'
import * as gtag from '../lib/gtag'
import { pageKeyOf } from '../lib/viewTransition'
import SiteChrome from '../components/Chrome/SiteChrome'
import ThemeColorMeta from '../components/Chrome/ThemeColorMeta'
import { RouteTransitionGate, useRouteViewTransitions } from '../components/Chrome/RouteTransitions'
import { resolveHtmlLang, routeHasChrome } from '../components/Chrome/chrome'
import ScrollToTop from '../components/ScrollToTop/ScrollToTop'
import ScrollProgressBar from '../components/General-UI/ScrollProgressBar'
import { HtmlLangContext } from '../components/Common/htmlLang'
import { RestoreScrollOnMount, useDeferredScrollRestore } from '../components/Common/scrollRestore'
import { ClockProvider } from '../lib/clock'

// v6 typography — self-hosted variable fonts so the build never depends on
// Google Fonts being reachable (some networks throttle / block fonts.gstatic.com,
// which previously caused `next dev` to log AbortError on every boot).
// Inter Variable covers 300-800 in one file; JetBrains Mono Variable covers
// 400-700 in one file.
const sans = localFont({
  src: [
    {
      path: '../public/fonts/InterVariable.woff2',
      style: 'normal',
      weight: '300 800',
    },
    {
      path: '../public/fonts/InterVariable-Italic.woff2',
      style: 'italic',
      weight: '300 800',
    },
  ],
  display: 'swap',
  variable: '--font-geist-sans',
  preload: true,
  fallback: ['system-ui', 'arial'],
})

const mono = localFont({
  src: [
    {
      path: '../public/fonts/JetBrainsMono-Variable.woff2',
      style: 'normal',
      weight: '400 700',
    },
  ],
  display: 'swap',
  variable: '--font-geist-mono',
  preload: true,
  fallback: ['ui-monospace', 'monospace'],
})

// The font variables are defined on :root (not on a wrapper element) so that
// everything Chakra portals to <body> — drawers, the ⌘K palette, menus,
// tooltips, toasts — resolves the same Inter / JetBrains Mono stacks.
const FONT_VARIABLES_CSS = `:root{--font-geist-sans:${sans.style.fontFamily};--font-geist-mono:${mono.style.fontFamily}}`

const App = ({ Component, pageProps, router }: AppProps) => {
  // Animate between *pages* only: a hash / query change (in-page anchors,
  // ?lang=zh, ?tab=cv) must not remount the whole page.
  const pageKey = pageKeyOf(router.asPath)
  const withChrome = routeHasChrome(router.pathname)
  const viewTransitions = useRouteViewTransitions(router.events, pageKey)
  // Back / Forward: Next restores the scroll position (experimental.
  // scrollRestoration). The framer-motion fallback below swaps pages only
  // after the old one has faded out, so the position is re-applied once the
  // new page mounts; with view transitions Next's own restore already lands
  // on the new page (see components/Common/scrollRestore.ts).
  useDeferredScrollRestore(!viewTransitions, pageKey)

  useEffect(() => {
    if (!gtag.GA_TRACKING_ID) return
    router.events.on('routeChangeComplete', gtag.pageview)
    return () => {
      router.events.off('routeChangeComplete', gtag.pageview)
    }
  }, [router.events])

  // <html lang> follows the page's `lang` prop (contract E): _document sets it
  // on the server, this keeps it right across client-side navigations. It is
  // re-applied on every route change (not only when the value differs), and a
  // page whose language changes on the client (the /cv toggle) reports it
  // through HtmlLangContext instead of touching the element itself.
  const [reportedLang, setReportedLang] = useState<string | null>(null)
  const lang = resolveHtmlLang(reportedLang ?? pageProps?.lang)
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang, router.asPath])

  // Browsers with the View Transitions API animate route changes natively
  // (see components/Chrome/RouteTransitions.tsx), so the framer-motion wrapper
  // keeps one stable key there and never runs its exit/enter; elsewhere it is
  // keyed per page and provides the fade. The page element itself is keyed per
  // page in both modes, so navigation remounts it exactly as before.
  const page = (
    <>
      <RouteTransitionGate pageKey={pageKey} />
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={viewTransitions ? 'page' : pageKey}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          {viewTransitions ? null : <RestoreScrollOnMount pageKey={pageKey} />}
          <Component key={pageKey} {...pageProps} />
        </motion.div>
      </AnimatePresence>
    </>
  )

  return (
    <ChakraProvider theme={theme}>
      {/* Every framer-motion animation honours prefers-reduced-motion. */}
      <MotionConfig reducedMotion="user">
        <Head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/images/favicon-32x32.png" />
          <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
          <style key="font-variables" dangerouslySetInnerHTML={{ __html: FONT_VARIABLES_CSS }} />
        </Head>
        <ThemeColorMeta />
        {/* Server-computed reference month (pageProps.clockMonth) so time-based
            text renders identically on the server and while hydrating. */}
        <ClockProvider month={pageProps?.clockMonth}>
          <HtmlLangContext.Provider value={setReportedLang}>
            {withChrome ? <SiteChrome socials={pageProps?.chromeSocials}>{page}</SiteChrome> : page}
          </HtmlLangContext.Provider>
        </ClockProvider>
        <ScrollToTop />
        <ScrollProgressBar />
      </MotionConfig>
    </ChakraProvider>
  )
}

export default App
