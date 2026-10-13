/**
 * Metric-matched fallbacks for Geist Mono (pages/_app.tsx).
 *
 * next/font's automatic fallback is always Arial or Times New Roman: for the
 * mono face it generated a size-adjusted local(Arial) — a proportional face
 * standing in for a monospace one — so mono labels (the article meta grid's
 * DATE / READ / TAGS, [NN] counters) changed width when Geist Mono swapped
 * in. The mono face therefore sets `adjustFontFallback: false` and lists the
 * families below first in its `fallback`: installed monospace fonts scaled
 * so every glyph is exactly as wide as Geist Mono's, with Geist Mono's
 * ascent / descent / line gap, so the swap moves nothing.
 *
 * A monospace face has one advance width, so `size-adjust` is simply the
 * ratio of the two advances; the vertical overrides are Geist Mono's metrics
 * divided by that ratio (the same formulas next/font uses).
 */

/** public/fonts/GeistMono-Variable.woff2 (tests/r5fix-theme-a11y.test.ts reads these back from the file). */
export const GEIST_MONO_METRICS = {
  unitsPerEm: 1000,
  /** Every glyph's advance width. */
  advance: 600,
  ascent: 1005,
  descent: -295,
  lineGap: 0,
} as const

export type MonoFallback = {
  /** The @font-face family name (listed in the next/font `fallback` option). */
  family: string
  /** Full and PostScript names to match with local(); first installed one wins. */
  locals: readonly string[]
  /** Advance width of every glyph, in font units. */
  advance: number
  unitsPerEm: number
}

/**
 * One face per advance width, in stack order: Menlo (macOS, iOS) and DejaVu
 * Sans Mono (most Linux) share Bitstream Vera's 1233/2048; Consolas
 * (Windows) is 1126/2048; Liberation Mono, Courier New and Droid Sans Mono
 * (Android) are 1229/2048.
 */
export const MONO_FALLBACKS: readonly MonoFallback[] = [
  {
    family: 'Geist Mono Fallback Menlo',
    locals: ['Menlo Regular', 'Menlo-Regular', 'DejaVu Sans Mono', 'DejaVuSansMono'],
    advance: 1233,
    unitsPerEm: 2048,
  },
  { family: 'Geist Mono Fallback Consolas', locals: ['Consolas'], advance: 1126, unitsPerEm: 2048 },
  {
    family: 'Geist Mono Fallback Courier',
    locals: ['Liberation Mono', 'LiberationMono', 'Courier New', 'CourierNewPSMT', 'Droid Sans Mono', 'DroidSansMono'],
    advance: 1229,
    unitsPerEm: 2048,
  },
]

const percent = (value: number) => `${(Math.abs(value) * 100).toFixed(2)}%`

export type FallbackOverrides = { sizeAdjust: string; ascentOverride: string; descentOverride: string; lineGapOverride: string }

/** The @font-face descriptors that make `fallback` occupy exactly Geist Mono's boxes. */
export function monoFallbackOverrides(fallback: Pick<MonoFallback, 'advance' | 'unitsPerEm'>): FallbackOverrides {
  const m = GEIST_MONO_METRICS
  const sizeAdjust = m.advance / m.unitsPerEm / (fallback.advance / fallback.unitsPerEm)
  const scaled = (metric: number) => percent(metric / m.unitsPerEm / sizeAdjust)
  return {
    sizeAdjust: percent(sizeAdjust),
    ascentOverride: scaled(m.ascent),
    descentOverride: scaled(m.descent),
    lineGapOverride: scaled(m.lineGap),
  }
}

/** The @font-face rules for every MONO_FALLBACKS face (rendered once, in <head>, by pages/_app.tsx). */
export function monoFallbackFontFaces(): string {
  return MONO_FALLBACKS.map((f) => {
    const o = monoFallbackOverrides(f)
    const src = f.locals.map((name) => `local("${name}")`).join(',')
    return `@font-face{font-family:"${f.family}";src:${src};size-adjust:${o.sizeAdjust};ascent-override:${o.ascentOverride};descent-override:${o.descentOverride};line-gap-override:${o.lineGapOverride}}`
  }).join('')
}
