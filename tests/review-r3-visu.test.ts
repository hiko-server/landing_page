/**
 * Review round 3, visual findings (fix3-C):
 *   - VISU-5: the image viewer's one-shot zoom (a click, a double tap, the
 *     zoom button) stops where the source runs out of pixels (one file pixel
 *     per CSS pixel, PhotoSwipe's 1:1), and an image already shown at its
 *     full size offers none (lib/lightboxGestures.ts);
 *   - VISU-7: CV Studio's inverse toast shows a plain-text title (before:
 *     an HStack, which drops string children — an empty pill);
 *   - VISU-1 / VISU-3 / VISU-6: the structural guards the e2e checks rest on
 *     (the header's centred grid, Chinese typesetting on every Chinese
 *     page, the palette's group words).
 *
 * The toast is .tsx; a test-local loader transpiles it with the project's
 * TypeScript (JSX → react/jsx-runtime) so it renders under node:test.
 */
import { register } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ChakraProvider } from '@chakra-ui/react'
import {
  DOUBLE_TAP_SCALE,
  IDENTITY,
  MAX_SCALE,
  MIN_ZOOM_GAIN,
  canZoomIn,
  nativeScale,
  sourcePixelWidth,
  toggleZoom,
  zoomInScale,
  type Base,
  type Box,
} from '../lib/lightboxGestures'

register(
  'data:text/javascript,' +
    encodeURIComponent(`
      import { readFileSync } from 'node:fs'
      import { fileURLToPath } from 'node:url'
      import { createRequire } from 'node:module'
      const require = createRequire(${JSON.stringify(new URL('../package.json', import.meta.url).href)})
      const ts = require('typescript')
      export async function load(url, context, next) {
        if (url.startsWith('file:') && url.endsWith('.tsx') && !url.includes('/node_modules/')) {
          const source = readFileSync(fileURLToPath(url), 'utf8')
          const out = ts.transpileModule(source, {
            fileName: fileURLToPath(url),
            compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
          })
          return { format: 'module', source: out.outputText, shortCircuit: true }
        }
        return next(url, context)
      }
    `),
  import.meta.url,
)

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// ── VISU-5: zoom no further than the source's pixels ─────────────────────────

const FIELD_NOTE_SRCSET = '/images/imageScroller/COT.png.w320.webp 320w, /images/imageScroller/COT.png.w480.webp 480w, /images/imageScroller/COT.png.w640.webp 640w, /images/imageScroller/COT.png.w800.webp 800w'

test('VISU-5: a source is as wide as its widest srcset candidate, else its width, else unknown', () => {
  assert.equal(sourcePixelWidth(800, FIELD_NOTE_SRCSET), 800)
  // AVIF and WebP sets are both looked at; the widest wins.
  assert.equal(sourcePixelWidth(undefined, '/a.w320.avif 320w, /a.w1080.avif 1080w', '/a.w320.webp 320w'), 1080)
  // `src` is never picked beside `w` candidates: a larger width attribute does not count.
  assert.equal(sourcePixelWidth(4000, '/b.w640.webp 640w, /b.w1920.webp 1920w'), 1920)
  // No srcset: the image's own width (an article image with width="1122").
  assert.equal(sourcePixelWidth(1122, undefined), 1122)
  assert.equal(sourcePixelWidth(1122, ''), 1122)
  // A density-only srcset or nothing at all: unknown.
  assert.equal(sourcePixelWidth(undefined, '/c.png 1x, /c@2x.png 2x'), 0)
  assert.equal(sourcePixelWidth(undefined), 0)
  // Digits inside the file name are not descriptors.
  assert.equal(sourcePixelWidth(undefined, '/img/w3200x2000.webp 640w'), 640)
})

const base = (width: number, height: number, cx = 640, cy = 400): Base => ({ cx, cy, width, height })

test('VISU-5: an 800 px photo fitted at 800 px (a desktop) has nothing to zoom to: no one-shot zoom', () => {
  const fitted = base(800, 450)
  const view: Box = { left: 0, top: 0, right: 1440, bottom: 900 }
  const native = nativeScale(800, fitted)
  assert.equal(native, 1)
  assert.equal(canZoomIn(native), false)
  // Before the fix this went to 2.5× — 2000 px drawn from an 800 px file.
  assert.equal(zoomInScale(fitted, view, native), 1)
  assert.deepEqual(toggleZoom(IDENTITY, { x: 700, y: 400 }, fitted, view, native), { ...IDENTITY })
})

