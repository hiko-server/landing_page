/**
 * Theme, a11y, print and <head> fixes:
 *   FIX-10 Geist Mono falls back to metric-matched monospace faces, not Arial
 *   FIX-11 print: light palette in dark mode, named CV page, margins, URLs, <details>
 *   FIX-15 the English chrome is lang="en" on non-English pages
 *   FIX-16 header glass and form-error text keep AA contrast
 *   FIX-17 CV sections and /work use semantic tokens, not useColorModeValue
 *   FIX-18 one icon set, one mode-aware theme-color, no X-UA-Compatible
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vm from 'node:vm'
import React from 'react'
import { chakraColorVar, palette, printColorVariables, semanticColors, themeColorFor } from '../theme/color'
import { GEIST_MONO_METRICS, MONO_FALLBACKS, monoFallbackFontFaces, monoFallbackOverrides } from '../lib/monoFallback'
import { installPrintDetails, openDetailsForPrint, printableLinkUrl, textOfNode } from '../lib/print'
import { CHROME_LANG, chromeLangFor, isEnglishLang } from '../components/Chrome/chromeLang'
import { THEME_COLOR_SELECTOR, applyThemeColor, modeOfDataTheme, syncThemeColorMeta } from '../components/Chrome/themeColor'
import { THEME_COLOR_PREPAINT_SCRIPT } from '../lib/themePrepaint'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const projectRequire = createRequire(path.join(ROOT, 'package.json'))

// ── contrast helpers ────────────────────────────────────────────────────────

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
/** rgba(r,g,b,a) composited over an opaque #rrggbb backdrop. */
function over(rgba: string, backdrop: string): string {
  const m = rgba.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/)
  assert.ok(m, `parsable rgba: ${rgba}`)
  const a = Number(m[4])
  const ch = (i: number, fg: number) => Math.round(fg * a + parseInt(backdrop.slice(i, i + 2), 16) * (1 - a))
  return '#' + [ch(1, Number(m[1])), ch(3, Number(m[2])), ch(5, Number(m[3]))].map((v) => v.toString(16).padStart(2, '0')).join('')
}

// ── FIX-16: contrast ────────────────────────────────────────────────────────

test('header text keeps AA over the glass even with the opposite extreme scrolling underneath', () => {
  // Dark mode scrolls the white CV sheet under the header; light mode can
  // scroll a dark photo under it. Every text token the header uses must stay
  // ≥ 4.5:1 there (the old 0.75 alpha gave 3.76:1 / 2.82:1 in dark mode).
  const worstBackdrop = { dark: '#ffffff', light: '#000000' } as const
  const texts = ['page.fg', 'page.fg-secondary', 'page.fg-subtle', 'accent.text'] as const
  for (const mode of ['light', 'dark'] as const) {
    const glass = semanticColors['page.header-bg'][mode]
    for (const backdrop of [worstBackdrop[mode], semanticColors['page.bg'][mode]]) {
      const bg = over(glass, backdrop)
      for (const t of texts) {
        const ratio = contrast(semanticColors[t][mode], bg)
        assert.ok(ratio >= 4.5, `${t} on header glass over ${backdrop} (${mode}) = ${ratio.toFixed(2)}`)
      }
    }
  }
  // The regression itself: the previous glass over the white sheet.
  assert.ok(contrast(semanticColors['page.fg-subtle'].dark, over('rgba(5,5,5,0.75)', '#ffffff')) < 4.5)
})

