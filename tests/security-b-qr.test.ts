/**
 * security-b / I2 — QR codes (lib/qr.ts) are drawn as SVG elements
 * (lib/qrShape.ts, components/Common/QrSvg.tsx) instead of injected markup:
 * no innerHTML when a QR appears after hydration (a Trusted Types sink), and
 * a QR string that is not the expected shape draws nothing.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { register } from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { qrShape } from '../lib/qrShape'
import { qrSvg } from '../lib/qr'

// node:test runs TypeScript but not JSX: transpile the component this file renders.
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
const { default: QrSvg } = await import('../components/Common/QrSvg')

const ROOT = path.join(import.meta.dirname, '..')

test('QR codes are drawn as SVG elements from the server’s path data', async () => {
  const svg = await qrSvg('https://example.com/cv')
  const shape = qrShape(svg)
  assert.ok(shape)
  assert.match(shape.viewBox, /^0 0 \d+ \d+$/)
  assert.equal(shape.paths.length, 1)
  assert.match(shape.paths[0], /^M0 0\.5h/)
  const out = renderToStaticMarkup(createElement(QrSvg, { svg }))
  assert.equal(
    out,
    `<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="${shape.viewBox}" shape-rendering="crispEdges"><path stroke="currentColor" d="${shape.paths[0]}"></path></svg>`,
  )
  // Same drawing as the server's markup (attribute for attribute).
  assert.ok(svg.includes(`viewBox="${shape.viewBox}"`) && svg.includes(`d="${shape.paths[0]}"`))
  for (const f of ['components/CVViewerPage/CvQr.tsx', 'components/Contact/ContactPro.tsx', 'components/Article/ArticleEnd.tsx']) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8')
    assert.match(code, /<QrSvg svg=\{/, f)
  }
})

test('qrShape keeps only a numeric viewBox and path data; anything else draws nothing', () => {
  assert.deepEqual(qrShape('<svg aria-hidden="true" viewBox="0 0 1 1"></svg>'), { viewBox: '0 0 1 1', paths: [] })
  const evil = qrShape('<svg viewBox="0 0 2 2"><script>alert(1)</script><path d="M0 0h1" onload="alert(1)"/><path d="javascript:alert(1)"/><foreignObject><img src=x></foreignObject></svg>')
  assert.deepEqual(evil, { viewBox: '0 0 2 2', paths: ['M0 0h1'] })
  for (const bad of [null, undefined, '', '<div viewBox="0 0 1 1">', '<svg viewBox="0 0 1 x"></svg>', 'text <svg viewBox="0 0 1 1">']) {
    assert.equal(qrShape(bad), null, String(bad))
  }
  assert.equal(renderToStaticMarkup(createElement(QrSvg, { svg: '<p>not a qr</p>' })), '')
})
