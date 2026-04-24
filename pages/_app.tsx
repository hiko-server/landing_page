import { appWithTranslation } from 'next-i18next'

import React, { useEffect } from 'react'
import { useRouter } from 'next/router'
import * as gtag from '../lib/gtag'

// using the tailwind css
// import '../styles/globals.css'

//using sass
// import '../styles/globals.scss'

//using the chakra-ui (styled components)
import { ChakraProvider, CSSReset, ColorModeScript } from '@chakra-ui/react'
import { AnimatePresence, motion } from 'framer-motion'

import { config } from '@fortawesome/fontawesome-svg-core'
import '@fortawesome/fontawesome-svg-core/styles.css'
config.autoAddCss = false

import theme from '../theme/chakra'

import { SessionProvider } from 'next-auth/react'
import { MainProvider } from '../context/state'
import { SettingsAppProvider } from '../context/settingsState'
import { AuthProvider } from '../context/authState'
import Head from 'next/head';
import ScrollToTop from '../components/ScrollToTop/ScrollToTop'
import ScrollProgressBar from '../components/General-UI/ScrollProgressBar'

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
    <React.Fragment>

      {/* <Provider store={store}>
        <QueryClientProvider client={queryClient}> */}
      <SessionProvider>
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
              </SettingsAppProvider>
            </MainProvider>
          </AuthProvider>
        </ChakraProvider>
      </SessionProvider>
      {/* </QueryClientProvider>
      </Provider> */}
    </React.Fragment>
  )
}

export default appWithTranslation(App)