test('form error text (status.error) meets AA on every page background in both modes', () => {
  for (const mode of ['light', 'dark'] as const) {
    for (const b of ['page.bg', 'page.bg-elevated', 'page.bg-overlay'] as const) {
      const ratio = contrast(semanticColors['status.error'][mode], semanticColors[b][mode])
      assert.ok(ratio >= 4.5, `status.error on ${b} (${mode}) = ${ratio.toFixed(2)}`)
    }
  }
  // Chakra's red.500 — what FormErrorMessage used in light mode — is below AA on paper.
  assert.ok(contrast('#e53e3e', palette.paper) < 4.5)
  const theme = read('theme/chakra.js')
  assert.match(theme, /FormError:\s*\{\s*baseStyle:\s*\{\s*text:\s*\{\s*color:\s*'status\.error'\s*\}/)
  assert.match(theme, /requiredIndicator:\s*\{\s*color:\s*'status\.error'\s*\}/)
  const contact = read('components/Contact/ContactPro.tsx')
  assert.doesNotMatch(contact, /color="red\.500"/, 'no red.500 text on the contact form')
})

// ── FIX-17: semantic tokens ─────────────────────────────────────────────────

test('CV sections and /work use semantic tokens, never useColorModeValue or raw colours', () => {
  const files = [
    'components/PersonalInstruction/_CVSectionShell.tsx',
    'components/PersonalInstruction/Education.tsx',
    'components/PersonalInstruction/ExtraSkill.tsx',
    'components/PersonalInstruction/Patents.tsx',
    'components/PersonalInstruction/Skill.tsx',
    'components/PersonalInstruction/Certificate.tsx',
    'components/PersonalInstruction/CompetitionAwards.tsx',
    'components/PersonalInstruction/Project.tsx',
    'components/PersonalInstruction/WorkExperience.tsx',
    'pages/work/index.tsx',
  ]
  for (const f of files) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    assert.doesNotMatch(code, /useColorModeValue/, f)
    assert.doesNotMatch(code, /'(gray|purple|green)\.\d00'/, `${f}: Chakra palette colour instead of a token`)
  }
  const work = read('pages/work/index.tsx')
  assert.doesNotMatch(work, /#22c55e/i)
  assert.match(work, /'status\.live'/)
  assert.match(work, /'status\.live-border'/)
  assert.ok('status.live-border' in semanticColors)
})

// ── FIX-11: print ───────────────────────────────────────────────────────────

test('print maps every semantic colour to its light (paper) value', () => {
  const vars = printColorVariables()
  assert.equal(Object.keys(vars).length, Object.keys(semanticColors).length)
  for (const [name, { light }] of Object.entries(semanticColors)) {
    assert.equal(vars[chakraColorVar(name)], light, name)
  }
  assert.equal(chakraColorVar('page.bg-elevated'), '--chakra-colors-page-bg-elevated')
  assert.equal(chakraColorVar('accent.solid-hover'), '--chakra-colors-accent-solid-hover')
  // theme/chakra.js emits them under @media print with a selector that
  // outranks Chakra's own `:root[data-theme=dark]` variables.
  assert.match(read('theme/chakra.js'), /'@media print':\s*\{\s*'html:root\[data-theme\]':\s*printColorVariables\(\)/)
})

test('print stylesheet: margins for every page, a named A4 page for the CV, light code colours, URLs', () => {
  const css = read('styles/globals.css')
  const defaultPage = css.match(/@page\s*\{([^}]*)\}/)?.[1] ?? ''
  assert.match(defaultPage, /margin:\s*18mm 16mm/)
  assert.doesNotMatch(defaultPage, /size:/, 'other pages keep the visitor’s paper size')
  assert.match(css, /@page cv\s*\{\s*size:\s*A4;\s*margin:\s*0;\s*\}/)
  const print = css.slice(css.indexOf('@media print {'))
  assert.match(print, /body:has\(#print-area\)\s*\{\s*page:\s*cv;/)
  // The 210mm sheet width applies to the CV only, not to every printed page.
  assert.match(print, /html:has\(#print-area\),\s*body:has\(#print-area\)\s*\{\s*width:\s*210mm !important;/)
  assert.doesNotMatch(print.match(/html,\s*body\s*\{[^}]*\}/)?.[0] ?? '', /width:/)
  assert.match(print, /html\s*\{\s*color-scheme:\s*light !important;/)
  assert.match(print, /\[data-theme='dark'\] \[data-rehype-pretty-code-figure\] code span\s*\{\s*color:\s*var\(--shiki-light\)/)
  assert.match(print, /\.article-prose a\[data-print-url\]::after\s*\{\s*content:\s*' \(' attr\(data-print-url\) '\)'/)
})

test('external link URLs are printed unless the link text already shows them', () => {
  assert.equal(printableLinkUrl('https://www.youtube.com/watch?v=x', 'Demo'), 'https://www.youtube.com/watch?v=x')
  assert.equal(printableLinkUrl(' https://example.com/a ', 'Example'), 'https://example.com/a')
  // Text that is the URL, with or without scheme / www / trailing slash.
  assert.equal(printableLinkUrl('https://carboy.hikosphere.com', 'carboy.hikosphere.com'), undefined)
  assert.equal(printableLinkUrl('https://example.com/a/', 'https://www.example.com/a'), undefined)
  assert.equal(printableLinkUrl('http://Example.com', 'example.com/'), undefined)
  // Linked images (no text), mail and phone links print nothing.
  assert.equal(printableLinkUrl('https://example.com', ''), undefined)
  assert.equal(printableLinkUrl('mailto:a@b.c', 'Mail me'), undefined)
  assert.equal(printableLinkUrl('tel:+85200000000', 'Call'), undefined)

  assert.equal(textOfNode(['Car ', React.createElement('strong', null, 'Boy'), ' ', 3]), 'Car Boy 3')
  assert.equal(textOfNode(React.createElement('img', { alt: 'x' })), '')
  assert.equal(textOfNode(null), '')
  assert.match(read('components/MDX/MDXContent.tsx'), /data-print-url=\{printableLinkUrl\(safe, textOfNode\(children\)\)\}/)
})

test('closed <details> are opened for printing and closed again afterwards', () => {
  const closed = [{ open: false }, { open: false }]
  const already = { open: true }
  const selectors: string[] = []
  const doc = {
    querySelectorAll(selector: string) {
      selectors.push(selector)
      return closed.filter((d) => !d.open)
    },
  }
  const restore = openDetailsForPrint(doc)
  assert.deepEqual(selectors, ['details:not([open])'])
  assert.deepEqual(closed.map((d) => d.open), [true, true])
  restore()
  assert.deepEqual(closed.map((d) => d.open), [false, false])
  assert.equal(already.open, true)

  const listeners = new Map<string, () => void>()
  const win = {
    document: doc,
    addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
    removeEventListener: (type: string, fn: () => void) => {
      if (listeners.get(type) === fn) listeners.delete(type)
    },
  }
  const uninstall = installPrintDetails(win)
  listeners.get('beforeprint')!()
  assert.deepEqual(closed.map((d) => d.open), [true, true])
  listeners.get('afterprint')!()
  assert.deepEqual(closed.map((d) => d.open), [false, false])
  // Cleanup removes both listeners and restores a print still in progress.
  listeners.get('beforeprint')!()
  uninstall()
  assert.equal(listeners.size, 0)
  assert.deepEqual(closed.map((d) => d.open), [false, false])
})

// ── FIX-10: mono fallback ───────────────────────────────────────────────────

test('Geist Mono metrics in lib/monoFallback.ts match the shipped font file', () => {
  const mod = projectRequire('next/dist/compiled/@next/font/dist/fontkit')
  const create = (mod.default?.default || mod.default || mod) as (buf: Buffer) => any
  const font = create(readFileSync(path.join(ROOT, 'public/fonts/GeistMono-Variable.woff2')))
  assert.equal(font.unitsPerEm, GEIST_MONO_METRICS.unitsPerEm)
  assert.equal(font.ascent, GEIST_MONO_METRICS.ascent)
  assert.equal(font.descent, GEIST_MONO_METRICS.descent)
  assert.equal(font.lineGap, GEIST_MONO_METRICS.lineGap)
  const widths = new Set(font.glyphsForString('DATE READ TAGS 0123456789 aiWm-·:').map((g: any) => g.advanceWidth))
  assert.deepEqual([...widths], [GEIST_MONO_METRICS.advance], 'monospace: one advance width')
})

test('fallback faces are scaled so every glyph is exactly as wide as Geist Mono', () => {
  assert.deepEqual(monoFallbackOverrides({ advance: 1233, unitsPerEm: 2048 }), {
    sizeAdjust: '99.66%',
    ascentOverride: '100.84%',
    descentOverride: '29.60%',
    lineGapOverride: '0.00%',
  })
  assert.deepEqual(monoFallbackOverrides({ advance: 1126, unitsPerEm: 2048 }), {
    sizeAdjust: '109.13%',
    ascentOverride: '92.09%',
    descentOverride: '27.03%',
    lineGapOverride: '0.00%',
  })
  for (const f of MONO_FALLBACKS) {
    const scale = parseFloat(monoFallbackOverrides(f).sizeAdjust) / 100
    const width = (f.advance / f.unitsPerEm) * scale
    assert.ok(Math.abs(width - 0.6) < 0.0001, `${f.family}: ${width}em per glyph`)
  }
  const css = monoFallbackFontFaces()
  for (const f of MONO_FALLBACKS) {
    assert.ok(css.includes(`font-family:"${f.family}"`), f.family)
    for (const name of f.locals) assert.ok(css.includes(`local("${name}")`), name)
  }
  assert.equal((css.match(/@font-face/g) || []).length, MONO_FALLBACKS.length)
})

test('the advance widths assumed for installed fallbacks match the system fonts (where present)', () => {
  const mod = projectRequire('next/dist/compiled/@next/font/dist/fontkit')
  const create = (mod.default?.default || mod.default || mod) as (buf: Buffer) => any
  const files: Record<string, string> = {
    'Geist Mono Fallback Menlo': '/System/Library/Fonts/Menlo.ttc',
    'Geist Mono Fallback Courier': '/System/Library/Fonts/Supplemental/Courier New.ttf',
  }
  for (const f of MONO_FALLBACKS) {
    const file = files[f.family]
    if (!file || !existsSync(file)) continue
    const opened = create(readFileSync(file))
    const font = opened.fonts ? opened.fonts[0] : opened
    assert.equal(font.unitsPerEm, f.unitsPerEm, f.family)
    assert.deepEqual([...new Set(font.glyphsForString('DATE 0123 aiWm').map((g: any) => g.advanceWidth))], [f.advance], f.family)
  }
})

test('the mono face uses the metric-matched fallbacks instead of next/font’s Arial', () => {
  const app = read('pages/_app.tsx')
  const monoCall = app.match(/const mono = localFont\(\{([\s\S]*?)\n\}\)/)?.[1] ?? ''
  assert.match(monoCall, /adjustFontFallback:\s*false/)
  const fallback = [...(monoCall.match(/fallback:\s*\[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
  assert.deepEqual(fallback.slice(0, MONO_FALLBACKS.length), MONO_FALLBACKS.map((f) => f.family))
  assert.ok(fallback.includes('monospace'))
  assert.match(app, /const FONT_VARIABLES_CSS = `\$\{monoFallbackFontFaces\(\)\}:root\{/)
  // The sans face keeps its metric-adjusted Arial fallback.
  assert.match(app.match(/const sans = localFont\(\{([\s\S]*?)\n\}\)/)?.[1] ?? '', /adjustFontFallback:\s*'Arial'/)
})

// ── FIX-15: language of the chrome ──────────────────────────────────────────

test('the English chrome is lang="en" only inside a non-English document', () => {
  assert.equal(CHROME_LANG, 'en')
  for (const l of ['en', 'en-GB', 'EN-us']) {
    assert.equal(isEnglishLang(l), true, l)
    assert.equal(chromeLangFor(l), undefined, l)
  }
  for (const l of ['zh-Hans', 'zh', 'ja', 'eng-x', '', null, undefined]) assert.equal(chromeLangFor(l), 'en', String(l))
  const app = read('pages/_app.tsx')
  assert.match(app, /const chromeLang = chromeLangFor\(lang\)/)
  assert.match(app, /<ChromeLangContext\.Provider value=\{chromeLang\}>/)
  const chrome = read('components/Chrome/SiteChrome.tsx')
  assert.match(chrome, /className="skip-nav no-print" href="#main" lang=\{chromeLang\}/)
  assert.equal((chrome.match(/lang=\{chromeLang\}/g) || []).length, 3, 'skip link, header, footer')
  assert.match(read('components/Header/MobileDrawer.tsx'), /<DrawerContent lang=\{chromeLang\}/)
  assert.match(read('components/General-UI/CommandPalette.tsx'), /aria-label="Command palette"\s*lang=\{chromeLang\}/)
  for (const f of ['components/Header/Header.tsx', 'components/General-UI/CommandPalette.tsx']) {
    const code = read(f)
    assert.match(code, /useChromeToast\(\)/, f)
    assert.doesNotMatch(code, /\buseToast\b/, f)
  }
})

// ── FIX-18: <head> ──────────────────────────────────────────────────────────

test('one icon set, one theme-color, no X-UA-Compatible', () => {
  const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  const app = code('pages/_app.tsx')
  const head = code('components/General-UI/CustomHead.tsx')
  const doc = code('pages/_document.tsx')
  const all = [app, head, doc].join('\n')
  // One icon set: the adaptive SVG plus its ICO fallback (chrome-identity A3).
  assert.equal((all.match(/rel="icon"/g) || []).length, 2)
  assert.equal((all.match(/rel="icon" type="image\/svg\+xml"/g) || []).length, 1)
  assert.equal((all.match(/rel="apple-touch-icon"/g) || []).length, 1)
  assert.equal((all.match(/name="theme-color"/g) || []).length, 1)
  assert.doesNotMatch(all, /X-UA-Compatible/i)
  assert.doesNotMatch(head, /themeColor|VPColor/)
  // The icons point at files that exist.
  for (const href of [...app.matchAll(/rel="(?:icon|apple-touch-icon)"[^>]*?href="([^"]+)"/g)].map((m) => m[1])) {
    assert.ok(existsSync(path.join(ROOT, 'public', href)), href)
  }
  assert.match(app, /href="\/icons\/apple-touch-icon\.png"/)
  // The single tag starts at the dark default and is corrected before first paint.
  assert.match(doc, /<meta name="theme-color" content=\{themeColorFor\(initialColorMode\)\} \/>/)
  assert.match(doc, /<script dangerouslySetInnerHTML=\{\{ __html: THEME_PREPAINT_SCRIPT \}\} \/>\s*<script dangerouslySetInnerHTML=\{\{ __html: THEME_COLOR_PREPAINT_SCRIPT \}\} \/>/)
  assert.doesNotMatch(read('components/Chrome/ThemeColorMeta.tsx'), /next\/head/, 'never re-applied by next/head on hydration')
})

/** A tiny document with one theme-color meta and an <html data-theme>. */
function fakeDocument(theme: string | null) {
  const attrs: Record<string, string> = { content: '#123456' }
  const root = { theme, getAttribute: (name: string) => (name === 'data-theme' ? root.theme : null) }
  return {
    attrs,
    root,
    doc: {
      documentElement: root,
      querySelector: (selector: string) =>
        selector === THEME_COLOR_SELECTOR ? { setAttribute: (name: string, value: string) => (attrs[name] = value) } : null,
    },
  }
}

test('the pre-paint script points theme-color at the stored mode', () => {
  for (const [theme, expected] of [
    ['light', themeColorFor('light')],
    ['dark', themeColorFor('dark')],
    [null, themeColorFor('dark')],
  ] as const) {
    const { doc, attrs } = fakeDocument(theme)
    vm.runInNewContext(THEME_COLOR_PREPAINT_SCRIPT, { document: doc })
    assert.equal(attrs.content, expected, String(theme))
  }
  // Never throws, even without the tag.
  vm.runInNewContext(THEME_COLOR_PREPAINT_SCRIPT, { document: { documentElement: { getAttribute: () => 'light' }, querySelector: () => null } })
  assert.equal(modeOfDataTheme('light'), 'light')
  assert.equal(modeOfDataTheme('dark'), 'dark')
  assert.equal(modeOfDataTheme(undefined), 'dark')
})

test('after hydration theme-color follows every data-theme change', () => {
  const { doc, attrs, root } = fakeDocument('dark')
  applyThemeColor(doc)
  assert.equal(attrs.content, '#050505')
  let callback: (() => void) | null = null
  let observed: unknown = null
  let disconnected = false
  class FakeObserver {
    constructor(cb: () => void) {
      callback = cb
    }
    observe(target: unknown, options: { attributes: boolean; attributeFilter: string[] }) {
      observed = target
      assert.deepEqual(options, { attributes: true, attributeFilter: ['data-theme'] })
    }
    disconnect() {
      disconnected = true
    }
  }
  root.theme = 'light'
  const stop = syncThemeColorMeta(doc, FakeObserver)
  assert.equal(attrs.content, '#fdfdfd', 'applied immediately')
  assert.equal(observed, root)
  root.theme = 'dark'
  callback!()
  assert.equal(attrs.content, '#050505', 'follows the toggle')
  stop()
  assert.equal(disconnected, true)
})
