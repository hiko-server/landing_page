import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  DURATIONS,
  EASE_STANDARD,
  EASE_STANDARD_CSS,
  FLUID_MAX_VIEWPORT,
  FLUID_MIN_VIEWPORT,
  MEASURE,
  PAGE_GUTTERS,
  REDUCED_MOTION_DURATION,
  TYPE_SCALE,
  containers,
  cssTransition,
  cssVariables,
  durationVar,
  fluid,
  fluidAt,
  fontSizes,
  letterSpacings,
  motionTransition,
  pageGridColumns,
  radii,
  reducedMotionVariables,
  rem,
  textStyleProps,
  textStyles,
} from '../theme/tokens'

/**
 * B1 — design tokens: fluid type scale, text styles, letter-spacing, radii,
 * container widths, the PageGrid's breakout lines and motion (one ease,
 * three durations, zero under reduced motion), plus the lint guard on the
 * migrated primitives.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, '$1')

/** Evaluate a fluid() clamp at a viewport width (16px root). */
function evalClamp(value: string, viewport: number): number {
  const m = /^clamp\(([-\d.]+)rem, ([-\d.]+)rem \+ ([-\d.]+)vw, ([-\d.]+)rem\)$/.exec(value)
  if (!m) {
    const r = /^([-\d.]+)rem$/.exec(value)
    assert.ok(r, `not a fluid value: ${value}`)
    return Number(r[1]) * 16
  }
  const [lo, intercept, vw, hi] = m.slice(1).map(Number)
  const preferred = intercept * 16 + (vw / 100) * viewport
  return Math.min(hi * 16, Math.max(lo * 16, preferred))
}

// ── fluid type ──────────────────────────────────────────────────────────────

test('fluid() hits its bounds at 360 and 1280 px, interpolates linearly and clamps outside', () => {
  const v = fluid(36, 56)
  assert.match(v, /^clamp\(2\.25rem, [\d.]+rem \+ [\d.]+vw, 3\.5rem\)$/)
  assert.ok(Math.abs(evalClamp(v, FLUID_MIN_VIEWPORT) - 36) < 0.01)
  assert.ok(Math.abs(evalClamp(v, FLUID_MAX_VIEWPORT) - 56) < 0.01)
  assert.ok(Math.abs(evalClamp(v, 820) - 46) < 0.05, 'linear in between')
  assert.equal(evalClamp(v, 320), 36, 'clamped below the range')
  assert.equal(evalClamp(v, 1920), 56, 'clamped above the range')
  assert.equal(fluid(14, 14), '0.875rem')
  assert.equal(rem(11), '0.6875rem')
  assert.equal(fluid(10, 12, 800, 800), '0.75rem', 'a degenerate range is a fixed size')
  // fluidAt mirrors the CSS.
  for (const vp of [360, 500, 768, 1024, 1280, 1600]) {
    assert.ok(Math.abs(fluidAt(36, 56, vp) - evalClamp(v, vp)) < 0.05, `fluidAt @${vp}`)
  }
})

test('every type step is a fluid token: ≥ 11px, growing, and within the 2.5× zoom-safe ratio', () => {
  for (const [name, [min, max]] of Object.entries(TYPE_SCALE)) {
    assert.ok(min >= 11, `${name}: no text token under 11px`)
    assert.ok(max >= min, `${name}: grows with the viewport`)
    assert.ok(max / min <= 2.5, `${name}: WCAG 1.4.4 — zoom can still reach 200%`)
    const css = fontSizes[name as keyof typeof fontSizes]
    assert.ok(Math.abs(evalClamp(css, 360) - min) < 0.01, `${name} @360`)
    assert.ok(Math.abs(evalClamp(css, 1280) - max) < 0.01, `${name} @1280`)
  }
  // The research ask: labels are 11–12px (were 10px).
  assert.deepEqual([...TYPE_SCALE.label], [11, 12])
  // The scale is ordered: each title is larger than the next smaller one.
  const order = ['label', 'caption', 'small', 'body', 'title-md', 'title-lg', 'title-xl', 'display'] as const
  for (let i = 1; i < order.length; i++) assert.ok(TYPE_SCALE[order[i]][1] > TYPE_SCALE[order[i - 1]][1], order[i])
})

