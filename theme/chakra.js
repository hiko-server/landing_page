import { extendTheme } from '@chakra-ui/react'
import { semanticColors } from './color'

/**
 * v6 "Indigo Precision" theme.
 *
 * Locked design tokens:
 *   bg:     #050505 (dark) / #fdfdfd (light)
 *   fg:     #fafafa (dark) / #0a0a0a (light)
 *   accent: #6366f1 (indigo-500) — single brand color, no gradients; small
 *           text uses 'accent.text' and filled buttons 'accent.solid'
 *           (contrast-safe shades of the same indigo, see theme/color.ts)
 *   font:   Geist Sans (display + body, variable 100–900, separate variable
 *           italic face that only downloads where italic text renders) + Geist
 *           Mono (labels/code), self-hosted via next/font/local in pages/_app.tsx
 *           (SIL OFL, public/fonts/OFL-Geist.txt). CJK text falls through to the
 *           platform's Chinese UI fonts listed after the variables below.
 *   focus:  one global 2px var(--accent) focus-visible ring; buttons press to
 *           0.97 scale; toasts use the elevated `v6` Alert variant
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

// After the next/font variables: the platform UI fonts, then the Chinese UI
// fonts of each platform, so 中文 text never falls back to a serif.
const CJK_FALLBACKS = '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei"'
const SANS_STACK = `var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, "Segoe UI", ${CJK_FALLBACKS}, sans-serif`

const fonts = {
  heading: SANS_STACK,
  body: SANS_STACK,
  mono: `var(--font-geist-mono), ui-monospace, "SF Mono", Consolas, ${CJK_FALLBACKS}, monospace`,
}

// Chakra's default focus shadow is blue; components that still use the
// `outline` shadow (checkbox, switch, tabs, close buttons…) get the accent.
const shadows = {
  outline: '0 0 0 2px var(--accent)',
}

/** The site-wide keyboard focus ring (also the global *:focus-visible rule below). */
const FOCUS_RING = {
  outline: '2px solid var(--accent)',
  outlineOffset: '2px',
  boxShadow: 'none',
}

/** Left status bar of the `v6` Alert (toasts): the accent for good news, warm colours for problems. */
const ALERT_BAR = {
  success: 'var(--accent)',
  info: 'var(--accent)',
  loading: 'var(--accent)',
  warning: 'orange.400',
  error: 'red.400',
}

const components = {
  Button: {
    baseStyle: {
      transitionProperty: 'common',
      transitionDuration: '160ms',
      transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
      // Press feedback (zeroed by the global reduced-motion rule). Drag
      // handles opt out with _active={{ transform: 'none' }}.
      _active: { transform: 'scale(0.97)' },
      // Chakra's Button/Link reset `outline: none` with a class selector,
      // which beats the global *:focus-visible rule; restore the same ring
      // here (and drop the `outline` shadow so it is not a double ring).
      _focusVisible: { ...FOCUS_RING },
    },
  },
  Link: {
    baseStyle: {
      _focusVisible: { ...FOCUS_RING },
    },
  },
  Alert: {
    variants: {
      // Elevated surface + hairline border + a 3px status bar on the left;
      // mono uppercase title. Used by every toast (see toastOptions in _app).
      v6: (props) => {
        const bar = ALERT_BAR[props.status] || ALERT_BAR.info
        return {
          container: {
            bg: 'page.bg-elevated',
            color: 'page.fg',
            border: '1px solid',
            borderColor: 'page.border',
            borderRadius: 'md',
            borderInlineStartWidth: '3px',
            borderInlineStartColor: bar,
          },
          icon: { color: bar },
          spinner: { color: bar },
          title: {
            fontFamily: 'mono',
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            lineHeight: '6',
          },
          description: {
            fontSize: '14px',
            color: 'page.fg',
          },
        }
      },
    },
  },
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
    shadows,
    components,
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
          fontFamily: SANS_STACK,
          fontFeatureSettings: '"ss01", "ss02", "cv11"',
          letterSpacing: 0,
          maxWidth: '100vw',
          // clip (not hidden): never a scroll container, so view-timelines track the viewport.
          overflowX: 'clip',
          // 8×8 dot grid signature background. The dot color flips with theme
          // via the CSS variable defined in styles/globals.css.
          backgroundImage:
            'radial-gradient(circle at center, var(--dot-color, rgba(0,0,0,0.05)) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
          WebkitFontSmoothing: 'antialiased',
          // No colour-mode cross-fade on <body>: the theme toggle reveals the
          // new mode with a view transition (lib/themeTransition.ts), and a
          // 200ms background fade underneath it would smear the reveal.
          transitionProperty: 'none',
        },
        // One focus ring everywhere, in the brand accent (≥ 3:1 on both
        // page backgrounds). Components that draw their own ring via the
        // `outline` shadow get the same colour (shadows.outline above).
        '*:focus-visible': { ...FOCUS_RING },
        // Media elements scale within containers
        'img, video': { maxWidth: '100%', height: 'auto' },
        // Long code blocks and inline code should wrap on mobile
        pre: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
        code: { whiteSpace: 'pre-wrap', fontFamily: 'var(--font-geist-mono), monospace' },
        // Tables behave naturally inside their container
        table: { width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' },
        // Selection uses the brand accent (the contrast-safe solid shade).
        '::selection': {
          background: semanticColors['accent.solid'].light,
          color: semanticColors['accent.fg'].light,
        },
      },
    },
  }),
}

export default theme
