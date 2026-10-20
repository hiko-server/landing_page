import { useEffect, useState } from 'react'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import dynamic from 'next/dynamic'
import localFont from 'next/font/local'
import { CacheProvider } from '@emotion/react'
import { AnimatePresence, m } from 'framer-motion'

// v6 global design layer (CSS variables, dot grid, helper classes,
// reduced-motion, view transitions, print). Loaded once for the entire app.
import '../styles/globals.css'

import theme from '../theme/chakra'
import { installWebVitals, useAnalytics } from '../lib/analytics/client'
import { installGoalClicks } from '../lib/analytics/goalBeacon'
import MotionProvider from '../components/Chrome/MotionProvider'
import AppChakraProvider from '../components/Chrome/AppChakraProvider'
import { pageKeyOf } from '../lib/viewTransition'
import SiteChrome from '../components/Chrome/SiteChrome'
import ThemeColorMeta from '../components/Chrome/ThemeColorMeta'
import ThemePreferenceSync from '../components/Chrome/ThemePreferenceSync'
import { themePreferenceManager } from '../lib/themePreference'
import { RouteTransitionGate, useRouteViewTransitions } from '../components/Chrome/RouteTransitions'
import { useFocusMainOnPageChange } from '../components/Chrome/routeFocus'
import { resolveHtmlLang, routeHasChrome } from '../components/Chrome/chrome'
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
// variable fonts so the build never depends on a font CDN. Each face is two
// files under ONE font-family (G3, scripts/subset-fonts.mjs): the Latin core
// and an extension (Latin Extended, Vietnamese, Greek, Cyrillic, symbols),
// told apart by unicode-range, so the browser downloads the extension only
// for a page that has such a character. Exactly two files are preloaded —
// the upright sans and mono Latin cores (~69 KB together); the italic is a
// face of its own that the browser fetches only when italic text renders
// (globals.css maps em / i / cite / [data-italic] to it). The fallback lists
// end with the platforms' Chinese UI fonts so 中文 never lands on a serif
// (CJK is in neither range: it goes straight to them), and the sans fallback
// is metric-adjusted (Arial) to keep CLS at zero. The mono face must not
// fall back to Arial (proportional): it lists installed monospace faces
// metric-matched to Geist Mono first (lib/monoFallback.ts, whose @font-face
// rules are rendered below), so mono labels keep their width when Geist
// Mono swaps in. next/font takes only literal options: the ranges below are
// printed by the script and checked by tests/perf-g3-fonts.test.ts.
const sans = localFont({
  src: [{ path: '../assets/fonts/Geist-Latin.woff2', style: 'normal', weight: '100 900' }],
  variable: '--font-geist-sans',
  display: 'swap',
  preload: true,
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', 'Microsoft YaHei', 'arial'],
  adjustFontFallback: 'Arial',
  declarations: [{ prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2190-2199, U+21B5, U+21E7, U+2212, U+2215, U+2248, U+2260, U+2264-2265, U+FEFF, U+FFFD' }],
})

// The extension faces join their Latin core's font-family (the next/font
// variable name: sans, sansItalic, mono) instead of a family of their own,
// which would sit after the metric-adjusted fallback in the stack.
const sansExt = localFont({
  src: [{ path: '../assets/fonts/Geist-Ext.woff2', style: 'normal', weight: '100 900' }],
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: 'sans' },
    {
      prop: 'unicode-range',
      value:
        'U+0100-0113, U+0116-012B, U+012E-0130, U+0132-0137, U+0139-013E, U+0141-0148, U+014A-014D, U+0150-0151, U+0154-017E, U+018F, U+0192, U+01A0-01A1, U+01AF-01B0, U+01CD-01CE, U+01E4-01E9, U+0218-021B, U+0237, U+0259, U+02B9, U+02C7-02C8, U+02D8-02D9, U+02DB, U+02DD, U+0300-0303, U+0306-0307, U+0309-030C, U+0312, U+031B, U+0323, U+0326-0328, U+0335-0338, U+039B, U+03A9, U+03BB-03BC, U+03C0, U+03C9, U+0400-045F, U+0462-0463, U+046A-046B, U+0472-0475, U+0490-0493, U+0496-0497, U+049A-049B, U+04A2-04A3, U+04AE-04B3, U+04B6-04B7, U+04BA-04BB, U+04C0, U+04CF, U+04D8-04D9, U+04E2-04E3, U+04E8-04E9, U+04EE-04EF, U+0E3F, U+1E20-1E21, U+1E80-1E85, U+1E9E, U+1EA0-1EF9, U+2070, U+2074-2079, U+2080-2089, U+20AA, U+20B1, U+20B4, U+20B9, U+20BD, U+2116-2117, U+2153-2155, U+215B-215E, U+219D, U+21A9-21AA, U+21B0-21B1, U+21B3-21B4, U+21E4-21E5, U+2202, U+2206, U+220F, U+2211, U+221A, U+221E, U+222B, U+2236, U+2460-2468, U+24EA, U+24FF, U+25B2-25B3, U+25B6-25B7, U+25BC-25BD, U+25C0-25C1, U+25CA-25CC, U+25CF, U+2639-263A, U+2776-277E, U+3003, U+301C, U+A78B-A78C, U+F8FF, U+FB01-FB02',
    },
  ],
})

