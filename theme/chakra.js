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
        'html, body, #__next': { height: '100%' },
        body: {
          bg: colorMode === 'dark' ? 'gray.900' : 'gray.50',
        },
      }),
    },
  }),
}

export default theme
