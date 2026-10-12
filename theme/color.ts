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
  /** Small secondary text (mono labels, captions): AA (≥ 4.5:1) on every page background. */
  'page.fg-subtle': { light: '#666666', dark: '#8a8a8a' },
  /** Decorative only (dividers, disabled glyphs) — NOT for readable text. */
  'page.muted': { light: '#a1a1a1', dark: '#525252' },
  'page.border': { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.10)' },
  'page.border-strong': { light: 'rgba(0,0,0,0.16)', dark: 'rgba(255,255,255,0.20)' },
  'page.surface': { light: 'rgba(255,255,255,0.7)', dark: 'rgba(22,22,22,0.7)' },
  /** Hover / active wash behind nav items and ghost buttons. */
  'page.hover': { light: 'rgba(0,0,0,0.04)', dark: 'rgba(255,255,255,0.06)' },
  /** Translucent sticky-header glass (paired with backdrop blur). */
  'page.header-bg': { light: 'rgba(253,253,253,0.75)', dark: 'rgba(5,5,5,0.75)' },
  /** Translucent footer glass. */
  'page.footer-bg': { light: 'rgba(253,253,253,0.5)', dark: 'rgba(5,5,5,0.5)' },
  /** Floating panels (section navigator, scroll-to-top). */
  'page.float-bg': { light: 'rgba(255,255,255,0.82)', dark: 'rgba(15,15,15,0.82)' },
  /** Idle indicator dots. */
  'page.dot-idle': { light: 'rgba(0,0,0,0.18)', dark: 'rgba(255,255,255,0.22)' },
  'accent.fg': { light: '#ffffff', dark: '#ffffff' },
} as const satisfies Record<string, ModePair>

export type SemanticColorName = keyof typeof semanticColors

/** `<meta name="theme-color">` / manifest colour for a colour mode. */
export function themeColorFor(mode: 'light' | 'dark'): string {
  return mode === 'light' ? palette.paper : palette.ink
}

/**
 * Legacy shape still read by components/General-UI/CustomHead.tsx for its
 * `<meta name="theme-color">` fallback. It now resolves to the v6 brand
 * background instead of the retired v5 blue.
 */
export const VPColor: Record<string, Record<string, string>> = {
  index: {
    blue: palette.ink,
  },
}