test('VISU-5: on a phone the same photo zooms to 1:1 (≈2.28×), not to fill the screen (4×)', () => {
  const fitted = base(351, 197, 187, 400)
  const phone: Box = { left: 0, top: 0, right: 375, bottom: 812 }
  const native = nativeScale(800, fitted)
  assert.ok(Math.abs(native - 800 / 351) < 1e-9)
  assert.equal(canZoomIn(native), true)
  // Uncapped it fills the stage (clamped to 4×).
  assert.equal(zoomInScale(fitted, phone), MAX_SCALE)
  assert.ok(Math.abs(zoomInScale(fitted, phone, native) - 800 / 351) < 1e-9)
  const zoomed = toggleZoom(IDENTITY, { x: 187, y: 400 }, fitted, phone, native)
  assert.ok(Math.abs(zoomed.scale - 800 / 351) < 1e-9)
  // And back out.
  assert.deepEqual(toggleZoom(zoomed, { x: 187, y: 400 }, fitted, phone, native), { ...IDENTITY })
})

test('VISU-5: a large source keeps the usual one-shot zoom; an unknown one is not capped', () => {
  const fitted = base(586, 732)
  const view: Box = { left: 0, top: 0, right: 1440, bottom: 900 }
  // 8064 px wide: plenty of pixels, the usual 2.5× (or fill).
  assert.equal(zoomInScale(fitted, view, nativeScale(8064, fitted)), DOUBLE_TAP_SCALE)
  // 1122 px wide fitted at 586: 1.91×.
  assert.ok(Math.abs(zoomInScale(fitted, view, nativeScale(1122, fitted)) - 1122 / 586) < 1e-9)
  assert.equal(nativeScale(0, fitted), Infinity)
  assert.equal(zoomInScale(fitted, view, nativeScale(0, fitted)), DOUBLE_TAP_SCALE)
  // Just past fitted is not worth a zoom; the threshold is the gain constant.
  assert.equal(canZoomIn(MIN_ZOOM_GAIN - 0.01), false)
  assert.equal(canZoomIn(MIN_ZOOM_GAIN), true)
})

