/**
 * Review round 3, accessibility and interaction fixes (fix3-B): the parts
 * that are logic or static styles. The behaviour itself — focus, live
 * regions, contrast and target sizes in the running editor — is checked in
 * e2e/review-r3-ux.spec.ts.
 *
 *   UX-A-1   a node / cell selection keeps the text's own colour
 *   UX-A-2   footer links clear a fixed bottom bar when focused
 *   UX-A-3   editor prompts, errors and menus use the AA status tokens
 *   UX-A-5   the block island's source is named; the hint follows the platform
 *   UX-A-6   the table toolbar's ring shows on script focus
 *   UX-A-10  solid coloured buttons (admin) meet 4.5:1 with white in light mode
 *   UX-A-11  video / figure controls are 24px tall
 *   UX-A-12  the visual-fidelity banner and the preview's error are not alerts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import theme from '../theme/chakra.js'
import { contrastSafeSolid, withContrastSafeSolidButton } from '../theme/adminComponents'
import { semanticColors } from '../theme/color'

const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

type AnyTheme = { colors: Record<string, Record<string, string> | string>; components: Record<string, { variants: Record<string, (p: Record<string, unknown>) => Record<string, any>> }> }
const appTheme = theme as unknown as AnyTheme
/** 'red.600' → its hex in the app theme. */
const colour = (token: string) => {
  const [hue, shade] = token.split('.')
  return (appTheme.colors[hue] as Record<string, string>)[shade]
}

// ── UX-A-10 ────────────────────────────────────────────────────────────────

test('UX-A-10: in light mode a solid button takes the 600 shade (white text ≥ 4.5:1); dark mode and neutral hues stay as Chakra ships them', () => {
  const stock = appTheme.components.Button.variants.solid
  const solid = withContrastSafeSolidButton(appTheme.components.Button).variants.solid
  for (const hue of ['red', 'accent', 'green', 'blue', 'orange', 'teal', 'purple', 'pink']) {
    const light = solid({ colorScheme: hue, colorMode: 'light', theme })
    assert.equal(light.bg, `${hue}.600`, hue)
    assert.equal(light.color, 'white', hue)
    assert.equal(light._hover.bg, `${hue}.700`, hue)
    assert.equal(light._hover._disabled.bg, `${hue}.600`, `${hue}: a disabled button does not change on hover`)
    assert.equal(light._active.bg, `${hue}.800`, hue)
    for (const token of [light.bg, light._hover.bg, light._active.bg]) {
      const ratio = contrast('#ffffff', colour(token))
      assert.ok(ratio >= 4.5, `white on ${token} = ${ratio.toFixed(2)}`)
    }
    assert.deepEqual(solid({ colorScheme: hue, colorMode: 'dark', theme }), stock({ colorScheme: hue, colorMode: 'dark', theme }), `${hue}: dark mode unchanged`)
  }
  // The stock light shade the confirm buttons had: under AA.
  assert.ok(contrast('#ffffff', colour('red.500')) < 4.5)
  for (const hue of ['gray', 'yellow', 'cyan']) assert.deepEqual(solid({ colorScheme: hue, colorMode: 'light', theme }), stock({ colorScheme: hue, colorMode: 'light', theme }), hue)
  // A plain style object works as well as a style function; other variants are untouched.
  assert.equal(contrastSafeSolid({ bg: 'x', _hover: {} })({ colorScheme: 'red', colorMode: 'light' }).bg, 'red.600')
  assert.equal(withContrastSafeSolidButton(appTheme.components.Button).variants.ghost, appTheme.components.Button.variants.ghost)
  // Admin pages get it through the admin theme scope, never the public bundle.
  assert.match(read('components/Admin/AdminThemeScope.tsx'), /Button: withContrastSafeSolidButton\(theme\.components\.Button\)/)
  assert.doesNotMatch(read('theme/chakra.js'), /contrastSafeSolid/)
})

// ── UX-A-1 / UX-A-11 ───────────────────────────────────────────────────────

