/**
 * Design tokens — the single source of truth for typography, spacing-adjacent
 * layout values and motion. Pure TypeScript (no React, no Chakra), so the
 * theme (theme/chakra.js), components, CSS-in-JS and unit tests all read the
 * same numbers.
 *
 *   type     a fluid scale (clamp() between a 360 px and a 1280 px viewport),
 *            letter-spacings and named text styles
 *   radii    semantic corner radii (aliases of Chakra's scale, so existing
 *            `md` / `lg` values do not move)
 *   layout   container widths and the PageGrid's breakout lines
 *   motion   ONE standard ease, THREE durations, and zero under
 *            prefers-reduced-motion
 *
 * Colours live in ./color.ts (contrast-tested pairs). Everything here is
 * emitted as CSS custom properties on :root by theme/chakra.js (`--ease-
 * standard`, `--duration-*`, `--container-*`, …) and registered as Chakra
 * tokens (`fontSize="label"`, `textStyle="display"`, `letterSpacing="caps"`,
 * `borderRadius="card"`).
 *
 * Guard: the shared primitives that have been migrated to these tokens are
 * listed in the `no-restricted-syntax` override of .eslintrc.json — raw px
 * font sizes, em letter-spacings and cubic-bezier literals are a lint error
 * there (CONTRIBUTING.md, "Design tokens").
 */

// ── Fluid type ──────────────────────────────────────────────────────────────

/** The viewport range the fluid scale interpolates over (CSS px). */
export const FLUID_MIN_VIEWPORT = 360
export const FLUID_MAX_VIEWPORT = 1280
const ROOT_PX = 16

