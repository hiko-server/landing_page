/**
 * v6 "Indigo Precision" palette — the single source of truth for colour
 * values that live outside Chakra's style props (manifest, <meta
 * name="theme-color">, view-transition CSS) and for the semantic tokens that
 * theme/chakra.js registers.
 *
 * Every text token is paired light/dark and checked for WCAG contrast in
 * tests/s5-chrome.test.ts, so a tweak here cannot silently drop a label below
 * AA at the 10–13px sizes the mono [NN] labels use.
 */

export const palette = {
  /** Near-black page background (dark, the default brand look). */
  ink: '#050505',
  /** Paper page background (light). */
  paper: '#fdfdfd',
  /** The single brand accent (indigo-500). */
  accent: '#6366f1',
} as const

type ModePair = { light: string; dark: string }

/**
 * Semantic colours by mode. theme/chakra.js maps these 1:1 onto Chakra
 * semantic tokens (`page.bg` → `{ default: light, _dark: dark }`), which
 * compile to CSS variables keyed off `data-theme` — so they resolve correctly
 * on the very first paint, before React hydrates.
 */
export const semanticColors = {
  'page.bg': { light: palette.paper, dark: palette.ink },
  'page.bg-elevated': { light: '#f5f5f5', dark: '#161616' },
  'page.bg-overlay': { light: '#ededed', dark: '#1a1a1a' },
  'page.fg': { light: '#0a0a0a', dark: '#fafafa' },
  'page.fg-secondary': { light: '#525252', dark: '#a1a1a1' },
  /** Long-form reading text (article paragraphs and lists): softer than page.fg, still AAA-range. */
  'page.fg-prose': { light: '#27272a', dark: '#d4d4d8' },
  /** Small secondary text (mono labels, captions): AA (≥ 4.5:1) on every page background. */
  'page.fg-subtle': { light: '#666666', dark: '#8a8a8a' },
  /** Decorative only (dividers, disabled glyphs) — NOT for readable text. */
  'page.muted': { light: '#a1a1a1', dark: '#525252' },
  /**
   * The boundary of an unchecked form control (a checkbox's box): ≥ 3:1 on
   * every page and row background in both modes (WCAG 1.4.11; checked in
   * tests/review-fixes-r2.test.ts). page.border / border-strong are hairlines
   * for surfaces, too faint to find a control by.
   */
  'page.control-border': { light: '#858585', dark: '#6b6b6b' },
  'page.border': { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.10)' },
  'page.border-strong': { light: 'rgba(0,0,0,0.16)', dark: 'rgba(255,255,255,0.20)' },
  'page.surface': { light: 'rgba(255,255,255,0.7)', dark: 'rgba(22,22,22,0.7)' },
  /** Hover / active wash behind nav items and ghost buttons. */
  'page.hover': { light: 'rgba(0,0,0,0.04)', dark: 'rgba(255,255,255,0.06)' },
  /**
   * Translucent sticky-header glass (paired with backdrop blur). Opaque
   * enough that the header text keeps AA (≥ 4.5:1) even over the opposite
   * extreme scrolling underneath it — the white CV sheet in dark mode, a
   * dark photo in light mode (checked in tests/r5fix-theme-a11y.test.ts).
   */
  'page.header-bg': { light: 'rgba(253,253,253,0.92)', dark: 'rgba(5,5,5,0.92)' },
  /** Translucent footer glass. */
  'page.footer-bg': { light: 'rgba(253,253,253,0.5)', dark: 'rgba(5,5,5,0.5)' },
  /** Floating panels (section navigator, scroll-to-top). */
  'page.float-bg': { light: 'rgba(255,255,255,0.82)', dark: 'rgba(15,15,15,0.82)' },
  /** Idle indicator dots. */
  'page.dot-idle': { light: 'rgba(0,0,0,0.18)', dark: 'rgba(255,255,255,0.22)' },
  /** Text on accent.solid (buttons, the skip link, text selection). */
  'accent.fg': { light: '#ffffff', dark: '#ffffff' },
  /**
   * Accent-coloured TEXT (links, eyebrows, active labels, [NN] counters).
   * The brand accent itself (#6366f1) is 4.4:1 on paper and under 4.5:1 on
   * the elevated dark surfaces, so small text uses indigo-600 on light and
   * indigo-400 on dark. Borders, dots, rules and focus rings keep --accent.
   */
  'accent.text': { light: '#4f46e5', dark: '#818cf8' },
  /** Filled accent background behind accent.fg text (≥ 4.5:1 with white in both modes). */
  'accent.solid': { light: '#4f46e5', dark: '#4f46e5' },
  'accent.solid-hover': { light: '#4338ca', dark: '#4338ca' },
  'accent.solid-active': { light: '#3730a3', dark: '#3730a3' },
  /**
   * Availability status (text + dot). Each is ≥ 4.5:1 on every page
   * background, and is always paired with a text label — never colour alone.
   */
  'status.open': { light: '#15803d', dark: '#4ade80' },
  'status.limited': { light: '#b45309', dark: '#fbbf24' },
  'status.closed': { light: '#525252', dark: '#a1a1a1' },
  /** Hairline border of a "live" status chip (decorative, paired with status.open text). */
  'status.open-border': { light: 'rgba(21,128,61,0.35)', dark: 'rgba(74,222,128,0.35)' },
  /**
   * Form validation messages and the required-field asterisk. Chakra's
   * red.500 is 4.05:1 on paper at 12px; this pair (red.600 / red.300) is
   * ≥ 4.5:1 on every page background in both modes.
   */
  'status.error': { light: '#c53030', dark: '#fc8181' },
  /**
   * Toast / notice warnings (the v6 Alert's status bar). ≥ 4.5:1 on every
   * page background, overlays included (tests/tokens-theme-b2.test.ts) — a
   * shade deeper than status.limited, which only sits on page and card
   * surfaces. Status colour is always paired with words, never alone.
   */
  'status.warning': { light: '#aa4c09', dark: '#fbbf24' },
  /** A project that is live (work cards), and its chip border. */
  'status.live': { light: '#157a3b', dark: '#4ade80' },
  'status.live-border': { light: 'rgba(21,122,59,0.35)', dark: 'rgba(74,222,128,0.35)' },
  /** The "Featured" marker on work cards. */
  'status.featured': { light: '#4f46e5', dark: '#818cf8' },
} as const satisfies Record<string, ModePair>

