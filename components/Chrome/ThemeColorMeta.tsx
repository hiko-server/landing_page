import Head from 'next/head'
import { useColorMode } from '@chakra-ui/react'
import { themeColorFor } from '../../theme/color'

/**
 * Browser-UI colour (mobile address bar, PWA title bar) that follows the
 * active colour mode. The explicit `key` keeps next/head from collapsing it
 * into a page-level theme-color tag, and as the earlier tag in <head> it is
 * the one browsers apply.
 */
export default function ThemeColorMeta() {
  const { colorMode } = useColorMode()
  return (
    <Head>
      <meta key="theme-color-mode" name="theme-color" content={themeColorFor(colorMode)} />
    </Head>
  )
}
