import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * B3 — one outline icon set on public pages (Lucide, ISC), sized on the
 * 4 px grid; no font-dependent glyph icons (▾ ▸ ★ ✓), no react-icons or
 * @chakra-ui/icons outside the admin; licence notice on /colophon.
 *
 * The .tsx icon modules are transpiled with the project's TypeScript and
 * rendered with react-dom/server (node:test cannot import .tsx).
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const projectRequire = createRequire(path.join(ROOT, 'package.json'))
const ts = projectRequire('typescript') as typeof import('typescript')
const React = projectRequire('react') as typeof import('react')
const { renderToStaticMarkup } = projectRequire('react-dom/server') as typeof import('react-dom/server')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, '$1')

const cache = new Map<string, Record<string, unknown>>()
/** Transpile + evaluate a .tsx module, resolving its relative imports the same way. */
function loadTsx(abs: string): Record<string, unknown> {
  const hit = cache.get(abs)
  if (hit) return hit
  const { outputText } = ts.transpileModule(readFileSync(abs, 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: abs,
  })
  const mod = { exports: {} as Record<string, unknown> }
  cache.set(abs, mod.exports)
  const req = (spec: string) => {
    if (spec.startsWith('.')) {
      const base = path.resolve(path.dirname(abs), spec)
      for (const ext of ['.tsx', '.ts']) if (existsSync(base + ext)) return loadTsx(base + ext)
    }
    return projectRequire(spec)
  }
  new Function('require', 'module', 'exports', outputText)(req, mod, mod.exports)
  cache.set(abs, mod.exports)
  return mod.exports
}

type Icon = React.ComponentType<Record<string, unknown>>
const GROUPS = ['chrome', 'theme', 'content', 'ask'] as const
const base = loadTsx(path.join(ROOT, 'components/Icons/ui/base.tsx')) as {
  ICON_SIZES: Record<string, number>
  ICON_STROKES: Record<string, number>
}
const groups = Object.fromEntries(GROUPS.map((g) => [g, loadTsx(path.join(ROOT, `components/Icons/ui/${g}.tsx`)) as Record<string, Icon>]))

test('sizes sit on the 4 px grid; strokes keep lines near Geist stem weight', () => {
  assert.deepEqual(base.ICON_SIZES, { xs: 12, sm: 16, md: 20, lg: 24 })
  for (const [size, px] of Object.entries(base.ICON_SIZES)) {
    assert.equal(px % 4, 0, size)
    const onScreen = (base.ICON_STROKES[size] * px) / 24
    assert.ok(onScreen >= 1.1 && onScreen <= 1.55, `${size}: ${onScreen.toFixed(2)} px stroke`)
  }
})

test('every icon is a decorative, currentColor, outline SVG on the 24-unit grid', () => {
  const names = new Set<string>()
  for (const g of GROUPS) {
    for (const [name, Icon] of Object.entries(groups[g])) {
      assert.ok(!names.has(name), `${name} is defined once`)
      names.add(name)
      assert.match(name, /Icon$/)
      const html = renderToStaticMarkup(React.createElement(Icon))
      const svg = html.match(/^<svg[^>]*>/)?.[0] || ''
      assert.ok(svg, name)
      for (const attr of ['viewBox="0 0 24 24"', 'fill="none"', 'stroke="currentColor"', 'aria-hidden="true"', 'focusable="false"', 'class="ui-icon"', 'stroke-linecap="round"', 'stroke-linejoin="round"']) {
        assert.ok(svg.includes(attr), `${name}: ${attr}`)
      }
      assert.ok(svg.includes('width="16"') && svg.includes('height="16"'), `${name}: default sm`)
      assert.match(html, /<(path|circle|line|polyline|polygon|rect) /, `${name}: has shapes`)
    }
  }
  for (const expected of ['ChevronDownIcon', 'ChevronRightIcon', 'StarIcon', 'CheckIcon', 'SearchIcon', 'MenuIcon', 'MonitorIcon', 'SunIcon', 'MoonIcon']) {
    assert.ok(names.has(expected), expected)
  }
})

test('size tokens set the box and the stroke; extra props and refs pass through', () => {
  const { StarIcon } = groups.content
  for (const [size, px] of Object.entries(base.ICON_SIZES)) {
    const html = renderToStaticMarkup(React.createElement(StarIcon, { size }))
    assert.ok(html.includes(`width="${px}"`) && html.includes(`height="${px}"`), size)
    assert.ok(html.includes(`stroke-width="${base.ICON_STROKES[size]}"`), size)
  }
  const html = renderToStaticMarkup(React.createElement(StarIcon, { className: 'x', 'data-test': 'y' }))
  assert.ok(html.includes('class="ui-icon x"') && html.includes('data-test="y"'))
  assert.equal((StarIcon as unknown as { $$typeof: symbol }).$$typeof, Symbol.for('react.forward_ref'))
})

