import Document, { Head, Html, Main, NextScript } from 'next/document'
import { resolveHtmlLang } from '../components/Chrome/chrome'
import { THEME_COLOR_PREPAINT_SCRIPT } from '../components/Chrome/themeColor'
import { THEME_PREPAINT_SCRIPT, serverColorMode } from '../lib/themePreference'
import { themeColorFor } from '../theme/color'

/**
 * Chakra (emotion) handles its own SSR style extraction, so no custom
 * getInitialProps is needed.
 *
 * Colour mode: the server HTML is mode-agnostic — the body, the chrome and
 * every semantic token (`page.*`) are CSS variables keyed off `data-theme`.
 * THEME_PREPAINT_SCRIPT (lib/themePreference.ts) runs before first paint,
 * reads the visitor's System / Light / Dark preference (localStorage) —
 * resolving System from prefers-color-scheme — and sets `data-theme`,
 * `color-scheme` and `data-theme-preference`, so every visitor gets their
 * mode on the first frame on every route type — including ISR pages, whose
 * cached HTML is shared by everyone and could never be rendered per-visitor
 * from a cookie.
 *
 * `<html lang>` comes from the page's `lang` prop (contract E).
 *
 * `<meta name="theme-color">`: exactly one tag, rendered here with the
 * default mode and corrected to the visitor's mode by an inline script right
 * after the theme script, before first paint (components/Chrome/themeColor.ts).
 */
class MyDocument extends Document {
  render() {
    const lang = resolveHtmlLang(this.props.__NEXT_DATA__?.props?.pageProps?.lang)
    const initialColorMode = serverColorMode()
    return (
      <Html lang={lang}>
        <Head>
          <meta name="theme-color" content={themeColorFor(initialColorMode)} />
        </Head>
        <body>
          <script dangerouslySetInnerHTML={{ __html: THEME_PREPAINT_SCRIPT }} />
          <script dangerouslySetInnerHTML={{ __html: THEME_COLOR_PREPAINT_SCRIPT }} />
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
