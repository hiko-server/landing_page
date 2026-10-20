import { extendChakraBaseTheme } from './baseTheme'
import { CHAKRA_COMPONENT_STYLES } from './chakraComponents'
import { printColorVariables, semanticColors } from './color'
import { serverColorMode } from '../lib/themePreference'
import { fontSizes, letterSpacings, radii, textStyles } from './tokens'

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
 *   grid:   8px base, 1100px max content width (PageGrid: content / wide / full lines)
 *   tokens: fluid type scale, text styles, letter-spacings, radii, container
 *           widths and motion (one ease, three durations, zero under reduced
 *           motion) come from theme/tokens.ts — `textStyle="label"`,
 *           `fontSize="display"`; its CSS custom properties (`var(--ease-
 *           standard)`, `var(--duration-fast)`, `--container-*`, elevation)
 *           are mirrored in styles/globals.css (checked by tests)
 *
 * Colours: the semantic tokens ('page.bg', 'page.fg', 'page.muted',
 * 'page.border', 'page.surface', 'status.*', 'accent.text' …, theme/color.ts)
 * plus the accent scale below. The legacy `brand.*` and `ink.*` scales are
 * gone: nothing referenced them, and every unused token still cost bytes in
 * the shared bundle and a CSS variable on every page.
 */

const colors = {
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
  // Three elevation levels: theme/color.ts semanticShadows, as CSS custom
  // properties per data-theme in styles/globals.css (static CSS, so the
  // shared bundle stays lean). `boxShadow="elevation.md"`.
  elevation: {
    sm: 'var(--elevation-sm)',
    md: 'var(--elevation-md)',
    lg: 'var(--elevation-lg)',
  },
}

/** The site-wide keyboard focus ring (also the global *:focus-visible rule below). */
const FOCUS_RING = {
  outline: '2px solid var(--accent)',
  outlineOffset: '2px',
  boxShadow: 'none',
}

/** Left status bar of the `v6` Alert (toasts): the accent for good news, the status tokens for problems. */
const ALERT_BAR = {
  success: 'var(--accent)',
  info: 'var(--accent)',
  loading: 'var(--accent)',
  warning: 'status.warning',
  error: 'status.error',
}

const components = {
  Button: {
    baseStyle: {
      transitionProperty: 'common',
      transitionDuration: 'var(--duration-fast)',
      transitionTimingFunction: 'var(--ease-standard)',
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
  // Validation text and the required asterisk: Chakra's red.500 is under AA
  // at 12px on paper; status.error is AA in both modes (theme/color.ts).
  FormError: {
    baseStyle: {
      text: { color: 'status.error' },
      icon: { color: 'status.error' },
    },
  },
  Form: {
    baseStyle: {
      requiredIndicator: { color: 'status.error' },
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
            boxShadow: 'elevation.md',
          },
          icon: { color: bar },
          spinner: { color: bar },
          title: {
            fontFamily: 'mono',
            fontSize: 'caption',
            fontWeight: 600,
            letterSpacing: 'caps-tight',
            textTransform: 'uppercase',
            lineHeight: '6',
          },
          description: {
            fontSize: 'small',
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

// Chakra's base theme (foundations, no component styles) plus the default
// styles of the components the app renders (theme/chakraComponents.ts —
// tests/perf-g5-bundle.test.ts keeps that list complete), then the overrides
// above (theme/baseTheme.ts merges like extendTheme). extendTheme would
// merge in all ~40 component styles Chakra ships, most of them unused, and
// they would sit in every page's shared JavaScript.
const theme = {
  ...extendChakraBaseTheme({ components: CHAKRA_COMPONENT_STYLES }, {
    colors,
    fonts,
    fontSizes,
    letterSpacings,
    radii,
    textStyles,
    shadows,
    components,
    semanticTokens,
    config: {
      // The visitor's System / Light / Dark preference decides the mode
      // (lib/themePreference.ts: applied before first paint by
      // pages/_document.tsx, stored by the colorModeManager in pages/_app).
      // Without a preference the default is NEXT_PUBLIC_DEFAULT_THEME — the
      // brand's dark look when unset. This is only the mode of the server
      // render, which nothing visible depends on (everything is CSS
      // variables keyed off data-theme). Chakra's own system listener stays
      // off: it would override an explicit Light / Dark choice.
      initialColorMode: serverColorMode(),
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
        // Paper is white: printed pages use the light value of every
        // semantic colour, also when the screen is in dark mode. The selector
        // outranks the dark-mode variables (`:root[data-theme=dark]`).
        '@media print': {
          'html:root[data-theme]': printColorVariables(),
        },
      },
    },
  }),
}

export default theme
