import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * Renders the inline chrome icons with react-dom/server. Node's type
 * stripping does not cover .tsx, so the component file is transpiled with
 * the project's TypeScript (JSX → react/jsx-runtime, CommonJS) and evaluated
 * with the project's require.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const projectRequire = createRequire(path.join(ROOT, 'package.json'))
const ts = projectRequire('typescript') as typeof import('typescript')
const React = projectRequire('react') as typeof import('react')
const { renderToStaticMarkup } = projectRequire('react-dom/server') as typeof import('react-dom/server')

function loadTsx<T>(rel: string): T {
  const source = readFileSync(path.join(ROOT, rel), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: rel,
  })
  const cjs = { exports: {} as Record<string, unknown> }
  new Function('require', 'module', 'exports', outputText)(projectRequire, cjs, cjs.exports)
  return cjs.exports as T
}

type IconComponent = React.ComponentType<Record<string, unknown>>

const brand = loadTsx<Record<string, IconComponent>>('components/Icons/brand.tsx')

const EXPECTED_VIEWBOX: Record<string, string> = {
  GitHubIcon: '0 0 496 512',
  GitLabIcon: '0 0 512 512',
  LinkedInIcon: '0 0 448 512',
  WhatsAppIcon: '0 0 448 512',
  MenuIcon: '0 0 17 17',
}

test('each brand icon renders a decorative, currentColor SVG with its viewBox', () => {
  for (const [name, viewBox] of Object.entries(EXPECTED_VIEWBOX)) {
    const Icon = brand[name]
    assert.ok(Icon, `${name} is exported`)
    const html = renderToStaticMarkup(React.createElement(Icon))
    assert.match(html, /^<svg[^>]*>/, name)
    assert.ok(html.includes('aria-hidden="true"'), `${name} aria-hidden`)
    assert.ok(html.includes('focusable="false"'), `${name} not focusable`)
    assert.ok(html.includes(`viewBox="${viewBox}"`), `${name} viewBox`)
    assert.ok(html.includes('fill="currentColor"'), `${name} inherits the text colour`)
    assert.ok(html.includes('width="1em"') && html.includes('height="1em"'), `${name} defaults to 1em`)
    assert.match(html, /<path d="M[^"]+"/, `${name} has path data`)
  }
})

test('icons accept a size and extra SVG props, and forward refs', () => {
  const html = renderToStaticMarkup(React.createElement(brand.GitHubIcon, { size: 24, className: 'x', 'data-test': 'y' }))
  assert.ok(html.includes('width="24"') && html.includes('height="24"'))
  assert.ok(html.includes('class="x"') && html.includes('data-test="y"'))
  assert.equal((brand.GitHubIcon as unknown as { $$typeof: symbol }).$$typeof, Symbol.for('react.forward_ref'))
})

test('the theme icon is one decorative SVG: masked disc, moving cut-out, eight rays, unique mask id', () => {
  const { default: ThemeIcon } = loadTsx<{ default: IconComponent }>('components/Header/ThemeIcon.tsx')
  const html = renderToStaticMarkup(
    React.createElement(React.Fragment, null, React.createElement(ThemeIcon), React.createElement(ThemeIcon, { size: 18 })),
  )
  const svgs = html.match(/<svg[^>]*>/g) || []
  assert.equal(svgs.length, 2)
  assert.ok(svgs[0].includes('width="20"') && svgs[1].includes('width="18"'))
  assert.ok(svgs.every((s) => s.includes('aria-hidden="true"') && s.includes('viewBox="0 0 24 24"')))
  const ids = [...html.matchAll(/<mask id="([^"]+)"/g)].map((m) => m[1])
  assert.equal(ids.length, 2)
  assert.notEqual(ids[0], ids[1], 'two icons on one page never share a mask')
  for (const id of ids) {
    assert.match(id, /^[\w-]+$/, 'a plain token, usable inside url(#…)')
    assert.ok(html.includes(`mask="url(#${id})"`))
  }
  assert.equal((html.match(/<line /g) || []).length, 16, 'eight rays per icon')
  assert.ok(html.includes('class="theme-icon__cut"') && html.includes('class="theme-icon__core"') && html.includes('class="theme-icon__rays"'))
})

test('the CSS drives the icon from data-theme (first paint correct without JS)', () => {
  const css = readFileSync(path.join(ROOT, 'styles/globals.css'), 'utf8')
  assert.match(css, /:root\[data-theme='dark'\] \.theme-icon__core\s*\{[^}]*scale\(1\.8\)/)
  assert.match(css, /:root\[data-theme='dark'\] \.theme-icon__cut\s*\{[^}]*translateX/)
  assert.match(css, /:root\[data-theme='dark'\] \.theme-icon__rays\s*\{[^}]*scale\(0\) rotate\(-30deg\)/)
  assert.match(css, /\.theme-icon__rays\s*\{[^}]*transition:[^}]*300ms var\(--ease-out-quart\)/)
})