test('icons are tree-shakeable and grouped by bundle: the shared chrome file stays small', () => {
  for (const g of GROUPS) {
    const src = read(`components/Icons/ui/${g}.tsx`)
    const defs = src.match(/export const \w+ = /g) || []
    const pure = src.match(/export const \w+ = \/\*#__PURE__\*\/ makeUiIcon\(/g) || []
    assert.equal(pure.length, defs.length, `${g}: every icon is marked pure`)
  }
  assert.deepEqual(Object.keys(groups.chrome).sort(), ['ArrowUpIcon', 'ChevronDownIcon', 'MenuIcon', 'SearchIcon'])
  assert.equal(existsSync(path.join(ROOT, 'components/Icons/ui.tsx')), false, 'no barrel that would pull every icon')
  assert.equal(existsSync(path.join(ROOT, 'components/Icons/ui/index.ts')), false, 'no barrel')
  // The persistent chrome imports only the chrome group.
  for (const f of ['components/Header/Header.tsx', 'components/Footer/Footer.tsx', 'components/ScrollToTop/ScrollToTop.tsx']) {
    const src = read(f)
    assert.doesNotMatch(src, /Icons\/ui\/content/, f)
  }
})

/** Every public source file (components outside Admin, pages outside admin, layout). */
function publicSources(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(path.join(ROOT, dir))) {
      const rel = `${dir}/${name}`
      if (rel === 'components/Admin' || rel === 'pages/admin') continue
      if (statSync(path.join(ROOT, rel)).isDirectory()) walk(rel)
      else if (/\.(tsx?|jsx?)$/.test(name)) out.push(rel)
    }
  }
  for (const d of ['components', 'pages', 'layout']) walk(d)
  return out
}

test('public pages render no font-dependent glyph icons and import no other icon library', () => {
  const files = publicSources()
  assert.ok(files.length > 50)
  for (const f of files) {
    // (ContactPro strips a legacy ▸ from an owner-typed eyebrow: that regex is not an icon.)
    const code = stripComments(read(f)).replace(".replace(/^▸\\s*/, '')", '')
    // ▾ ▸ ★ ✓ are not in Geist: they fell back to whatever system font had them.
    assert.doesNotMatch(code, /[▾▸★✓]/, f)
    assert.doesNotMatch(code, /from ['"](react-icons(\/[\w-]+)?|@chakra-ui\/icons)['"]/, f)
  }
  // Brand marks come from the inline set (no Font Awesome pack in the contact chunk).
  const contact = read('components/Contact/ContactPro.tsx')
  assert.match(contact, /import \{ GitHubIcon, GitLabIcon, LinkedInIcon, WhatsAppIcon \} from '\.\.\/Icons\/brand'/)
  // An owner eyebrow typed with the old ▸ keeps a single (icon) marker.
  assert.match(contact, /\.replace\(\/\^▸\\s\*\/, ''\)/)
})

test('ESLint keeps react-icons and @chakra-ui/icons out of public code (admin exempt)', () => {
  const config = JSON.parse(read('.eslintrc.json')) as {
    overrides: { files: string[]; excludedFiles?: string[]; rules: Record<string, unknown> }[]
  }
  const rule = config.overrides.find((o) => o.files.includes('components/**') && o.rules['no-restricted-imports'])
  assert.ok(rule, 'public icon override')
  assert.deepEqual(rule.excludedFiles, ['components/Admin/**', 'pages/admin/**'])
  const [level, opts] = rule.rules['no-restricted-imports'] as [string, { patterns: { group: string[] }[] }]
  assert.equal(level, 'error')
  assert.deepEqual(opts.patterns[0].group, ['react-icons', 'react-icons/*', '@chakra-ui/icons'])
})

test('the licence notice is on /colophon and the full text is served', () => {
  const colophon = read('pages/colophon.tsx')
  assert.match(colophon, /<strong>Lucide<\/strong>/)
  assert.match(colophon, /ISC/)
  assert.match(colophon, /href="\/licenses\/lucide\.txt"/)
  const text = read('public/licenses/lucide.txt')
  assert.match(text, /^ISC License$/m)
  assert.match(text, /Lucide Icons and Contributors/)
  assert.match(text, /Copyright \(c\) 2013-present Cole Bemis/)
  assert.match(read('components/Icons/ui/base.tsx'), /ISC License/)
})
