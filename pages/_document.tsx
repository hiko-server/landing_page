import Document, { Head, Html, Main, NextScript } from 'next/document'
import React from 'react'
import { ColorModeScript } from '@chakra-ui/react'
import theme from '../theme/chakra'
import { resolveHtmlLang } from '../components/Chrome/chrome'
import { THEME_COLOR_PREPAINT_SCRIPT } from '../components/Chrome/themeColor'
import { themeColorFor } from '../theme/color'

/**
 * Chakra (emotion) handles its own SSR style extraction, so no custom
 * getInitialProps is needed.
 *
 * Colour mode: the server HTML is mode-agnostic — the body, the chrome and
 * every semantic token (`page.*`) are CSS variables keyed off `data-theme`.
 * ColorModeScript runs before first paint, reads the visitor's stored choice
 * (localStorage, where returning visitors' preference already lives) and sets
 * `data-theme` + `color-scheme`, so a light-mode visitor gets the light page
 * on the first frame on every route type — including ISR pages, whose cached
 * HTML is shared by everyone and could never be rendered per-visitor from a
 * cookie.
 *
 * `<html lang>` comes from the page's `lang` prop (contract E).
 *
 * `<meta name="theme-color">`: exactly one tag, rendered here with the dark
 * default and corrected to the stored mode by an inline script right after
 * ColorModeScript, before first paint (components/Chrome/themeColor.ts).
 */
class MyDocument extends Document {
  render() {
    const lang = resolveHtmlLang(this.props.__NEXT_DATA__?.props?.pageProps?.lang)
    const initialColorMode = theme.config?.initialColorMode === 'light' ? 'light' : 'dark'
    return (
      <Html lang={lang}>
        <Head>
          <meta name="theme-color" content={themeColorFor(initialColorMode)} />
        </Head>
        <body>
          <ColorModeScript initialColorMode={initialColorMode} />
          <script dangerouslySetInnerHTML={{ __html: THEME_COLOR_PREPAINT_SCRIPT }} />
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
