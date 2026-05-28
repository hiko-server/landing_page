import { extendTheme } from '@chakra-ui/react'

/**
 * v6 "Indigo Precision" theme.
 *
 * Locked design tokens:
 *   bg:     #050505 (dark) / #fdfdfd (light)
 *   fg:     #fafafa (dark) / #0a0a0a (light)
 *   accent: #6366f1 (indigo-500) — single brand color, no gradients
 *   font:   Geist Sans (display + body) + Geist Mono (labels/code)
 *   grid:   8px base, 1100px max content width
 *   easing: cubic-bezier(0.22, 1, 0.36, 1) (use --ease-out-quart from globals.css)
 *
 * Older brand.* colors are kept for backward compatibility with components
 * that still reference them; new code should use semantic tokens ('page.bg',
 * 'page.fg', 'page.muted', 'page.border', 'page.surface', 'accent.500').
 */

const colors = {
  // Legacy (kept so existing components don't break visually mid-refactor)
  brand: {
    900: '#1a365d',
    800: '#153e75',
    700: '#2a69ac',
  },

  // v6 ink scale — neutral grayscale tuned for OLED + paper-white extremes
  ink: {
    0: '#050505',
    50: '#0a0a0a',
    100: '#0e0e0e',
    200: '#181818',
    300: '#262626',
    400: '#404040',
    500: '#525252',
    600: '#737373',
    700: '#a1a1a1',
    800: '#d4d4d4',
    900: '#fafafa',
    1000: '#fdfdfd',
  },

  // v6 single brand accent — Tailwind indigo scale for `accent.500` -> #6366f1
  accent: {
    50: '#eef2ff',
    100: '#e0e7ff',
    200: '#c7d2fe',
    300: '#a5b4fc',
    400: '#818cf8',
    500: '#6366f1',
    600: '#4f46e5',
    700: '#4338ca',
    800: '#3730a3',
    900: '#312e81',
  },
}

const fonts = {
  heading: 'var(--font-geist-sans), Inter, ui-sans-serif, system-ui, sans-serif',
  body: 'var(--font-geist-sans), Inter, ui-sans-serif, system-ui, sans-serif',
  mono: 'var(--font-geist-mono), ui-monospace, "SF Mono", Consolas, monospace',
}

const semanticTokens = {
  colors: {
    'page.bg': { default: '#fdfdfd', _dark: '#050505' },
    'page.bg-elevated': { default: '#f5f5f5', _dark: '#161616' },
    'page.bg-overlay': { default: '#ededed', _dark: '#1a1a1a' },
    'page.fg': { default: '#0a0a0a', _dark: '#fafafa' },
    'page.fg-secondary': { default: '#525252', _dark: '#a1a1a1' },
    'page.muted': { default: '#a1a1a1', _dark: '#525252' },
    'page.border': { default: 'rgba(0,0,0,0.08)', _dark: 'rgba(255,255,255,0.10)' },
    'page.border-strong': { default: 'rgba(0,0,0,0.16)', _dark: 'rgba(255,255,255,0.20)' },
    'page.surface': { default: 'rgba(255,255,255,0.7)', _dark: 'rgba(22,22,22,0.7)' },
    'accent.fg': { default: 'white', _dark: 'white' },
  },
}

const theme = {
  ...extendTheme({
    colors,
    fonts,
    semanticTokens,
    config: {
      // v6 is dark-first; light remains available via toggle
      initialColorMode: 'dark',
      useSystemColorMode: false,
    },
    styles: {
      global: ({ colorMode }) => ({
        '*, *::before, *::after': { boxSizing: 'border-box' },
        'html, body, #__next': { height: '100%' },
        body: {
          bg: colorMode === 'dark' ? '#050505' : '#fdfdfd',
          color: colorMode === 'dark' ? '#fafafa' : '#0a0a0a',
          fontFamily:
            'var(--font-geist-sans), Inter, ui-sans-serif, system-ui, sans-serif',
          fontFeatureSettings: '"ss01", "ss02", "cv11"',
          letterSpacing: 0,
          maxWidth: '100vw',
          overflowX: 'hidden',
          // 8×8 dot grid signature background. The dot color flips with theme
          // via the CSS variable defined in styles/globals.css.
          backgroundImage:
            'radial-gradient(circle at center, var(--dot-color, rgba(0,0,0,0.05)) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
          WebkitFontSmoothing: 'antialiased',
        },
        // Media elements scale within containers
        'img, video': { maxWidth: '100%', height: 'auto' },
        // Long code blocks and inline code should wrap on mobile
        pre: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
        code: { whiteSpace: 'pre-wrap', fontFamily: 'var(--font-geist-mono), monospace' },
        // Tables behave naturally inside their container
        table: { width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' },
        // Selection uses the brand accent
        '::selection': {
          background: '#6366f1',
          color: 'white',
        },
      }),
    },
  }),
}

export default theme