test('VISU-5: the viewer gives the engine each image\'s source width and hides the zoom control when there is nothing to zoom to', () => {
  const box = read('components/Common/Lightbox.tsx')
  assert.match(box, /sourcePixelWidth\(item\.width, item\.srcSet, item\.avifSrcSet\)/)
  assert.match(box, /engine\.setSourceWidth\(i, sourceWidth\)/)
  assert.match(box, /zoomable \|\| zoomed \? \(\s*<ZoomButton/)
  const engine = read('components/Common/lightboxEngine.ts')
  assert.match(engine, /zoomInScale\(this\.base, this\.viewBox, native\)/)
  assert.doesNotMatch(engine, /zoomInScale\(this\.base, this\.viewBox\)/, 'every one-shot zoom is capped')
})

// ── VISU-4: the arrows follow the engine's opacity frame by frame ─────────────

test('VISU-4: the previous / next arrows never transition their opacity (only their hover colours)', () => {
  const box = read('components/Common/Lightbox.tsx')
  const arrows = box.match(/aria-label=\{t\.(previousImage|nextImage)\}[\s\S]*?_focusVisible/g) || []
  assert.equal(arrows.length, 2)
  for (const a of arrows) {
    assert.match(a, /style=\{\{ opacity: 'var\(--lb-ui, 1\)' \}\}/)
    assert.match(a, /transitionProperty="background-color, color, box-shadow"/)
  }
})

// ── VISU-7: the inverse toast shows its words ────────────────────────────────

test('VISU-7: CV Studio\'s inverse toast renders a plain-text title (an HStack dropped it: an empty pill)', async () => {
  const { default: InverseToast } = await import('../components/Admin/cvStudio/InverseToast')
  const { default: theme } = await import('../theme/chakra.js')
  const title = '“Email” only on web (English + 中)'
  const html = renderToStaticMarkup(createElement(ChakraProvider, { theme }, createElement(InverseToast, null, title)))
  assert.ok(html.includes('“Email” only on web (English + 中)'), html)
  // Element children (the Undo toast's text + button) still render too.
  const both = renderToStaticMarkup(createElement(ChakraProvider, { theme }, createElement(InverseToast, null, createElement('span', null, 'Removed'), createElement('button', null, 'Undo'))))
  assert.match(both, /<span>Removed<\/span><button>Undo<\/button>/)
  const studio = read('components/Admin/CVEditorStudio.tsx')
  assert.match(studio, /^import InverseToast from '\.\/cvStudio\/InverseToast'$/m)
  assert.doesNotMatch(studio, /function InverseToast/)
})

// ── VISU-1 / VISU-2 / VISU-3 / VISU-6: structure the e2e checks rest on ──────

test('VISU-1: at lg+ the header is a 1fr · auto · 1fr grid with the nav in the middle', () => {
  const header = read('components/Header/Header.tsx')
  assert.match(header, /display=\{\{ base: 'flex', lg: 'grid' \}\}\s*gridTemplateColumns=\{\{ lg: '1fr auto 1fr' \}\}/)
  assert.match(header, /justifySelf="start"/)
  assert.match(header, /justifySelf="end"/)
})

test('VISU-2: under 375 px the language switch is its icon only, the label visually hidden (still its name)', () => {
  const sw = read('components/Header/LanguageSwitch.tsx')
  assert.match(sw, /const ICON_ONLY = '@media screen and \(max-width: 23\.43em\)'/)
  assert.match(sw, /sx=\{\{ \[ICON_ONLY\]: VISUALLY_HIDDEN \}\}/)
  assert.doesNotMatch(sw, /display: 'none'|display="none"/, 'the label is never removed from the accessibility tree')
})

test('VISU-3: Chinese typesetting applies to every Chinese page, not only inside .article-page', () => {
  const css = read('styles/globals.css')
  for (const rule of [
    /html:lang\(zh-Hans\) body,\s*:where\(body \[lang\|='zh-Hans'\]:not\(\.cv-print-area \*\)\) \{\s*font-family: var\(--font-zh-hans\);/,
    /html:lang\(zh-Hans\),\s*:where\(body \[lang\|='zh-Hans'\]:not\(\.cv-print-area \*\)\) \{\s*--chakra-fonts-body: var\(--font-zh-hans\);\s*--chakra-fonts-heading: var\(--font-zh-hans\);/,
    /:where\(html:lang\(zh\) body \[lang\|='en'\]:not\(\.cv-print-area \*\)\) \{\s*font-family: var\(--font-geist-sans\);/,
    /:root :lang\(zh\):not\(\.cv-print-area, \.cv-print-area \*, \[data-script='latin'\], \[data-script='latin'\] \*\) \{\s*letter-spacing: 0;/,
    /html:lang\(zh\),\s*:where\(body \[lang\|='zh'\]:not\(\.cv-print-area \*\)\) \{\s*text-autospace: normal;/,
    /\.cv-print-area:lang\(zh\) \{\s*text-autospace: no-autospace;/,
    /\.page-title:lang\(zh\) \{\s*line-height: 1\.25;/,
    /\.lede:lang\(zh\) \{\s*line-height: 1\.75;/,
  ]) {
    assert.match(css, rule)
  }
  // Every rule of the page-wide layer keys on Chinese (an English page is untouched) or on the CV's A4 sheet.
  const layer = css.slice(css.indexOf('*/', css.indexOf('Chinese text on every page')) + 2, css.indexOf('Lucide interface icons'))
  const selectors = layer.replace(/\/\*[\s\S]*?\*\//g, '').match(/^[^\s@}][^{]*\{/gm) || []
  assert.ok(selectors.length >= 10, String(selectors.length))
  for (const sel of selectors) for (const part of sel.replace(/\{$/, '').split(/,(?![^(]*\))/)) assert.match(part, /zh|cv-print-area/, part)
  assert.match(read('components/General-UI/PageHeader.tsx'), /className="page-title"/)
  assert.match(read('components/CVViewerPage/CVResult.tsx'), /id="print-area" className="cv-print-area"/)
})

test('VISU-6: the palette names a row\'s group in its own words (badges and recent hints)', () => {
  const palette = read('components/General-UI/CommandPalette.tsx')
  assert.match(palette, /\{item\.badge \|\| groupLabel\(item\.group\)\}/)
  assert.match(palette, /const sideHint = row\.group === 'Recent' \? groupLabel\(item\.group\) : item\.hint/)
  assert.doesNotMatch(palette, /\{item\.badge \|\| item\.group\}/)
})