/**
 * Elevation: three shadow levels by mode, the source of the `--elevation-*`
 * custom properties in styles/globals.css (static CSS per data-theme, kept
 * identical by tests/tokens-theme-b2.test.ts); Chakra's
 * `boxShadow="elevation.md"` resolves to them. Light mode uses soft, layered greys; on the
 * near-black page a shadow alone is invisible, so dark mode pairs a deeper
 * shadow with a faint light hairline that outlines the raised surface.
 *
 *   sm  raised: cards on hover, small floating controls
 *   md  overlay: menus, popovers, toasts
 *   lg  modal: dialogs, the ⌘K palette, the lightbox
 */
export const semanticShadows = {
  'elevation.sm': {
    light: '0 1px 2px rgba(0,0,0,0.06), 0 1px 1px rgba(0,0,0,0.04)',
    dark: '0 1px 2px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
  },
  'elevation.md': {
    light: '0 8px 24px -6px rgba(0,0,0,0.12), 0 2px 6px -2px rgba(0,0,0,0.08)',
    dark: '0 10px 28px -6px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)',
  },
  'elevation.lg': {
    light: '0 24px 60px -12px rgba(0,0,0,0.22), 0 8px 20px -8px rgba(0,0,0,0.10)',
    dark: '0 24px 60px -8px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08)',
  },
} as const satisfies Record<string, ModePair>

export type SemanticShadowName = keyof typeof semanticShadows

export type SemanticColorName = keyof typeof semanticColors

/** `<meta name="theme-color">` / manifest colour for a colour mode. */
export function themeColorFor(mode: 'light' | 'dark'): string {
  return mode === 'light' ? palette.paper : palette.ink
}

/** The CSS custom property Chakra compiles a semantic colour to ('page.fg' → '--chakra-colors-page-fg'). */
export function chakraColorVar(name: string): string {
  return `--chakra-colors-${name.replace(/\./g, '-')}`
}

/**
 * Print always lands on white paper, so every semantic colour takes its light
 * (paper) value there whatever the screen theme is — otherwise a page printed
 * in dark mode puts near-white text on white. theme/chakra.js emits these
 * under `@media print`.
 */
export function printColorVariables(): Record<string, string> {
  return Object.fromEntries(Object.entries(semanticColors).map(([name, { light }]) => [chakraColorVar(name), light]))
}
