import { extendTheme } from '@chakra-ui/react'
import { semanticColors } from './color'

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

// Semantic tokens compile to CSS variables keyed off `data-theme` (set by the
// pre-paint colour-mode script in pages/_document.tsx), so anything styled
// with them is correct on the first paint for light AND dark visitors — unlike
// useColorModeValue, which can only resolve after hydration. Values live in
// theme/color.ts (contrast-tested).
const semanticTokens = {
  colors: Object.fromEntries(
    Object.entries(semanticColors).map(([name, { light, dark }]) => [name, { default: light, _dark: dark }]),
  ),
}

const theme = {
  ...extendTheme({
    colors,
    fonts,
    semanticTokens,
    config: {
      // Deliberate: v6 is dark-first. A first-time visitor always gets the
      // brand's dark look (no system-preference switch); an explicit toggle is
      // remembered (localStorage, applied before first paint by the
      // ColorModeScript in pages/_document.tsx).
      initialColorMode: 'dark',
      useSystemColorMode: false,
    },
    styles: {
      global: {
        '*, *::before, *::after': { boxSizing: 'border-box' },
        'html, body, #__next': { height: '100%' },
        body: {
          // Token (CSS variable) colours, not colorMode branches: the server
          // renders one stylesheet for everyone, and data-theme picks the
          // right values before paint — no dark flash for light-mode visitors.
          bg: 'page.bg',
          color: 'page.fg',
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
      },
    },
  }),
}

export default theme