const round = (n: number, digits = 4) => {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

/** px → rem string (relative to the 16 px root, so the visitor's font-size setting scales it). */
export function rem(px: number): string {
  return `${round(px / ROOT_PX)}rem`
}

/**
 * A fluid size: `minPx` at a FLUID_MIN_VIEWPORT-wide viewport, `maxPx` at
 * FLUID_MAX_VIEWPORT, linear in between and clamped outside (the Utopia
 * method). Bounds are in rem, so browser zoom and the root font size still
 * scale the text (WCAG 1.4.4); the vw slope is the only viewport-relative part.
 */
export function fluid(
  minPx: number,
  maxPx: number,
  minVw = FLUID_MIN_VIEWPORT,
  maxVw = FLUID_MAX_VIEWPORT
): string {
  // A degenerate range (or equal sizes) is a fixed size.
  if (minPx === maxPx || !(maxVw > minVw)) return rem(maxPx)
  const slope = (maxPx - minPx) / (maxVw - minVw)
  const intercept = minPx - slope * minVw
  const lo = Math.min(minPx, maxPx)
  const hi = Math.max(minPx, maxPx)
  return `clamp(${rem(lo)}, ${rem(intercept)} + ${round(slope * 100)}vw, ${rem(hi)})`
}

/** The size a `fluid(minPx, maxPx)` value resolves to at a viewport width (for tests and docs). */
export function fluidAt(
  minPx: number,
  maxPx: number,
  viewport: number,
  minVw = FLUID_MIN_VIEWPORT,
  maxVw = FLUID_MAX_VIEWPORT
): number {
  const t = Math.min(1, Math.max(0, (viewport - minVw) / (maxVw - minVw)))
  return minPx + (maxPx - minPx) * t
}

/**
 * The type scale: [px at 360 px, px at 1280 px]. Small sizes barely move
 * (legibility first: no label is ever below 11 px), display sizes move most.
 */
export const TYPE_SCALE = {
  /** Mono uppercase labels, eyebrows, dt, chips' caps. */
  label: [11, 12],
  /** Mono metadata (dates, periods), captions, chips. */
  caption: [12, 13],
  /** Secondary copy: card descriptions, meta values. */
  small: [14, 15],
  /** Reading text. */
  body: [16, 17],
  /** A page's lede paragraph. */
  lede: [17, 18],
  /** h4 / small titles. */
  'title-sm': [17, 18],
  /** h3 / card titles. */
  'title-md': [19, 21],
  /** h2 / featured card titles. */
  'title-lg': [22, 26],
  /** Article h1 inside prose. */
  'title-xl': [28, 34],
  /** The page h1 (PageHeader). */
  display: [36, 56],
  /** Big figures (GitHub stats). */
  stat: [28, 44],
} as const satisfies Record<string, readonly [number, number]>

export type TypeStep = keyof typeof TYPE_SCALE

/** Chakra `fontSizes` additions (custom keys only — Chakra's own xs…9xl keep their values). */
export const fontSizes: Record<TypeStep, string> = Object.fromEntries(
  Object.entries(TYPE_SCALE).map(([name, [min, max]]) => [name, fluid(min, max)])
) as Record<TypeStep, string>

/** Chakra `letterSpacings` additions (Chakra's tighter…widest keep their values). */
export const letterSpacings = {
  /** Mono uppercase labels. */
  caps: '0.12em',
  /** Uppercase labels in narrow cells (stat tiles on phones). */
  'caps-tight': '0.06em',
  /** Group headings (palette groups, footer columns). */
  'caps-wide': '0.16em',
  /** Titles h2–h4. */
  heading: '-0.02em',
  /** Small titles. */
  'heading-sm': '-0.015em',
  /** The page h1. */
  display: '-0.025em',
  /** Big tabular figures. */
  numeric: '-0.03em',
} as const

const MONO = 'mono'

/**
 * Named text styles (Chakra `textStyles`): `textStyle="label"`. Families and
 * sizes are token names; no colour (colour is a separate, semantic choice).
 */
export const textStyles = {
  label: {
    fontFamily: MONO,
    fontSize: 'label',
    lineHeight: '1.4',
    letterSpacing: 'caps',
    textTransform: 'uppercase',
  },
  'label-wide': {
    fontFamily: MONO,
    fontSize: 'label',
    lineHeight: '1.4',
    letterSpacing: 'caps-wide',
    textTransform: 'uppercase',
  },
  meta: {
    fontFamily: MONO,
    fontSize: 'caption',
    lineHeight: '1.5',
    letterSpacing: '0',
  },
  small: { fontSize: 'small', lineHeight: '1.55' },
  body: { fontSize: 'body', lineHeight: '1.7' },
  lede: { fontSize: 'lede', lineHeight: '1.6' },
  'title-sm': {
    fontSize: 'title-sm',
    lineHeight: '1.35',
    letterSpacing: 'heading-sm',
    fontWeight: 600,
  },
  'title-md': {
    fontSize: 'title-md',
    lineHeight: '1.3',
    letterSpacing: 'heading',
    fontWeight: 600,
  },
  'title-lg': {
    fontSize: 'title-lg',
    lineHeight: '1.22',
    letterSpacing: 'heading',
    fontWeight: 600,
  },
  'title-xl': {
    fontSize: 'title-xl',
    lineHeight: '1.15',
    letterSpacing: 'heading',
    fontWeight: 600,
  },
  display: { fontSize: 'display', lineHeight: '1.05', letterSpacing: 'display', fontWeight: 500 },
  stat: {
    fontSize: 'stat',
    lineHeight: '1',
    letterSpacing: 'numeric',
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
  },
} as const

export type TextStyleName = keyof typeof textStyles

/**
 * A text style as explicit style props, for Chakra components that bring
 * their own theme sizes (`Heading`): a `textStyle` prop ranks below a
 * component's theme styles (Heading's responsive `size` would win at md+),
 * explicit props replace them. `<Heading {...textStyleProps('title-lg')} />`.
 */
export function textStyleProps<N extends TextStyleName>(name: N): (typeof textStyles)[N] {
  return { ...textStyles[name] }
}

// ── Radii ───────────────────────────────────────────────────────────────────

/** Semantic radii (Chakra `radii` additions; equal to md / lg / xl / full). */
export const radii = {
  /** Buttons, inputs, chips with corners, small media frames. */
  control: '0.375rem',
  /** Cards and image frames. */
  card: '0.5rem',
  /** Dialogs, the palette, large panels. */
  panel: '0.75rem',
  /** Pills and dots. */
  pill: '9999px',
} as const

// ── Layout ──────────────────────────────────────────────────────────────────

/** Container widths (CSS custom properties `--container-*`, see cssVariables()). */
export const containers = {
  /** The page column every header, section and footer aligns to. */
  content: '1100px',
  /** The breakout line: media may widen to this. */
  wide: '1280px',
  /** Narrow single-column pages (the admin live preview). */
  prose: '720px',
} as const

/** Reading measure of article prose. */
export const MEASURE = '68ch'

/** Page gutters by breakpoint (px; Chakra space 4 / 6 / 8). */
export const PAGE_GUTTERS = { base: 16, md: 24, lg: 32 } as const

/**
 * The PageGrid's columns, with named lines:
 *
 *   full-start | gutter | wide-start | breakout | content-start … content-end | breakout | wide-end | gutter | full-end
 *
 * `content` is the page column (the container minus its gutters, so it lines
 * up with the header); `wide` adds up to half the wide/content difference on
 * each side; `full` is edge to edge. Pure function of the CSS variables, so
 * the server HTML is laid out before any script runs.
 */
export function pageGridColumns(): string {
  const content =
    'min(calc(100% - 2 * var(--page-gutter)), calc(var(--container-content) - 2 * var(--page-gutter)))'
  const breakout = 'minmax(0, calc((var(--container-wide) - var(--container-content)) / 2))'
  return [
    '[full-start] minmax(var(--page-gutter), 1fr)',
    `[wide-start] ${breakout}`,
    `[content-start] ${content}`,
    `[content-end] ${breakout}`,
    '[wide-end] minmax(var(--page-gutter), 1fr) [full-end]',
  ].join(' ')
}

// ── Motion ──────────────────────────────────────────────────────────────────

/** The one standard ease (an ease-out quart): fast start, soft landing. */
export const EASE_STANDARD = [0.22, 1, 0.36, 1] as const
export const EASE_STANDARD_CSS = `cubic-bezier(${EASE_STANDARD.join(', ')})`

/** The three UI durations (ms). Hover / press · panels & borders · reveals. */
export const DURATIONS = { fast: 150, base: 250, slow: 450 } as const
export type DurationName = keyof typeof DURATIONS

/** What every duration becomes under prefers-reduced-motion. */
export const REDUCED_MOTION_DURATION = 0

/** `var(--duration-base)` — the CSS custom property of a duration (0ms under reduced motion). */
export function durationVar(name: DurationName): string {
  return `var(--duration-${name})`
}

/**
 * A CSS `transition` value on the standard ease:
 * `cssTransition(['color', 'background-color'], 'fast')` →
 * `color var(--duration-fast) var(--ease-standard), background-color …`.
 */
export function cssTransition(
  properties: string | readonly string[],
  duration: DurationName = 'base'
): string {
  const list = typeof properties === 'string' ? [properties] : properties
  return list.map((p) => `${p} ${durationVar(duration)} var(--ease-standard)`).join(', ')
}

/**
 * A framer-motion `transition` on the standard ease. `reduce` (from
 * useReducedMotion) gives the zero-duration transition.
 */
export type MotionTransition = { duration: number; ease?: [number, number, number, number] }

export function motionTransition(
  duration: DurationName = 'base',
  reduce = false
): MotionTransition {
  if (reduce) return { duration: REDUCED_MOTION_DURATION }
  const [a, b, c, d] = EASE_STANDARD
  return { duration: DURATIONS[duration] / 1000, ease: [a, b, c, d] }
}

// ── CSS custom properties ───────────────────────────────────────────────────

/** Every token that is also a CSS custom property, for :root (theme/chakra.js). */
export function cssVariables(): Record<string, string> {
  return {
    '--ease-standard': EASE_STANDARD_CSS,
    // The earlier name of the same curve, kept for components not migrated yet.
    '--ease-out-quart': 'var(--ease-standard)',
    '--duration-fast': `${DURATIONS.fast}ms`,
    '--duration-base': `${DURATIONS.base}ms`,
    '--duration-slow': `${DURATIONS.slow}ms`,
    '--container-content': containers.content,
    '--container-wide': containers.wide,
    '--container-prose': containers.prose,
    '--measure': MEASURE,
    '--page-gutter': `${PAGE_GUTTERS.base}px`,
  }
}

/** The reduced-motion overrides of cssVariables(). */
export function reducedMotionVariables(): Record<string, string> {
  return {
    '--duration-fast': `${REDUCED_MOTION_DURATION}ms`,
    '--duration-base': `${REDUCED_MOTION_DURATION}ms`,
    '--duration-slow': `${REDUCED_MOTION_DURATION}ms`,
  }
}
