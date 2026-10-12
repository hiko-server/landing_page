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

import { ChakraProvider } from '@chakra-ui/react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import Head from 'next/head'

import theme from '../theme/chakra'
import ScrollToTop from '../components/ScrollToTop/ScrollToTop'
import ScrollProgressBar from '../components/General-UI/ScrollProgressBar'

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
  // Animate between *pages* only: a hash / query change (in-page anchors,
  // ?lang=zh, ?tab=cv) must not remount the whole page.
  const pageKey = router.asPath.split(/[?#]/)[0]

  return (
    <div className={`${sans.variable} ${mono.variable}`} style={{ minHeight: '100%' }}>
      <ChakraProvider theme={theme}>
        {/* Every framer-motion animation honours prefers-reduced-motion. */}
        <MotionConfig reducedMotion="user">
          <Head>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <link rel="icon" href="/images/favicon-32x32.png" />
          </Head>
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={pageKey}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <Component {...pageProps} />
            </motion.div>
          </AnimatePresence>
          <ScrollToTop />
          <ScrollProgressBar />
        </MotionConfig>
      </ChakraProvider>
    </div>
  )
}

export default App