// editorStyles.ts imports the admin shell (.tsx), so its styles are read as source here.
const editorStyles = () => read('components/Admin/editor/editorStyles.ts')
/** The body of one top-level rule of editorNodeSx. */
const styleRule = (selector: string) => {
  const src = editorStyles()
  const at = src.indexOf(`  '${selector}': {`)
  assert.ok(at >= 0, selector)
  return src.slice(at, src.indexOf('\n  },', at))
}

test('UX-A-1: a hidden (node or cell) selection paints text in its own colour — currentColor, not inherit', () => {
  assert.match(editorStyles(), /'\.tt-prose\.ProseMirror-hideselection \*::selection': \{ color: 'currentColor', background: 'transparent' \}/)
  // The site-wide selection (white on the accent) is still the default everywhere else.
  assert.match(read('theme/chakra.js'), /'::selection': \{\s*background: semanticColors\['accent\.solid'\]\.light,\s*color: semanticColors\['accent\.fg'\]\.light,/)
})

test('UX-A-11: the figure caption and the video title are 24px targets; the video link and Change link too', () => {
  assert.match(styleRule('.tt-figure-caption'), /minH: '24px'/)
  assert.match(styleRule('.tt-video-title'), /minH: '24px'/)
  const video = read('components/Admin/editor/views/VideoView.tsx')
  assert.match(video, /<Link href=\{watch\} isExternal [^>]*display="inline-flex" alignItems="center" minH="24px">/)
  assert.match(video, /fontWeight=\{400\}\s*minH="24px"/)
})

// ── UX-A-2 ─────────────────────────────────────────────────────────────────

test('UX-A-2: focusable things in the footer (outside <main>) carry the header and bottom-bar scroll margins', () => {
  const css = read('styles/globals.css')
  const rule = css.match(/:where\(footer\)\s*:where\(([^)]*)\):where\(\s*:not\(\[data-bottom-bar\], \[data-bottom-bar\] \*\)\s*\)\s*\{([^}]*)\}/)
  assert.ok(rule, 'the :where(footer) scroll-margin rule')
  for (const target of ['[id]', 'a', 'button', 'input', 'select', 'textarea', 'summary', '[tabindex]']) assert.ok(rule[1].split(/,\s*/).includes(target), target)
  assert.match(rule[2], /scroll-margin-top:\s*calc\(var\(--header-h\)\s*\+\s*16px\)/)
  assert.match(rule[2], /scroll-margin-bottom:\s*calc\(var\(--bottom-bar-h,\s*0px\)\s*\+\s*8px\)/, 'the bar, plus air for the focus ring')
  // Still no root scroll padding (it moved the page when focus entered the bars themselves).
  assert.doesNotMatch(css, /scroll-padding-(top|bottom)\s*:/)
  // The review bar publishes its height at every width and the footer is a <footer> outside <main>.
  assert.match(read('components/Review/ReviewChrome.tsx'), /useBottomBarOffset\(ref\)/)
  assert.match(read('components/Footer/Footer.tsx'), /as="footer"/)
})

// ── UX-A-3 ─────────────────────────────────────────────────────────────────