const sansItalic = localFont({
  src: [{ path: '../assets/fonts/Geist-Italic-Latin.woff2', style: 'italic', weight: '100 900' }],
  variable: '--font-geist-sans-italic',
  display: 'swap',
  preload: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2190-2199, U+21B5, U+21E7, U+2212, U+2215, U+2248, U+2260, U+2264-2265, U+FEFF, U+FFFD' }],
})

const sansItalicExt = localFont({
  src: [{ path: '../assets/fonts/Geist-Italic-Ext.woff2', style: 'italic', weight: '100 900' }],
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: 'sansItalic' },
    {
      prop: 'unicode-range',
      value:
        'U+0100-0113, U+0116-012B, U+012E-0130, U+0132-0137, U+0139-013E, U+0141-0148, U+014A-014D, U+0150-0151, U+0154-017E, U+018F, U+0192, U+01A0-01A1, U+01AF-01B0, U+01CD-01CE, U+01E4-01E9, U+0218-021B, U+0237, U+0259, U+02B9, U+02C7-02C8, U+02D8-02D9, U+02DB, U+02DD, U+0300-0303, U+0306-0307, U+0309-030C, U+0312, U+031B, U+0323, U+0326-0328, U+0335-0338, U+039B, U+03A9, U+03BB-03BC, U+03C0, U+03C9, U+0400-045F, U+0462-0463, U+046A-046B, U+0472-0475, U+0490-0493, U+0496-0497, U+049A-049B, U+04A2-04A3, U+04AE-04B3, U+04B6-04B7, U+04BA-04BB, U+04C0, U+04CF, U+04D8-04D9, U+04E2-04E3, U+04E8-04E9, U+04EE-04EF, U+0E3F, U+1E20-1E21, U+1E80-1E85, U+1E9E, U+1EA0-1EF9, U+2070, U+2074-2079, U+2080-2089, U+20AA, U+20B1, U+20B4, U+20B9, U+20BD, U+2116-2117, U+2153-2155, U+215B-215E, U+219D, U+21A9-21AA, U+21B0-21B1, U+21B3-21B4, U+21E4-21E5, U+2202, U+2206, U+220F, U+2211, U+221A, U+221E, U+222B, U+2236, U+2460-2468, U+24EA, U+24FF, U+25B2-25B3, U+25B6-25B7, U+25BC-25BD, U+25C0-25C1, U+25CA-25CC, U+25CF, U+2639-263A, U+2776-277E, U+3003, U+301C, U+A78B-A78C, U+F8FF, U+FB01-FB02',
    },
  ],
})

const mono = localFont({
  src: [{ path: '../assets/fonts/GeistMono-Latin.woff2', style: 'normal', weight: '100 900' }],
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
  declarations: [{ prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2190-2199, U+21B5, U+21E7, U+2212, U+2215, U+2248, U+2260, U+2264-2265, U+FEFF, U+FFFD' }],
})

const monoExt = localFont({
  src: [{ path: '../assets/fonts/GeistMono-Ext.woff2', style: 'normal', weight: '100 900' }],
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: 'mono' },
    {
      prop: 'unicode-range',
      value:
        'U+0100-0113, U+0116-012B, U+012E-0130, U+0134-0137, U+0139-013E, U+0141-0148, U+014A-014D, U+0150-0151, U+0154-017E, U+018F, U+0192, U+01A0-01A1, U+01AF-01B0, U+01CD-01CE, U+01E4-01E9, U+0218-021B, U+0237, U+0259, U+02B9, U+02C7-02C8, U+02D8-02D9, U+02DB, U+02DD, U+0300-0303, U+0306-0307, U+0309-030C, U+0312, U+031B, U+0323, U+0326-0328, U+0335-0338, U+039B, U+03A9, U+03BB-03BC, U+03C0, U+0400-045F, U+0462-0463, U+046A-046B, U+0472-0475, U+0490-0493, U+0496-0497, U+049A-049B, U+04A2-04A3, U+04AE-04B3, U+04B6-04B7, U+04BA-04BB, U+04C0, U+04CF, U+04D8-04D9, U+04E2-04E3, U+04E8-04E9, U+04EE-04EF, U+0E3F, U+1E20-1E21, U+1E80-1E85, U+1E9E, U+1EA0-1EF9, U+2070, U+2074-2079, U+2080-2089, U+20AA, U+20B1, U+20B4, U+20B9, U+20BD, U+2107, U+2116-2117, U+2153-2155, U+215B-215E, U+219D, U+21A9-21AA, U+21B0-21B1, U+21B3-21B4, U+21E4-21E5, U+2202, U+2206, U+220F, U+2211, U+221A, U+221E, U+222B, U+2236, U+2326-2327, U+232B, U+23CE, U+240B-240C, U+2423, U+2460-2468, U+24EA, U+24FF-259F, U+25B2-25B3, U+25B6-25B7, U+25BC-25BD, U+25C0-25C1, U+25CA-25CC, U+25CF, U+2776-277E, U+3003, U+301C, U+A78B-A78C, U+F8FF',
    },
  ],
})

