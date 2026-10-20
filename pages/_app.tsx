import { useEffect, useState } from 'react'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import localFont from 'next/font/local'
import { ChakraProvider } from '@chakra-ui/react'
import { CacheProvider } from '@emotion/react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'

// v6 global design layer (CSS variables, dot grid, helper classes,
// reduced-motion, view transitions, print). Loaded once for the entire app.
import '../styles/globals.css'

import theme from '../theme/chakra'
import { useReportWebVitals } from 'next/web-vitals'
import { reportWebVital, useAnalytics } from '../lib/analytics/client'
import { pageKeyOf } from '../lib/viewTransition'
import SiteChrome from '../components/Chrome/SiteChrome'
import ThemeColorMeta from '../components/Chrome/ThemeColorMeta'
import ThemePreferenceSync from '../components/Chrome/ThemePreferenceSync'
import { themePreferenceManager } from '../lib/themePreference'
import { RouteTransitionGate, useRouteViewTransitions } from '../components/Chrome/RouteTransitions'
import { useFocusMainOnPageChange } from '../components/Chrome/routeFocus'
import { resolveHtmlLang, routeHasChrome } from '../components/Chrome/chrome'
import ScrollToTop from '../components/ScrollToTop/ScrollToTop'
import ScrollProgressBar from '../components/General-UI/ScrollProgressBar'
import { HtmlLangContext } from '../components/Common/htmlLang'
import { ChromeLangContext, chromeLangFor } from '../components/Chrome/chromeLang'
import { monoFallbackFontFaces } from '../lib/monoFallback'
import { installPrintDetails } from '../lib/print'
import { installErrorCapture } from '../lib/errors/capture'
import { RestoreScrollOnMount, useDeferredScrollRestore } from '../components/Common/scrollRestore'
import { ClockProvider } from '../lib/clock'
import { motionTransition } from '../theme/tokens'
import { createSiteEmotionCache } from '../lib/hoverMedia'

// v6 typography — Geist (SIL OFL, public/fonts/OFL-Geist.txt), self-hosted
// variable fonts so the build never depends on a font CDN. Exactly two files
// are preloaded (upright sans + mono, ~140 KB together); the italic is its
// own variable file that the browser fetches only when italic text renders
// (globals.css maps em / i / cite / [data-italic] to it). The fallback lists
// end with the platforms' Chinese UI fonts so 中文 never lands on a serif,
// and the sans fallback is metric-adjusted (Arial) to keep CLS at zero. The
// mono face must not fall back to Arial (proportional): it lists installed
// monospace faces metric-matched to Geist Mono first (lib/monoFallback.ts,
// whose @font-face rules are rendered below), so mono labels keep their
// width when Geist Mono swaps in.
const sans = localFont({
  src: [{ path: '../public/fonts/Geist-Variable.woff2', style: 'normal', weight: '100 900' }],
  variable: '--font-geist-sans',
  display: 'swap',
  preload: true,
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', 'Microsoft YaHei', 'arial'],
  adjustFontFallback: 'Arial',
})

const sansItalic = localFont({
  src: [{ path: '../public/fonts/Geist-Italic-Variable.woff2', style: 'italic', weight: '100 900' }],
  variable: '--font-geist-sans-italic',
  display: 'swap',
  preload: false,
})

const mono = localFont({
  src: [{ path: '../public/fonts/GeistMono-Variable.woff2', style: 'normal', weight: '100 900' }],
  variable: '--font-geist-mono',
  display: 'swap',
  preload: true,
  fallback: [
    'Geist Mono Fallback Menlo',
    'Geist Mono Fallback Consolas',
    'Geist Mono Fallback Courier',
    'ui-monospace',
    'SF Mono',
    'Consolas',
    'monospace',
  ],
  adjustFontFallback: false,
})

// The font variables are defined on :root (not on a wrapper element) so that
// everything Chakra portals to <body> — drawers, the ⌘K palette, menus,
// tooltips, toasts — resolves the same Geist stacks.
const FONT_VARIABLES_CSS = `${monoFallbackFontFaces()}:root{--font-geist-sans:${sans.style.fontFamily};--font-geist-sans-italic:${sansItalic.style.fontFamily};--font-geist-mono:${mono.style.fontFamily}}`

