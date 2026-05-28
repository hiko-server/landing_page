import { appWithTranslation } from 'next-i18next'

import React, { useEffect } from 'react'
import { useRouter } from 'next/router'
import localFont from 'next/font/local'
import * as gtag from '../lib/gtag'

// v6 global design layer (CSS variables, dot grid, helper classes,
// reduced-motion, print). Loaded once for the entire app.
import '../styles/globals.css'

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

// using the chakra-ui (styled components)
import { ChakraProvider, CSSReset, ColorModeScript } from '@chakra-ui/react'
import { AnimatePresence, motion } from 'framer-motion'

import { config } from '@fortawesome/fontawesome-svg-core'
import '@fortawesome/fontawesome-svg-core/styles.css'
config.autoAddCss = false

import theme from '../theme/chakra'

import { MainProvider } from '../context/state'
import { SettingsAppProvider } from '../context/settingsState'
import { AuthProvider } from '../context/authState'
import Head from 'next/head';
import ScrollToTop from '../components/ScrollToTop/ScrollToTop'
import ScrollProgressBar from '../components/General-UI/ScrollProgressBar'
import FloatingNav from '../components/General-UI/FloatingNav'

// const queryClient = new QueryClient()

const App = ({ Component, pageProps }: any) => {
  const router = useRouter()
  useEffect(() => {
    const handleRouteChange = (url: any) => {
      gtag.pageview(url)
    }
    router.events.on('routeChangeComplete', handleRouteChange)
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange)
    }
  }, [router.events])
  return (
    <div className={`${sans.variable} ${mono.variable}`} style={{ minHeight: '100%' }}>
      {/* <Provider store={store}>
        <QueryClientProvider client={queryClient}> */}
      <ChakraProvider theme={theme}>
        <AuthProvider>
            <MainProvider>
              <SettingsAppProvider>
                <CSSReset />
                <ColorModeScript initialColorMode={(theme as any).config?.initialColorMode || 'system'} />
                <Head>
                  <meta name="viewport" content="width=device-width, initial-scale=1" />
                  <link rel="icon" href="/images/favicon-32x32.png" />
                </Head>
                <AnimatePresence initial={false} mode="wait">
                  <motion.div
                    key={router.asPath}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Component {...pageProps} />
                  </motion.div>
                </AnimatePresence>
                <ScrollToTop />
                <ScrollProgressBar />
                <FloatingNav />
              </SettingsAppProvider>
            </MainProvider>
        </AuthProvider>
      </ChakraProvider>
      {/* </QueryClientProvider>
      </Provider> */}
    </div>
  )
}

export default appWithTranslation(App)
