import { appWithTranslation } from 'next-i18next'

import React, { useEffect } from 'react'
import Script from 'next/script'
import { useRouter } from 'next/router'
import * as gtag from '../lib/gtag'

// using the tailwind css
// import '../styles/globals.css'

//using sass
// import '../styles/globals.scss'

//using the chakra-ui (styled components)
import { ChakraProvider, CSSReset } from '@chakra-ui/react'

import { config } from '@fortawesome/fontawesome-svg-core'
import '@fortawesome/fontawesome-svg-core/styles.css'
config.autoAddCss = false

import theme from '../theme/chakra'

import { SessionProvider } from 'next-auth/react'
import { MainProvider } from '../context/state'
import { SettingsAppProvider } from '../context/settingsState'
import { AuthProvider } from '../context/authState'

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
      {/* Global Site Tag (gtag.js) - Google Analytics */}
      <Script
        id="set-gtagID"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${gtag.GA_TRACKING_ID}`}
      />
      <Script
        id="update-gtag"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${gtag.GA_TRACKING_ID}', {
              page_path: window.location.pathname,
            });
          `,
        }}
      />
      <Script src="https://accounts.google.com/gsi/client"></Script>

      {/* <Provider store={store}>
        <QueryClientProvider client={queryClient}> */}
      <SessionProvider>
        <ChakraProvider theme={theme}>
          <AuthProvider>
            <MainProvider>
              <SettingsAppProvider>
                <CSSReset />
                <Component {...pageProps} />
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
