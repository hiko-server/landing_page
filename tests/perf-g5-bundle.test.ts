import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeThemeValue, extendChakraBaseTheme, chakraBaseTheme } from '../theme/baseTheme'
import { CHAKRA_COMPONENT_STYLES } from '../theme/chakraComponents'
import { ADMIN_COMPONENT_STYLES } from '../theme/adminComponents'
import { stateHasToasts, toastListStyle, toastStackStyle } from '../components/Chrome/toastWatch'

/**
 * G5 — the JavaScript diet.
 *
 *   - Chakra's component styles: the app theme carries only the default
 *     styles of the components the public pages render
 *     (theme/chakraComponents.ts); the admin-only ones load with the admin
 *     (theme/adminComponents.ts). A component missing from its list renders
 *     unstyled, so this test derives the lists from the code: every
 *     `@chakra-ui/react` component imported by a file reachable from a
 *     public page needs its theme entry in the public list, every other one
 *     in the admin list, and neither list carries an unused entry.
 *   - The theme merge (theme/baseTheme.ts) follows extendTheme's rules.
 *   - framer-motion: public code renders `m` inside LazyMotion.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHAKRA_DIST = path.join(ROOT, 'node_modules/@chakra-ui/react/dist/esm')
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

const IMPORT_RE = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g

/** Every app file a public page (anything under pages/ but the admin and the API) can load, statically or dynamically. */
function publicFiles(): Set<string> {
  const pagesDir = path.join(ROOT, 'pages')
  const entries = walk(pagesDir).filter((f) => {
    const rel = path.relative(pagesDir, f).replace(/\\/g, '/')
    return !rel.startsWith('api/') && !rel.startsWith('admin/') && !/^admin\.[jt]sx?$/.test(rel)
  })
  const seen = new Set<string>()
  const stack = [...entries]
  while (stack.length) {
    const file = stack.pop() as string
    if (seen.has(file)) continue
    seen.add(file)
    for (const m of fs.readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
      const spec = m[1] || m[2] || m[3]
      if (!spec?.startsWith('.')) continue
      const target = resolveLocal(file, spec)
      if (target) stack.push(target)
    }
  }
  return seen
}

/** Component names (values, not types or hooks) a file imports from @chakra-ui/react. */
function chakraImports(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"]@chakra-ui\/react['"]/g)) {
    if (m[1]) continue
    for (const raw of m[2].split(',')) {
      const part = raw.trim()
      if (!part || part.startsWith('type ')) continue
      const name = part.split(/\s+as\s+/)[0].trim()
      if (/^[A-Z]/.test(name)) out.push(name)
    }
  }
  return out
}

/** export name → its module in Chakra's ESM build (index.mjs re-exports). */
function chakraExportFiles(): Map<string, string> {
  const index = fs.readFileSync(path.join(CHAKRA_DIST, 'index.mjs'), 'utf8')
  const out = new Map<string, string>()
  for (const m of index.matchAll(/export\s+\{([^}]*)\}\s+from\s+'([^']+)'/g)) {
    for (const raw of m[1].split(',')) {
      const [name, alias] = raw.trim().split(/\s+as\s+/)
      out.set((alias || name).trim(), path.join(CHAKRA_DIST, m[2]))
    }
  }
  return out
}

const STYLE_KEY_RE = /use(?:Multi)?StyleConfig\(\s*"([A-Za-z]+)"|components\?\.([A-Z][A-Za-z]+)/g

/** Theme keys a Chakra module styles itself with (its own file and the component modules it imports directly). */
function themeKeysOf(file: string, depth = 1, acc = new Set<string>(), seen = new Set<string>()): Set<string> {
  if (seen.has(file) || !fs.existsSync(file)) return acc
  seen.add(file)
  const src = fs.readFileSync(file, 'utf8')
  for (const m of src.matchAll(STYLE_KEY_RE)) acc.add(m[1] || m[2])
  if (depth > 0) {
    for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) {
      const target = path.resolve(path.dirname(file), m[1])
      if (!/[\\/](system|utils)[\\/]/.test(target)) themeKeysOf(target, depth - 1, acc, seen)
    }
  }
  return acc
}