test('UX-A-3: the editor’s prompts, errors, danger items and menus use AA tokens, never red.400 / orange.400 text', () => {
  for (const f of [
    'components/Admin/editor/views/ImageView.tsx',
    'components/Admin/editor/views/VideoView.tsx',
    'components/Admin/editor/views/MdxIslandView.tsx',
    'components/Admin/editor/PopMenu.tsx',
    'components/Admin/editor/ImageBubble.tsx',
    'components/Admin/editor/LinkBubble.tsx',
    'components/Admin/editor/SlashMenu.tsx',
  ]) {
    const src = read(f)
    assert.doesNotMatch(src, /color[=:]\s*["'{]*\s*'?(red|orange)\.400/, `${f}: low-contrast text colour`)
  }
  assert.match(read('components/Admin/editor/PopMenu.tsx'), /it\.danger \? 'status\.error'/)
  assert.match(read('components/Admin/editor/views/ImageView.tsx'), /color=\{fileNameAlt \? 'status\.warning' : 'page\.fg-secondary'\}/)
  // The island's Done and the video's Apply are the primary (accent.solid) buttons.
  for (const f of ['components/Admin/editor/views/MdxIslandView.tsx', 'components/Admin/editor/views/VideoView.tsx']) assert.match(read(f), /\{\.\.\.primaryButtonProps\} onClick=\{(apply|applyUrl)\}/, f)
  // The tokens: AA on every page surface, in both modes.
  for (const token of ['status.error', 'status.warning'] as const)
    for (const mode of ['light', 'dark'] as const)
      for (const bg of ['page.bg', 'page.bg-elevated', 'page.bg-overlay'] as const) {
        const ratio = contrast(semanticColors[token][mode], semanticColors[bg][mode])
        assert.ok(ratio >= 4.5, `${token} on ${bg} (${mode}) = ${ratio.toFixed(2)}`)
      }
  // The audience menu sits on the admin menu surface: its 11px hint on the focused row.
  const audience = read('components/Admin/cvStudio/AudienceMenu.tsx')
  assert.match(audience, /<MenuList bg="page\.bg-elevated"/)
  assert.match(audience, /const ITEM_SURFACE = \{ bg: 'transparent', _hover: \{ bg: 'page\.bg-overlay' \}, _focus: \{ bg: 'page\.bg-overlay' \} \}/)
  for (const mode of ['light', 'dark'] as const) assert.ok(contrast(semanticColors['page.fg-secondary'][mode], semanticColors['page.bg-overlay'][mode]) >= 4.5, mode)
})

// ── UX-A-5 / UX-A-6 / UX-A-12 ──────────────────────────────────────────────

test('UX-A-5: the block island’s source textarea is named, and its hint and keyshortcuts follow the platform', () => {
  const src = read('components/Admin/editor/views/MdxIslandView.tsx')
  assert.match(src, /aria-label=\{label\}/)
  assert.match(src, /label=\{info\.label === 'MDX' \? 'MDX source' : `MDX source: \$\{info\.label\}`\}/)
  assert.match(src, /\{mac \? '⌘↵' : 'Ctrl\+↵'\} apply · Esc cancel/)
  assert.match(src, /aria-keyshortcuts=\{mac \? 'Meta\+Enter Escape' : 'Control\+Enter Escape'\}/)
  // The inline island keeps its visible <label>.
  assert.match(src, /<Text as="label" htmlFor=\{id\}/)
})

test('UX-A-6: Alt+F10 focuses the toolbar as a keyboard move, and the ring shows on :focus too', () => {
  const src = read('components/Admin/editor/TableMenu.tsx')
  assert.match(src, /first\.focus\(\{ focusVisible: true \} as FocusOptions\)/)
  assert.match(src, /'& button:focus, & button:focus-visible': \{ outline: '2px solid var\(--accent\)'/)
  // Only the keyboard ever focuses them.
  assert.match(src, /onMouseDown=\{\(e: React\.MouseEvent\) => e\.preventDefault\(\)\}/)
  assert.match(src, /tabIndex=\{-1\}/)
})

test('UX-A-12: the fidelity banner and the preview’s compile error are not assertive alerts; only the state change is announced', () => {
  const editor = read('components/Admin/RichEditor.tsx')
  assert.match(editor, /<Alert\s+\/\/ Not role="alert"[^\n]*\n\s*addRole=\{false\}/)
  assert.match(editor, /const fidelityState = fidelity\.ok \? 'ok' : fidelity\.reason/)
  assert.match(editor, /\}, \[fidelityState, announce\]\)/)
  const preview = read('components/Admin/shell/LivePreview.tsx')
  const box = preview.slice(preview.indexOf('{state.problem ? ('), preview.indexOf('{problemText(state.problem)}'))
  assert.doesNotMatch(box, /role="alert"/)
  assert.match(preview, /role="status" aria-live="polite">\s*\{status\}/)
})