test('token names never shadow Chakra defaults (existing fontSize="sm" / radius="md" stay as they were)', () => {
  const chakraFontSizes = ['3xs', '2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl']
  const chakraLetterSpacings = ['tighter', 'tight', 'normal', 'wide', 'wider', 'widest']
  const chakraRadii = ['none', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl', 'full']
  for (const k of Object.keys(fontSizes)) assert.ok(!chakraFontSizes.includes(k), `fontSizes.${k}`)
  for (const k of Object.keys(letterSpacings)) assert.ok(!chakraLetterSpacings.includes(k), `letterSpacings.${k}`)
  for (const k of Object.keys(radii)) assert.ok(!chakraRadii.includes(k), `radii.${k}`)
  // Semantic radii are aliases of the scale already in use.
  assert.deepEqual(radii, { control: '0.375rem', card: '0.5rem', panel: '0.75rem', pill: '9999px' })
})

test('text styles only reference tokens that exist', () => {
  for (const [name, style] of Object.entries(textStyles)) {
    const s = style as Record<string, unknown>
    assert.ok(typeof s.fontSize === 'string' && s.fontSize in fontSizes, `${name}.fontSize`)
    if (s.letterSpacing !== undefined && s.letterSpacing !== '0') {
      assert.ok((s.letterSpacing as string) in letterSpacings, `${name}.letterSpacing`)
    }
    assert.equal(s.color, undefined, `${name}: colour is a separate semantic choice`)
  }
  assert.equal(textStyles.label.textTransform, 'uppercase')
  assert.equal(textStyles.label.fontFamily, 'mono')
  assert.equal(textStyles.display.fontSize, 'display')
  // Explicit-props form for components with their own theme sizes (Heading): a copy.
  const props = textStyleProps('title-lg')
  assert.deepEqual(props, textStyles['title-lg'])
  assert.notEqual(props, textStyles['title-lg'])
})

// ── layout ──────────────────────────────────────────────────────────────────

test('containers, measure and gutters are tokens, and the PageGrid CSS matches pageGridColumns()', () => {
  assert.deepEqual(containers, { content: '1100px', wide: '1280px', prose: '720px' })
  assert.equal(MEASURE, '68ch')
  assert.deepEqual(PAGE_GUTTERS, { base: 16, md: 24, lg: 32 })
  const cols = pageGridColumns()
  for (const line of ['full-start', 'wide-start', 'content-start', 'content-end', 'wide-end', 'full-end']) {
    assert.ok(cols.includes(`[${line}]`), line)
  }
  const css = read('styles/globals.css')
  const block = /\.page-grid \{\s*display: grid;\s*grid-template-columns:([^;]+);/.exec(css)
  assert.ok(block, '.page-grid rule')
  const norm = (v: string) => v.replace(/\s+/g, ' ').trim()
  assert.equal(norm(block[1]), norm(cols))
  assert.match(css, /\.page-grid > \[data-span='wide'\] \{\s*grid-column: wide;/)
  assert.match(css, /\.page-grid > \[data-span='full'\] \{\s*grid-column: full;/)
})

test('/work lays out on the PageGrid; the component offers the breakout spans', () => {
  const work = read('pages/work/index.tsx')
  assert.match(work, /<PageGrid py=\{\[12, 16\]\}>/)
  assert.doesNotMatch(work, /maxW="var\(--container-content\)" mx="auto"/)
  const grid = read('components/General-UI/PageGrid.tsx')
  assert.match(grid, /'page-grid'/)
  assert.match(grid, /data-span=\{span === 'content' \? undefined : span\}/)
})

// ── motion ──────────────────────────────────────────────────────────────────

test('motion: one standard ease, three durations, zero under reduced motion', () => {
  assert.deepEqual([...EASE_STANDARD], [0.22, 1, 0.36, 1])
  assert.equal(EASE_STANDARD_CSS, 'cubic-bezier(0.22, 1, 0.36, 1)')
  assert.deepEqual(DURATIONS, { fast: 150, base: 250, slow: 450 })
  assert.equal(REDUCED_MOTION_DURATION, 0)
  assert.equal(durationVar('slow'), 'var(--duration-slow)')
  assert.equal(cssTransition('color', 'fast'), 'color var(--duration-fast) var(--ease-standard)')
  assert.equal(
    cssTransition(['color', 'opacity']),
    'color var(--duration-base) var(--ease-standard), opacity var(--duration-base) var(--ease-standard)',
  )
  assert.deepEqual(motionTransition('fast'), { duration: 0.15, ease: [0.22, 1, 0.36, 1] })
  assert.deepEqual(motionTransition('slow', true), { duration: 0 })
  // A fresh array each call: framer-motion may not share a frozen tuple.
  assert.notEqual(motionTransition().ease, motionTransition().ease)
})

test('the CSS custom properties in globals.css are exactly the tokens (static CSS, not shared JS)', () => {
  const vars = cssVariables()
  assert.equal(vars['--ease-standard'], EASE_STANDARD_CSS)
  assert.equal(vars['--ease-out-quart'], 'var(--ease-standard)')
  assert.equal(vars['--duration-fast'], '150ms')
  assert.equal(vars['--duration-base'], '250ms')
  assert.equal(vars['--duration-slow'], '450ms')
  assert.equal(vars['--container-content'], '1100px')
  assert.equal(vars['--container-wide'], '1280px')
  assert.equal(vars['--page-gutter'], '16px')
  assert.deepEqual(reducedMotionVariables(), { '--duration-fast': '0ms', '--duration-base': '0ms', '--duration-slow': '0ms' })

  const css = stripComments(read('styles/globals.css'))
  const rootBlock = /^:root \{([^}]*)\}/m.exec(css)?.[1] || ''
  const declared = (block: string) =>
    Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
  const root = declared(rootBlock)
  for (const [name, value] of Object.entries(vars)) assert.equal(root[name], value, `${name} in :root`)
  // Each token is declared once at the top level of :root (plus its media overrides).
  for (const name of Object.keys(vars)) {
    const count = (css.match(new RegExp(`${name}:`, 'g')) || []).length
    const expected = name === '--page-gutter' ? 3 : name.startsWith('--duration-') ? 2 : 1
    assert.equal(count, expected, `${name} declarations`)
  }
  const reduced = /@media \(prefers-reduced-motion: reduce\) \{\s*:root \{([^}]*)\}/.exec(css)?.[1] || ''
  assert.deepEqual(declared(reduced), reducedMotionVariables())
  assert.match(css, new RegExp(`@media screen and \\(min-width: 48em\\) \\{\\s*:root \\{\\s*--page-gutter: ${PAGE_GUTTERS.md}px;`))
  assert.match(css, new RegExp(`@media screen and \\(min-width: 62em\\) \\{\\s*:root \\{\\s*--page-gutter: ${PAGE_GUTTERS.lg}px;`))
  // The standard curve is spelled out once, as the token (the pulse loop's sine is not the UI ease).
  const curves = css.match(/cubic-bezier\([^)]*\)/g) || []
  assert.deepEqual(curves.sort(), ['cubic-bezier(0.22, 1, 0.36, 1)', 'cubic-bezier(0.4, 0, 0.6, 1)'])
  assert.doesNotMatch(css, /var\(--ease-out-quart\)/)

  const chakra = read('theme/chakra.js')
  assert.match(chakra, /from '\.\/tokens'/)
  assert.doesNotMatch(chakra, /cssVariables|':root'/, 'no CSS variables shipped through the JS theme')
  for (const key of ['fontSizes,', 'letterSpacings,', 'radii,', 'textStyles,']) assert.ok(chakra.includes(key), key)
  assert.doesNotMatch(stripComments(chakra), /cubic-bezier/)
})

test('the app shell, the theme reveal and the migrated primitives use the motion tokens', () => {
  assert.match(read('pages/_app.tsx'), /const PAGE_TRANSITION = motionTransition\('base'\)/)
  assert.doesNotMatch(read('pages/_app.tsx'), /0\.22, 1, 0\.36, 1/)
  const reveal = read('lib/themeTransition.ts')
  assert.match(reveal, /REVEAL_MS = DURATIONS\.slow/)
  assert.match(reveal, /REVEAL_EASING = EASE_STANDARD_CSS/)
  const work = read('pages/work/index.tsx')
  assert.match(work, /cssTransition\('border-color', 'base'\)/)
  assert.doesNotMatch(work, /ease-out-quart|cubic-bezier/)
})

// ── migrated primitives + guard ─────────────────────────────────────────────

const GUARDED = [
  'components/General-UI/SectionLabel.tsx',
  'components/General-UI/PageHeader.tsx',
  'components/General-UI/PageGrid.tsx',
  'components/Article/MetaGrid.tsx',
  'components/GitHub/StatsBar.tsx',
]

test('the shared primitives use text styles instead of raw px sizes and em tracking', () => {
  const rawType = /(fontSize|letterSpacing|lineHeight)(=|:\s*)(\{?\s*)?['"]-?[\d.]+(px|em|rem)['"]/
  for (const f of GUARDED) assert.doesNotMatch(stripComments(read(f)), rawType, f)
  assert.match(read('components/General-UI/SectionLabel.tsx'), /textStyle="label"/)
  const header = read('components/General-UI/PageHeader.tsx')
  assert.match(header, /textStyle="label"/)
  assert.match(header, /\.\.\.textStyleProps\('display'\)/)
  assert.match(header, /textStyle="lede"/)
  const meta = read('components/Article/MetaGrid.tsx')
  assert.match(meta, /as="dt" textStyle="label"/)
  assert.match(meta, /fontSize="small"/)
  const stats = read('components/GitHub/StatsBar.tsx')
  assert.match(stats, /textStyle: 'stat'/)
  assert.match(stats, /textStyle: 'label'/)
  // MDX headings: the title text styles (the prose body is the reading stream's).
  const mdx = read('components/MDX/MDXContent.tsx')
  assert.match(mdx, /as="h1"[^>]*\.\.\.textStyleProps\('title-xl'\)/)
  assert.match(mdx, /as="h2"[^>]*\.\.\.textStyleProps\('title-lg'\)/)
  assert.match(mdx, /as="h3"[^>]*\.\.\.textStyleProps\('title-md'\)/)
  assert.match(mdx, /as="h4"[^>]*\.\.\.textStyleProps\('title-sm'\)/)
  // WorkCard: labels at 11–12px (no more 10px), titles from the scale.
  const work = read('pages/work/index.tsx')
  assert.doesNotMatch(work, /fontSize=(\{[^}]*)?["']1[01]px/)
  assert.match(work, /\.\.\.textStyleProps\(featured \? 'title-lg' : 'title-md'\)/)
})

test('ESLint guards the migrated primitives (an error, because lint runs with --max-warnings 0)', () => {
  const config = JSON.parse(read('.eslintrc.json')) as {
    overrides: { files: string[]; rules: Record<string, unknown> }[]
  }
  const guard = config.overrides.find((o) => o.rules['no-restricted-syntax'])
  assert.ok(guard, 'override with no-restricted-syntax')
  for (const f of GUARDED) assert.ok(guard.files.includes(f), f)
  const [level, ...selectors] = guard.rules['no-restricted-syntax'] as [string, ...{ selector: string; message: string }[]]
  assert.equal(level, 'error')
  const all = selectors.map((s) => s.selector).join('\n')
  assert.match(all, /fontSize\|letterSpacing\|lineHeight/)
  assert.match(all, /cubic-bezier/)
  assert.match(all, /Property\[key\.name='ease'\] > ArrayExpression/)
  for (const s of selectors) assert.match(s.message, /^Design tokens:/)
  // Documented for contributors.
  assert.match(read('CONTRIBUTING.md'), /## Design tokens/)
})