function themeKeyUsage() {
  const pub = publicFiles()
  const exportsMap = chakraExportFiles()
  const themed = new Set(Object.keys(chakraComponentThemes()))
  const usage = { public: new Map<string, Set<string>>(), admin: new Map<string, Set<string>>() }
  const files = ['components', 'pages', 'layout'].flatMap((d) => walk(path.join(ROOT, d)))
  for (const file of files) {
    const scope = pub.has(file) ? 'public' : 'admin'
    for (const name of chakraImports(fs.readFileSync(file, 'utf8'))) {
      const mod = exportsMap.get(name)
      if (!mod) continue
      for (const key of themeKeysOf(mod)) {
        if (!themed.has(key)) continue // Text, Icon…: no default component theme
        const users = usage[scope].get(key) || new Set<string>()
        users.add(`${name} in ${path.relative(ROOT, file)}`)
        usage[scope].set(key, users)
      }
    }
  }
  return usage
}

function chakraComponentThemes(): Record<string, unknown> {
  // The keys of @chakra-ui/theme's `components` (what extendTheme would merge in).
  const src = fs.readFileSync(path.join(ROOT, 'node_modules/@chakra-ui/theme/dist/esm/components/index.mjs'), 'utf8')
  const keys = new Set<string>()
  for (const m of src.matchAll(/(?:^|[\s{,])([A-Z][A-Za-z]+)(?=\s*[,}:])/g)) keys.add(m[1])
  return Object.fromEntries(Array.from(keys).map((k) => [k, true]))
}

test('Chakra component styles: every themed component a public page renders is in theme/chakraComponents.ts', () => {
  const usage = themeKeyUsage()
  const listed = new Set(Object.keys(CHAKRA_COMPONENT_STYLES))
  const missing = Array.from(usage.public.keys()).filter((k) => !listed.has(k))
  assert.deepEqual(
    missing.map((k) => `${k}: ${Array.from(usage.public.get(k) || []).slice(0, 3).join('; ')}`),
    [],
    'add these to theme/chakraComponents.ts (public pages render them)',
  )
  // Sanity: the classifier really sees the public pages.
  for (const key of ['Button', 'Modal', 'Link']) assert.ok(usage.public.has(key), `${key} should be seen on public pages`)
})

test('Chakra component styles: admin-only components are in theme/adminComponents.ts, and no list carries an unused entry', () => {
  const usage = themeKeyUsage()
  const pub = new Set(Object.keys(CHAKRA_COMPONENT_STYLES))
  const admin = new Set(Object.keys(ADMIN_COMPONENT_STYLES))
  const missing = Array.from(usage.admin.keys()).filter((k) => !pub.has(k) && !admin.has(k))
  assert.deepEqual(missing, [], 'add these to theme/adminComponents.ts')
  assert.deepEqual(Array.from(pub).filter((k) => !usage.public.has(k)), [], 'public list entries no public page renders (move them to the admin list or drop them)')
  assert.deepEqual(Array.from(admin).filter((k) => !usage.admin.has(k)), [], 'admin list entries nothing renders')
  assert.deepEqual(Array.from(admin).filter((k) => pub.has(k)), [], 'an entry belongs to one list only')
})

test('the lists hold Chakra’s own default styles (objects or style functions), keyed like theme.components', () => {
  for (const [key, value] of Object.entries({ ...CHAKRA_COMPONENT_STYLES, ...ADMIN_COMPONENT_STYLES })) {
    assert.equal(typeof value, 'object', key)
    const v = value as Record<string, unknown>
    assert.ok('baseStyle' in v || 'variants' in v || 'sizes' in v, `${key} looks like a component style config`)
  }
})

test('mergeThemeValue follows extendTheme: objects merge, functions compose, arrays and scalars are replaced, undefined never overrides', () => {
  assert.deepEqual(mergeThemeValue({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 4, e: 5 }, f: 6 }), { a: 1, b: { c: 2, d: 4, e: 5 }, f: 6 })
  assert.deepEqual(mergeThemeValue([1, 2], [3]), [3])
  assert.equal(mergeThemeValue('x', 'y'), 'y')
  assert.equal(mergeThemeValue('x', undefined), 'x')
  assert.deepEqual(mergeThemeValue({ a: 1 }, { a: undefined }), { a: 1 })
  const composed = mergeThemeValue((p: { c: string }) => ({ color: p.c, bg: 'base' }), { bg: 'override', px: 2 }) as (p: unknown) => unknown
  assert.equal(typeof composed, 'function')
  assert.deepEqual(composed({ c: 'red' }), { color: 'red', bg: 'override', px: 2 })
  const both = mergeThemeValue({ x: 1 }, (p: { y: number }) => ({ y: p.y })) as (p: unknown) => unknown
  assert.deepEqual(both({ y: 2 }), { x: 1, y: 2 })
})