// Each extension face must share its Latin core's font-family (see above);
// a mismatch would silently send those characters to the fallback fonts.
for (const [core, ext] of [
  [sans, sansExt],
  [sansItalic, sansItalicExt],
  [mono, monoExt],
]) {
  const family = (font: { style: { fontFamily: string } }) => font.style.fontFamily.split(',')[0].trim()
  if (family(core) !== family(ext)) console.error(`[fonts] ${family(ext)} must use the font-family of ${family(core)}`)
}

// The font variables are defined on :root (not on a wrapper element) so that
// everything Chakra portals to <body> — drawers, the ⌘K palette, menus,
// tooltips, toasts — resolves the same Geist stacks.
// `--font-geist-sans-face`: Geist and its metric fallback without the
// platform list (which starts at the `fallback` array's system-ui), so
// Traditional Chinese text can put the TC faces before the SC ones
// (styles/globals.css, Chinese typesetting).
const FONT_VARIABLES_CSS = `${monoFallbackFontFaces()}:root{--font-geist-sans:${sans.style.fontFamily};--font-geist-sans-face:${sans.style.fontFamily.replace(/,\s*system-ui.*$/, '')};--font-geist-sans-italic:${sansItalic.style.fontFamily};--font-geist-mono:${mono.style.fontFamily}}`

// Non-critical chrome: the back-to-top button (hidden until the visitor has
// scrolled) and the reading-progress hairline are fixed overlays that render
// nothing on the first frame, so they load after hydration in chunks of
// their own instead of the shared bundle.
const ScrollToTop = dynamic(() => import('../components/ScrollToTop/ScrollToTop'), { ssr: false, loading: () => null })
const ScrollProgressBar = dynamic(() => import('../components/General-UI/ScrollProgressBar'), { ssr: false, loading: () => null })

// /admin routes: the app theme plus the component styles only the admin uses
// (theme/adminComponents.ts), loaded with the admin pages, never on public ones.
const AdminThemeScope = dynamic(() => import('../components/Admin/AdminThemeScope'))

// The framer-motion page fade (browsers without view transitions): the
// standard ease and duration (theme/tokens.ts); MotionConfig below drops the
// movement under reduced motion.
const PAGE_TRANSITION = motionTransition('base')

// Every toast: the elevated v6 Alert (theme/chakra.js), bottom centre, with a
// close button, timed by one policy (lib/notify via components/Common/
// UnifiedToast): successes and notes stay long enough to read, errors until
// dismissed; the timer pauses on hover, focus and while the tab is hidden.
// The toast component loads with the first toast, never in the first-load JS (perf budget: pages/_app).
const UnifiedToast = dynamic(() => import('../components/Common/UnifiedToast'), { ssr: false, loading: () => null })

const TOAST_OPTIONS = {
  defaultOptions: { variant: 'v6', position: 'bottom', isClosable: true },
  component: UnifiedToast,
} as const

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

  // Cookieless first-party page views (lib/analytics/client.ts), and real
  // Core Web Vitals with their attribution: the web-vitals observers load in
  // a chunk of their own as the app hydrates (not in the shared bundle) and
  // attach once.
  useAnalytics(router)
  useEffect(() => installWebVitals(), [])

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

  // Goal events: e-mail and outbound link clicks (lib/analytics/goalBeacon).
  useEffect(() => installGoalClicks(), [])

  // Browsers with the View Transitions API animate route changes natively
  // (see components/Chrome/RouteTransitions.tsx), so the framer-motion wrapper
  // keeps one stable key there and never runs its exit/enter; elsewhere it is
  // keyed per page and provides the fade. The page element itself is keyed per
  // page in both modes, so navigation remounts it exactly as before.
  const routed = (
    <>
      <RouteTransitionGate pageKey={pageKey} />
      <AnimatePresence initial={false} mode="wait">
        <m.div
          key={viewTransitions ? 'page' : pageKey}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={PAGE_TRANSITION}
        >
          {viewTransitions ? null : <RestoreScrollOnMount pageKey={pageKey} />}
          <Component key={pageKey} {...pageProps} />
        </m.div>
      </AnimatePresence>
    </>
  )
  const page = router.pathname.startsWith('/admin') ? <AdminThemeScope>{routed}</AdminThemeScope> : routed

  return (
    // The colour mode follows the visitor's System / Light / Dark preference
    // (lib/themePreference.ts; applied before first paint by pages/_document).
    // AppChakraProvider is ChakraProvider with its toast host loaded on demand.
    <AppChakraProvider theme={theme} toastOptions={TOAST_OPTIONS} colorModeManager={themePreferenceManager}>
      {/* framer-motion: `m` elements, features loaded on demand, reduced motion honoured. */}
      <MotionProvider>
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
      </MotionProvider>
    </AppChakraProvider>
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