// The framer-motion page fade (browsers without view transitions): the
// standard ease and duration (theme/tokens.ts); MotionConfig below drops the
// movement under reduced motion.
const PAGE_TRANSITION = motionTransition('base')

// Every toast: the elevated v6 Alert (theme/chakra.js), bottom centre, short.
const TOAST_OPTIONS = { defaultOptions: { variant: 'v6', position: 'bottom', duration: 2000, isClosable: true } } as const

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
  // After a page change, keyboard focus starts in the new page's <main>
  // instead of staying on the header link (components/Chrome/routeFocus.ts).
  useFocusMainOnPageChange(router.events, pageKey)

  // Cookieless first-party page views and real Core Web Vitals from
  // visitors' browsers (lib/analytics/client.ts). reportWebVital is defined
  // at module level, so the web-vitals observers are attached exactly once.
  useAnalytics(router)
  useReportWebVitals(reportWebVital)

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
  // The English chrome is marked lang="en" whenever the page is not English.
  const chromeLang = chromeLangFor(lang)

  // Printing: closed <details> are opened for the print, then closed again.
  useEffect(() => installPrintDetails(window), [])

  // First-party error monitor: uncaught errors and unhandled rejections are
  // reported to /api/e (the reporter loads only once something fails).
  useEffect(() => installErrorCapture(), [])

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
          transition={PAGE_TRANSITION}
        >
          {viewTransitions ? null : <RestoreScrollOnMount pageKey={pageKey} />}
          <Component key={pageKey} {...pageProps} />
        </motion.div>
      </AnimatePresence>
    </>
  )

  return (
    // The colour mode follows the visitor's System / Light / Dark preference
    // (lib/themePreference.ts; applied before first paint by pages/_document).
    <ChakraProvider theme={theme} toastOptions={TOAST_OPTIONS} colorModeManager={themePreferenceManager}>
      {/* Every framer-motion animation honours prefers-reduced-motion. */}
      <MotionConfig reducedMotion="user">
        <Head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          {/* The one icon set, site-wide (pages never add their own), all
              rendered from the "LY" mark (lib/brandMark.ts, scripts/build-icons.mjs):
              the SVG follows the browser's colour scheme; the ICO is the
              fallback for browsers without SVG favicons (its sizes keep
              Chromium on the SVG). */}
          <link rel="icon" href="/favicon.ico" sizes="32x32" />
          <link rel="icon" type="image/svg+xml" href="/icon.svg" />
          <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
          <style key="font-variables" dangerouslySetInnerHTML={{ __html: FONT_VARIABLES_CSS }} />
        </Head>
        <ThemeColorMeta />
        <ThemePreferenceSync />
        {/* Server-computed reference month (pageProps.clockMonth) so time-based
            text renders identically on the server and while hydrating. */}
        <ChromeLangContext.Provider value={chromeLang}>
          <ClockProvider month={pageProps?.clockMonth}>
            <HtmlLangContext.Provider value={setReportedLang}>
              {withChrome ? (
                <SiteChrome socials={pageProps?.chromeSocials} publications={pageProps?.chromePublications}>
                  {page}
                </SiteChrome>
              ) : (
                page
              )}
            </HtmlLangContext.Provider>
          </ClockProvider>
          <ScrollToTop />
          <ScrollProgressBar />
        </ChromeLangContext.Provider>
      </MotionConfig>
    </ChakraProvider>
  )
}

/**
 * The site's Emotion cache around everything Chakra renders: hover styles
 * apply only where a pointer can hover (lib/hoverMedia.ts). One cache per
 * server render, one for the browser's lifetime.
 */
const SiteApp = (props: AppProps) => {
  const [emotionCache] = useState(createSiteEmotionCache)
  return (
    <CacheProvider value={emotionCache}>
      <App {...props} />
    </CacheProvider>
  )
}

export default SiteApp