test('extendChakraBaseTheme: Chakra’s foundations, the listed component defaults and the app overrides, in that order', () => {
  const t = extendChakraBaseTheme({ components: { Button: { baseStyle: { fontWeight: 'semibold' }, variants: { solid: { bg: 'gray' } } } } }, { components: { Button: { variants: { v6: { bg: 'accent' } } } }, colors: { accent: { 500: '#6366f1' } } })
  assert.ok(t.space && t.breakpoints && t.styles && t.semanticTokens, 'foundations kept')
  assert.equal(t.colors.accent[500], '#6366f1')
  assert.ok(t.colors.gray, 'Chakra palette kept')
  assert.deepEqual(Object.keys(t.components.Button.variants).sort(), ['solid', 'v6'])
  assert.equal(t.components.Button.baseStyle.fontWeight, 'semibold')
  assert.deepEqual(chakraBaseTheme.components, {}, 'the base theme itself carries no component styles')
})

test('the app theme (theme/chakra.js) is built on the base theme, never on extendTheme', () => {
  const src = fs.readFileSync(path.join(ROOT, 'theme/chakra.js'), 'utf8')
  assert.doesNotMatch(src, /\bextendTheme\b\s*\(/)
  assert.doesNotMatch(src, /from\s+['"]@chakra-ui\/react['"]/)
  assert.match(src, /extendChakraBaseTheme\(\{ components: CHAKRA_COMPONENT_STYLES \}/)
})

test('pages/_app: no ChakraProvider, no eager framer `motion`, LazyMotion with on-demand features, web-vitals loaded after load', () => {
  const app = fs.readFileSync(path.join(ROOT, 'pages/_app.tsx'), 'utf8')
  assert.doesNotMatch(app, /import\s+\{[^}]*\bChakraProvider\b[^}]*\}\s+from\s+['"]@chakra-ui\/react['"]/)
  assert.match(app, /<AppChakraProvider theme=\{theme\}/)
  assert.doesNotMatch(app, /import\s+\{[^}]*\bmotion\b[^}]*\}\s+from\s+['"]framer-motion['"]/)
  assert.match(app, /<MotionProvider>/)
  const provider = fs.readFileSync(path.join(ROOT, 'components/Chrome/MotionProvider.tsx'), 'utf8')
  assert.match(provider, /<LazyMotion features=\{loadMotionFeatures\}>/)
  assert.match(provider, /<MotionConfig reducedMotion="user">/)
  assert.doesNotMatch(app, /next\/web-vitals/)
  assert.match(app, /installWebVitals\(\)/)
  for (const lazy of ['ScrollToTop', 'ScrollProgressBar']) assert.match(app, new RegExp(`const ${lazy} = dynamic\\(`))
})

test('public code renders framer-motion through `m` (lint guards it too)', () => {
  const pub = publicFiles()
  const offenders: string[] = []
  for (const file of pub) {
    const src = fs.readFileSync(file, 'utf8')
    for (const m of src.matchAll(/import\s+\{([^}]*)\}\s+from\s+['"]framer-motion['"]/g)) {
      if (m[1].split(',').some((p) => p.trim().split(/\s+as\s+/)[0] === 'motion')) offenders.push(path.relative(ROOT, file))
    }
  }
  assert.deepEqual(offenders, [])
})

test('the motion feature chunk is framer-motion’s domMax (animations, gestures, drag, layout)', async () => {
  const [{ default: bundle }, fm] = await Promise.all([import('../lib/motionFeatureBundle'), import('framer-motion')])
  assert.equal(bundle, fm.domMax)
})

test('toast watch: a toast in any placement counts; list and stack styles match Chakra’s placements', () => {
  assert.equal(stateHasToasts(null), false)
  assert.equal(stateHasToasts({ top: [], bottom: [] }), false)
  assert.equal(stateHasToasts({ top: [], bottom: [{ id: 1 }] }), true)
  const bottom = toastListStyle('bottom')
  assert.equal(bottom.position, 'fixed')
  assert.equal(bottom.margin, '0 auto')
  assert.equal(bottom.bottom, 'env(safe-area-inset-bottom, 0px)')
  assert.equal(bottom.top, undefined)
  const topLeft = toastListStyle('top-left')
  assert.equal(topLeft.left, 'env(safe-area-inset-left, 0px)')
  assert.equal(topLeft.right, undefined)
  assert.equal(toastStackStyle('bottom-right').alignItems, 'flex-end')
  assert.equal(toastStackStyle('top-left').alignItems, 'flex-start')
  assert.equal(toastStackStyle('bottom').alignItems, 'center')
})
