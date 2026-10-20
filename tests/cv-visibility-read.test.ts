import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as visibility from '../lib/cvVisibility'
import * as read from '../lib/cvVisibilityRead'

/**
 * CV-BUNDLE (review round 3): the public pages render CV data the server
 * already pruned and need only a few checks of the visibility model
 * (lib/cvVisibilityRead). The model itself — the pruning, the CV Studio's
 * editing and audience helpers — is server and admin code. A webpack module
 * carries every export any page uses, so one public import of
 * lib/cvVisibility put the whole module (with the admin's helpers) in the
 * first-load JavaScript of /, /about, /cv, /cv/zh and the private CV links.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs']

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p) : /\.(tsx?|jsx?|mjs)$/.test(e.name) ? [p] : []
  })
}

function resolveLocal(from: string, spec: string): string | null {
  const base = path.resolve(path.dirname(from), spec)
  for (const c of [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => path.join(base, `index${e}`))]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  }
  return null
}

/**
 * The local modules a file loads at run time: static imports and re-exports
 * with at least one value binding (an `import type`, or a list of `type`
 * names only, is erased by the compiler), side-effect imports and import().
 */
function valueImports(src: string): string[] {
  const out: string[] = []
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const m of code.matchAll(/(?:^|[;\n])\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g)) {
    if (m[2]) continue
    const clause = m[3].trim()
    const list = /\{([^}]*)\}/.exec(clause)
    const outside = clause.replace(/\{[^}]*\}/, '').replace(/,/g, '').trim()
    const named = list ? list[1].split(',').map((s) => s.trim()).filter(Boolean) : []
    if (!outside && named.length && named.every((s) => s.startsWith('type '))) continue
    out.push(m[4])
  }
  for (const m of code.matchAll(/(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g)) out.push(m[1])
  for (const m of code.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1])
  return out
}

/**
 * Every app module a public page runs in the browser: from each page under
 * pages/ (not the API, not the admin), the components it imports, and from
 * there everything they load. A page's own imports of lib/ are left out —
 * most feed getStaticProps, which Next removes from the browser bundle —
 * and so is the admin's code (components/Admin, loaded only once signed in).
 */
function publicClientModules(): Set<string> {
  const pagesDir = path.join(ROOT, 'pages')
  const componentsDir = path.join(ROOT, 'components') + path.sep
  const adminDir = path.join(ROOT, 'components', 'Admin') + path.sep
  const pages = walk(pagesDir).filter((f) => {
    const rel = path.relative(pagesDir, f).replace(/\\/g, '/')
    return !rel.startsWith('api/') && !rel.startsWith('admin/') && !/^admin\.[jt]sx?$/.test(rel) && !rel.startsWith('_document')
  })
  const seen = new Set<string>()
  const stack: string[] = []
  for (const page of pages) {
    for (const spec of valueImports(fs.readFileSync(page, 'utf8'))) {
      const target = spec.startsWith('.') ? resolveLocal(page, spec) : null
      if (target && target.startsWith(componentsDir)) stack.push(target)
    }
  }
  while (stack.length) {
    const file = stack.pop() as string
    if (seen.has(file) || file.startsWith(adminDir)) continue
    seen.add(file)
    for (const spec of valueImports(fs.readFileSync(file, 'utf8'))) {
      const target = spec.startsWith('.') ? resolveLocal(file, spec) : null
      if (target) stack.push(target)
    }
  }
  return seen
}

test('valueImports: type-only imports are erased, everything else loads', () => {
  const src = [
    "import type { A } from './a'",
    "import { type B, type C } from './b'",
    "import D, { type E } from './d'",
    "import { F, type G } from './f'",
    "export type { H } from './h'",
    "export { I } from './i'",
    "export * from './star'",
    "import './side-effect'",
    "// import { J } from './commented'",
    "const lazy = () => import('./lazy')",
  ].join('\n')
  assert.deepEqual(valueImports(src).sort(), ['./d', './f', './i', './lazy', './side-effect', './star'])
})

test('no browser code of a public page loads lib/cvVisibility (only its read side)', () => {
  const modules = publicClientModules()
  const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, '/')
  const target = path.join(ROOT, 'lib/cvVisibility.ts')
  const importers = Array.from(modules).filter((f) =>
    valueImports(fs.readFileSync(f, 'utf8')).some((spec) => spec.startsWith('.') && resolveLocal(f, spec) === target),
  )
  assert.deepEqual(importers.map(rel).sort(), [], 'import these checks from lib/cvVisibilityRead instead')
  assert.ok(!modules.has(target))
  // Sanity: the walk reaches the CV and home renderers and the read side.
  for (const f of ['components/CVViewerPage/CvPageView.tsx', 'components/CVViewerPage/fields.ts', 'components/LandingPage/heroIdentity.ts', 'lib/cvVisibilityRead.ts', 'lib/publications/normalize.ts']) {
    assert.ok(modules.has(path.join(ROOT, f)), `${f} should be reached from a public page`)
  }
})

test('lib/cvVisibility re-exports the read side unchanged (one import for server and admin code)', () => {
  const names = Object.keys(read)
  assert.deepEqual(names.sort(), ['HIDDEN_ITEM_MARK', 'REDACTED_KEY', 'caseStudySlug', 'hiddenIndices', 'isRedacted', 'isSectionOnCv', 'isSectionOnWebsite'])
  for (const name of names) assert.equal((visibility as Record<string, unknown>)[name], (read as Record<string, unknown>)[name], name)
})

test('the read checks', () => {
  // The redaction marker of pruned data, and the editor's hide flags.
  assert.equal(read.isRedacted({ redacted: ['gpa'] }, 'gpa'), true)
  assert.equal(read.isRedacted({ hiddenFields: ['phone'] }, 'phone'), true)
  assert.equal(read.isRedacted({ gpa: '' }, 'gpa'), false)
  assert.equal(read.isRedacted(null, 'gpa'), false)
  assert.deepEqual(read.hiddenIndices({ hiddenItems: { bullets: [0, 2, 'x', 1.5] } }, 'bullets'), [0, 2])
  assert.deepEqual(read.hiddenIndices({}, 'bullets'), [])
  assert.equal(read.isSectionOnWebsite({ showOnWebsite: false }), false)
  assert.equal(read.isSectionOnWebsite({}), true)
  assert.equal(read.isSectionOnCv({ isVisible: false }), false)
  assert.equal(read.isSectionOnCv({}), true)
  assert.equal(read.caseStudySlug(' /Work/Raku/ '), 'raku')
  assert.equal(read.caseStudySlug(42), '')
  // What pruning leaves in place of a hidden author is the mark the renderers look for.
  const [pub] = visibility.publicSections([{ sessionName: 'x', authors: ['A', 'B'], hiddenItems: { authors: [0] } }])
  assert.deepEqual(pub.authors, [read.HIDDEN_ITEM_MARK, 'B'])
  const [redacted] = visibility.publicSections([{ sessionName: 'x', gpa: '4.0', hiddenFields: ['gpa'] }])
  assert.equal(redacted[read.REDACTED_KEY][0], 'gpa')
  assert.equal(read.isRedacted(redacted, 'gpa'), true)
})
