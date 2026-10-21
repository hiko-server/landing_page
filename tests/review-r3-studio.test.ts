/**
 * Review round 3, fix3-E — the parts that are tokens, theme styles or
 * source; the running pages are checked in e2e/review-r3-studio.spec.ts.
 *
 *   CV-STUDIO-CONTRAST  CV Studio meets WCAG 2.2 AA in light and dark: text
 *                       ≥ 4.5:1 (1.4.3); field edges, switch tracks, icons
 *                       and focus rings ≥ 3:1 (1.4.11) — through the site's
 *                       semantic tokens and the admin theme's own
 *                       (theme/adminComponents.ts, AdminThemeScope)
 *   DRAFTBAR-ROOM       the owner's draft-preview bar sits above the footer
 *                       and the page keeps room below the footer for it, so
 *                       a focused footer link is never under it (2.4.11)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire, register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import theme from '../theme/chakra.js'
import {
  ADMIN_COLOR_VARS,
  ADMIN_COMPONENT_STYLES,
  ADMIN_GLOBAL_CSS,
  CONTROL_BORDER,
  FIELD_BOUNDARY,
  HIDDEN_FG,
  withAdminFieldContrast,
} from '../theme/adminComponents'
import { semanticColors } from '../theme/color'

// Node strips TypeScript types but does not compile JSX: transpile .tsx with the project's TypeScript (as tests/csc-render.test.ts).
register(
  'data:text/javascript,' +
    encodeURIComponent(`
      let ts
      export async function initialize(data) { ts = (await import(data.ts)).default }
      export async function load(url, context, next) {
        if (!url.startsWith('file:') || !url.endsWith('.tsx')) return next(url, context)
        const { readFile } = await import('node:fs/promises')
        const source = await readFile(new URL(url), 'utf8')
        const out = ts.transpileModule(source, {
          fileName: url,
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        })
        return { format: 'module', source: out.outputText, shortCircuit: true }
      }
    `),
  { parentURL: import.meta.url, data: { ts: pathToFileURL(createRequire(import.meta.url).resolve('typescript')).href } },
)
const { default: BottomBarHost, BOTTOM_BAR_ROOM } = await import('../components/Common/BottomBarHost')
const { default: DraftBar } = await import('../components/Article/DraftBar')

const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

type Rgb = [number, number, number]
const hexRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
const rgbHex = (c: Rgb) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
/** `rgba` (r, g, b, a) painted over an opaque hex. */
const over = (base: string, [r, g, b, a]: [number, number, number, number]) => {
  const [x, y, z] = hexRgb(base)
  return rgbHex([r * a + x * (1 - a), g * a + y * (1 - a), b * a + z * (1 - a)])
}
function luminance(hex: string): number {
  const [r, g, b] = hexRgb(hex).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

type AnyTheme = { colors: Record<string, Record<string, string> | string>; components: Record<string, any> }
const appTheme = theme as unknown as AnyTheme
/** 'orange.700' → its hex in the app theme. */
const colour = (token: string) => {
  const [hue, shade] = token.split('.')
  return (appTheme.colors[hue] as Record<string, string>)[shade]
}
const MODES = ['light', 'dark'] as const
type Mode = (typeof MODES)[number]
const sem = (name: keyof typeof semanticColors, mode: Mode) => semanticColors[name][mode]

/**
 * Every surface CV Studio puts words, icons or fields on, by mode: the
 * editor, the toolbar / sidebar, menus' active rows, the hidden stripe (its
 * tinted band), and an active sidebar row or a selected toggle (the accent
 * wash over the toolbar or the editor).
 */
function surfaces(mode: Mode): Record<string, string> {
  const page = sem('page.bg', mode)
  const elevated = sem('page.bg-elevated', mode)
  const stripe: [number, number, number, number] = mode === 'light' ? [234, 88, 12, 0.07] : [251, 146, 60, 0.09]
  const accentSoft: [number, number, number, number] = [99, 102, 241, 0.1]
  return {
    'page.bg': page,
    'page.bg-elevated': elevated,
    'page.bg-overlay': sem('page.bg-overlay', mode),
    'hidden stripe': over(page, stripe),
    'accent wash on the toolbar': over(elevated, accentSoft),
    'accent wash on the editor': over(page, accentSoft),
  }
}

/** The tint behind a hidden eye (and its hover), which holds only the eye itself. */
const eyeTints = (mode: Mode) => [0.12, 0.18].flatMap((a) => [sem('page.bg', mode), sem('page.bg-elevated', mode)].map((bg) => over(bg, [251, 146, 60, a])))

// ── CV-STUDIO-CONTRAST: tokens ─────────────────────────────────────────────

/** Where each kind of word sits: everywhere, or (errors) on the editor, menus and banners. */
const PANELS = ['page.bg', 'page.bg-elevated', 'page.bg-overlay']

test('CV-STUDIO-CONTRAST: the studio’s words — quiet, accent, hidden, error — are ≥ 4.5:1 on every surface they sit on, in both modes', () => {
  for (const mode of MODES) {
    for (const [where, bg] of Object.entries(surfaces(mode))) {
      for (const [name, fg, only] of [
        ['page.fg-subtle (faint: counts, indexes, hints)', sem('page.fg-subtle', mode)],
        ['page.fg-secondary (dim, and hidden fields’ text)', sem('page.fg-secondary', mode)],
        ['accent.text (selected toggles, eyebrows)', sem('accent.text', mode)],
        ['--admin-hidden-fg (hidden chips and counts)', HIDDEN_FG[mode]],
        ['status.error (Delete rows, errors)', sem('status.error', mode), PANELS],
      ] as const) {
        if (only && !only.includes(where)) continue
        const ratio = contrast(fg, bg)
        assert.ok(ratio >= 4.5, `${name} on ${where} (${mode}) = ${ratio.toFixed(2)}`)
      }
    }
  }
  // What failed before: the brand accent as text, gray.500 as faint text, orange.600 as hidden text.
  assert.ok(contrast('#6366f1', surfaces('light')['accent wash on the toolbar']) < 4.5, 'the old EN toggle colour')
  assert.ok(contrast('#6366f1', sem('page.bg-elevated', 'light')) < 4.5, 'the old Linked colour')
  assert.ok(contrast(colour('orange.600'), sem('page.bg-elevated', 'light')) < 4.5, 'the old Hidden colour')
  assert.ok(contrast(colour('gray.500'), sem('page.bg-elevated', 'light')) < 4.5, 'the old faint colour')
})

test('CV-STUDIO-CONTRAST: field edges, switch tracks and thumbs, and the focus ring are ≥ 3:1 against what is next to them', () => {
  for (const mode of MODES) {
    for (const [where, bg] of Object.entries(surfaces(mode))) {
      assert.ok(contrast(CONTROL_BORDER[mode], bg) >= 3, `control border on ${where} (${mode}) = ${contrast(CONTROL_BORDER[mode], bg).toFixed(2)}`)
      assert.ok(contrast('#6366f1', bg) >= 3, `focus ring on ${where} (${mode}) = ${contrast('#6366f1', bg).toFixed(2)}`)
    }
    // A hidden eye: the icon on its own tint.
    for (const tint of eyeTints(mode)) assert.ok(contrast(HIDDEN_FG[mode], tint) >= 3, `hidden eye on ${tint} (${mode})`)
    // A switch: the "off" track is the control border, "on" the 500 shade; the thumb is white.
    const on = colour('purple.500')
    for (const bg of [sem('page.bg', mode), sem('page.bg-elevated', mode)]) {
      assert.ok(contrast(on, bg) >= 3, `switch on track (${mode})`)
      assert.ok(contrast(CONTROL_BORDER[mode], bg) >= 3, `switch off track (${mode})`)
    }
    assert.ok(contrast('#ffffff', on) >= 3, `thumb on the on track (${mode})`)
    assert.ok(contrast('#ffffff', CONTROL_BORDER[mode]) >= 3, `thumb on the off track (${mode})`)
  }
  // Before: Chakra's dark "on" track (purple.200) hid the white thumb; its light "off" track (gray.300) the track itself.
  assert.ok(contrast('#ffffff', colour('purple.200')) < 3)
  assert.ok(contrast(colour('gray.300'), sem('page.bg', 'light')) < 3)
})

test('CV-STUDIO-CONTRAST: the admin publishes its colour tokens as CSS variables for both modes (admin pages only)', () => {
  assert.deepEqual(Object.keys(ADMIN_COLOR_VARS), ['--control-border', '--admin-hidden-fg'])
  assert.equal(
    ADMIN_GLOBAL_CSS,
    `:root{--control-border:${CONTROL_BORDER.light};--admin-hidden-fg:${HIDDEN_FG.light}}[data-theme='dark'],.chakra-ui-dark{--control-border:${CONTROL_BORDER.dark};--admin-hidden-fg:${HIDDEN_FG.dark}}`,
  )
  // The hidden pair is the admin's warning-text pair (shell/ui warnTextProps).
  assert.equal(HIDDEN_FG.light, colour('orange.700').toLowerCase())
  assert.equal(HIDDEN_FG.dark, colour('orange.300').toLowerCase())
  assert.match(read('components/Admin/shell/ui.tsx'), /warnTextProps = \{ color: 'orange\.700', _dark: \{ color: 'orange\.300' \} \}/)
  assert.ok(!('page.admin-hidden-fg' in semanticColors), 'not in the public theme')
})

// ── CV-STUDIO-CONTRAST: admin theme ───────────────────────────────────────

const props = (mode: Mode, extra: Record<string, unknown> = {}) => ({ colorMode: mode, colorScheme: 'purple', theme, ...extra })

test('CV-STUDIO-CONTRAST: admin text fields — a ≥ 3:1 edge that darkens on hover, readable placeholders, focus and invalid rings untouched', () => {
  const input = withAdminFieldContrast(appTheme.components.Input, true) as any
  const textarea = withAdminFieldContrast(appTheme.components.Textarea, false) as any
  const select = withAdminFieldContrast(appTheme.components.Select, true) as any
  for (const mode of MODES) {
    const p = props(mode, { focusBorderColor: 'accent.500' })
    for (const [name, field, stock] of [
      ['Input', input.variants.outline(p).field, appTheme.components.Input.variants.outline(p).field],
      ['Select', select.variants.outline(p).field, appTheme.components.Select.variants.outline(p).field],
      ['Textarea', textarea.variants.outline(p), appTheme.components.Textarea.variants.outline(p)],
    ] as const) {
      assert.equal(field.borderColor, 'var(--control-border)', name)
      assert.equal(field._hover.borderColor, 'page.fg-subtle', name)
      assert.deepEqual(field._focusVisible, stock._focusVisible, `${name}: focus ring as Chakra draws it`)
      assert.equal(field._focusVisible.borderColor, '#6366f1', `${name}: the accent, resolved`)
      assert.deepEqual(field._invalid, stock._invalid, `${name}: invalid ring as Chakra draws it`)
      // Keys keep Chakra's order, so focus and invalid still win over hover.
      assert.deepEqual(Object.keys(field), Object.keys(stock), name)
    }
    assert.deepEqual(input.baseStyle(p).field._placeholder, { color: 'page.fg-subtle' })
    assert.deepEqual(select.baseStyle(p).field._placeholder, { color: 'page.fg-subtle' })
    assert.deepEqual(textarea.baseStyle(p)._placeholder, { color: 'page.fg-subtle' })
  }
  assert.deepEqual(FIELD_BOUNDARY, { borderColor: 'var(--control-border)', hover: 'page.fg-subtle', placeholder: 'page.fg-subtle' })
  // Other variants are Chakra's; the unstyled one (the tag field's input) still gets the placeholder colour via baseStyle.
  assert.equal(input.variants.unstyled, appTheme.components.Input.variants.unstyled)
  // Admin only: the public theme (the contact form) is untouched.
  const scope = read('components/Admin/AdminThemeScope.tsx')
  assert.match(scope, /Input: withAdminFieldContrast\(theme\.components\.Input, true\)/)
  assert.match(scope, /Select: withAdminFieldContrast\(theme\.components\.Select, true\)/)
  assert.match(scope, /Textarea: withAdminFieldContrast\(theme\.components\.Textarea, false\)/)
  assert.doesNotMatch(read('theme/chakra.js'), /withAdminFieldContrast|control-border/)
})

test('CV-STUDIO-CONTRAST: admin switches, menus and outline badges', () => {
  const sw = (ADMIN_COMPONENT_STYLES.Switch as any).baseStyle(props('light')).track
  assert.equal(sw['--switch-bg'], 'var(--control-border)')
  assert.equal(sw._dark['--switch-bg'], 'var(--control-border)')
  assert.equal(sw._checked['--switch-bg'], 'colors.purple.500')
  assert.equal(sw._checked._dark['--switch-bg'], 'colors.purple.500')
  assert.ok(sw._focusVisible, 'Chakra’s focus ring kept')

  const menu = (ADMIN_COMPONENT_STYLES.Menu as any).baseStyle(props('light'))
  assert.equal(menu.list['--menu-bg'], 'colors.page.bg-elevated')
  assert.equal(menu.list._dark['--menu-bg'], 'colors.page.bg-elevated')
  assert.equal(menu.list.borderColor, 'page.border-strong')
  for (const state of ['_focus', '_active', '_expanded']) assert.equal(menu.item[state]['--menu-bg'], 'colors.page.bg-overlay', state)
  assert.deepEqual(menu.item._focusVisible, { outline: '2px solid var(--accent)', outlineOffset: '-2px' })
  assert.deepEqual(menu.item._disabled, { opacity: 1, color: 'page.fg-subtle', cursor: 'not-allowed' })

  const badge = ADMIN_COMPONENT_STYLES.Badge as any
  for (const hue of ['orange', 'gray', 'accent']) {
    const v = badge.variants.outline(props('light', { colorScheme: hue }))
    assert.equal(v['--badge-color'], `colors.${hue}.700`, hue)
    assert.ok(v._dark['--badge-color'], `${hue}: dark mode keeps Chakra’s`)
    for (const bg of [sem('page.bg', 'light'), sem('page.bg-elevated', 'light')]) assert.ok(contrast(colour(`${hue}.700`), bg) >= 4.5, hue)
  }
})

// ── CV-STUDIO-CONTRAST: the studio's source ────────────────────────────────

const STUDIO = ['components/Admin/CVEditorStudio.tsx', ...fs.readdirSync(path.join(ROOT, 'components/Admin/cvStudio')).filter((f) => f.endsWith('.tsx')).map((f) => `components/Admin/cvStudio/${f}`)]

test('CV-STUDIO-CONTRAST: studio tokens are the semantic and admin tokens', () => {
  const fields = read('components/Admin/cvStudio/fields.tsx')
  const tokens = fields.slice(fields.indexOf('export function useStudioTokens'), fields.indexOf('export const HIDDEN_CONTENT_SX'))
  assert.match(tokens, /faint: 'page\.fg-subtle'/)
  assert.match(tokens, /accentText: 'accent\.text'/)
  assert.match(tokens, /control: 'var\(--control-border\)'/)
  assert.match(tokens, /hiddenFg: 'var\(--admin-hidden-fg\)'/)
  assert.doesNotMatch(tokens, /gray\.500|orange\.600/)
  // Chakra resolves the focus ring through its own colour parser: a var() becomes #000000 (invisible on the dark page).
  assert.match(fields, /focusBorderColor: 'accent\.500'/)
  assert.doesNotMatch(read('components/Admin/CVEditor.tsx'), /focusBorderColor=\{[^}]*var\(/)
})

test('CV-STUDIO-CONTRAST: no studio text in the raw accent, red.400 or orange.400; no hand-made accent buttons or faint focus rings', () => {
  for (const file of STUDIO) {
    const src = read(file)
    // The brand accent stays for borders, rules, rings and the spinner — never as a text colour.
    const prose = src.split('\n').filter((line) => !/<Spinner\b/.test(line)).join('\n')
    assert.doesNotMatch(prose, /\bcolor[=:]\s*\{?\s*["'`]var\(--accent\)/, `${file}: text in the raw accent`)
    assert.doesNotMatch(src, /\? 'var\(--accent\)' : (undefined|dim|faint)\b/, `${file}: a text colour switching to the raw accent`)
    assert.doesNotMatch(src, /\bcolor[=:]\s*\{?\s*["'](red|orange)\.400["']/, `${file}: red.400 / orange.400 text`)
    assert.doesNotMatch(src, /_hover=\{\{ color: 'red\.400' \}\}/, `${file}: red.400 on hover`)
    assert.doesNotMatch(src, /bg="var\(--accent\)" color="white"/, `${file}: white on the raw accent is 4.47:1 — use primaryButtonProps`)
    assert.doesNotMatch(src, /_focusVisible=\{\{ boxShadow: '0 0 0 2px var\(--accent-ring\)' \}\}/, `${file}: a 35% ring is ~1.6:1`)
  }
})

test('CV-STUDIO-CONTRAST: hidden and switched-off things are muted by colour, never by opacity', () => {
  for (const file of STUDIO) {
    const src = read(file)
    assert.doesNotMatch(src, /opacity=\{(hidden|listHidden|isDismissed|onCv \|\| onWeb|on) \?/, `${file}: opacity dimming`)
    assert.doesNotMatch(src, /opacity=\{0\.5\}/, `${file}: a half-faded control`)
  }
  assert.match(read('components/Admin/cvStudio/fields.tsx'), /export const HIDDEN_CONTENT_SX = \{ '& input, & textarea, & select': \{ color: 'page\.fg-secondary' \} \} as const/)
  const editor = read('components/Admin/cvStudio/SectionEditor.tsx')
  assert.equal(editor.match(/sx=\{(hidden|listHidden) \? HIDDEN_CONTENT_SX : undefined\}/g)?.length, 3, 'compact entry, entry panel, hidden list')
  assert.match(read('components/Admin/cvStudio/fields.tsx'), /<Box sx=\{hidden \? HIDDEN_CONTENT_SX : undefined\}>\{children\}<\/Box>/)
})

// ── DRAFTBAR-ROOM ──────────────────────────────────────────────────────────

test('DRAFTBAR-ROOM: the bar host renders in place on the server and pads the site chrome by the bar’s measured height', () => {
  // The site chrome's column, not the body: html, body and #__next are 100% tall and the page overflows them.
  assert.deepEqual(BOTTOM_BAR_ROOM, { '[data-site-chrome]': { paddingBottom: 'var(--bottom-bar-h, 0px)' } })
  assert.match(read('components/Chrome/SiteChrome.tsx'), /<Box display="flex" flexDirection="column" minHeight="100vh" w="full" data-site-chrome="">/)
  assert.match(read('theme/chakra.js'), /'html, body, #__next': \{ height: '100%' \}/)
  // Server HTML: the bar in place (no portal yet, nothing to shift at hydration).
  const html = renderToStaticMarkup(createElement(BottomBarHost, null, createElement('div', { id: 'bar' }, 'Draft preview')))
  assert.match(html, /<div id="bar">Draft preview<\/div>/)
  const bar = renderToStaticMarkup(createElement(DraftBar, { path: '/blog/example-draft' }))
  assert.match(bar, /role="region" aria-label="Draft preview" data-bottom-bar=""/)
  assert.match(bar, /href="\/api\/admin\/draft\?disable=1&amp;path=%2Fblog%2Fexample-draft"/)
  assert.match(renderToStaticMarkup(createElement(DraftBar, { path: '/work/example', pending: true })), /aria-label="Preview of unpublished changes"/)
  const host = read('components/Common/BottomBarHost.tsx')
  assert.match(host, /useEffect\(\(\) => setHost\(document\.body\), \[\]\)/)
  assert.match(host, /host \? createPortal\(children, host\) : children/)
  assert.match(host, /<Global styles=\{BOTTOM_BAR_ROOM\} \/>/)
})

test('DRAFTBAR-ROOM: the draft bar and the review bar both live in the host; the draft bar still publishes its height and opts out of scroll margins', () => {
  const draft = read('components/Article/DraftBar.tsx')
  assert.match(draft, /<BottomBarHost>\s*<DraftBarBody \{\.\.\.props\} \/>\s*<\/BottomBarHost>/)
  assert.match(draft, /function DraftBarBody\([^)]*\) \{\s*const ref = useRef<HTMLDivElement \| null>\(null\)\s*useBottomBarOffset\(ref\)/)
  assert.match(draft, /data-bottom-bar=""/)
  assert.match(draft, /pb="calc\(10px \+ env\(safe-area-inset-bottom\)\)"/, 'the measured height includes the safe-area inset')
  const review = read('components/Review/ReviewChrome.tsx')
  assert.match(review, /<BottomBarHost>\s*<BarBody \{\.\.\.props\} \/>\s*<\/BottomBarHost>/)
  assert.doesNotMatch(review, /createPortal|paddingBottom/, 'one implementation')
  // Only Draft Mode renders it: visitors' pages never carry the padding.
  for (const page of ['pages/blog/[slug].tsx', 'pages/work/[slug].tsx']) assert.match(read(page), /\{draftMode && <DraftBar path=\{path\} pending=\{pendingPreview\} \/>\}/)
})
