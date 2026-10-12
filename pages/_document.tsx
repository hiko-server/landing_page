import Document, { Head, Html, Main, NextScript } from 'next/document'
import React from 'react'
import { ColorModeScript } from '@chakra-ui/react'
import theme from '../theme/chakra'

/**
 * Chakra (emotion) handles its own SSR style extraction, so no custom
 * getInitialProps is needed. The colour-mode script runs before first paint
 * so a stored light / dark preference never flashes the other theme.
 */
class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head />
        <body>
          <ColorModeScript initialColorMode={(theme as any).config?.initialColorMode || 'system'} />
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
