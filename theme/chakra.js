import { extendTheme } from '@chakra-ui/react'

// 2. Extend the theme to include custom colors, fonts, etc
const colors = {
  brand: {
    900: '#1a365d',
    800: '#153e75',
    700: '#2a69ac',
  },
}

const theme = {
  ...extendTheme({
    colors,
    config: {
      initialColorMode: 'system',
      useSystemColorMode: true,
    },
    styles: {
      global: ({ colorMode }) => ({
        '*, *::before, *::after': { boxSizing: 'border-box' },
        'html, body, #__next': { height: '100%' },
        body: {
          bg: colorMode === 'dark' ? 'gray.900' : 'gray.50',
          color: colorMode === 'dark' ? 'gray.100' : 'gray.800',
          maxWidth: '100vw',
          overflowX: 'hidden',
        },
        // Media elements scale within containers
        'img, video': { maxWidth: '100%', height: 'auto' },
        // Long code blocks and inline code should wrap on mobile
        pre: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
        code: { whiteSpace: 'pre-wrap' },
        // Tables should not force horizontal scrolling on the page
        table: { width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' },
      }),
    },
  }),
}

export default theme
