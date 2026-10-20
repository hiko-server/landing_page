import { test, beforeEach, afterEach } from 'node:test'
import { PALETTE_UI } from '../lib/uiStrings/palette'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  DEFAULT_THEME_PREFERENCE,
  LEGACY_COLOR_MODE_KEY,
  THEME_PREFERENCES,
  THEME_PREFERENCE_ATTRIBUTE,
  THEME_PREFERENCE_KEY,
  commitThemePreference,
  currentResolvedMode,
  defaultThemePreference,
  getThemePreference,
  parseThemePreference,
  resolveColorMode,
  serverColorMode,
  subscribeThemePreference,
  themePreferenceManager,
  type ThemePreference,
} from '../lib/themePreference'
import { THEME_PREPAINT_SCRIPT, readStoredPreference, themePrepaintScript } from '../lib/themePrepaint'
import { THEME_OPTIONS, menuKeyTarget } from '../components/Header/themeMenuKeys'
import { triggerKeyFocus } from '../components/Header/themeTriggerKeys'
import { semanticColors, semanticShadows, printColorVariables } from '../theme/color'

/**
 * B2 — complete colour tokens (status set, three elevation levels) and the
 * System / Light / Dark preference: storage model, pre-paint script parity,
 * Chakra storage manager, the menu's keyboard model, wiring.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

// ── fake browser ────────────────────────────────────────────────────────────

class FakeStorage {
  map = new Map<string, string>()
  writes: [string, string][] = []
  throwOnRead = false
  getItem(k: string) {
    if (this.throwOnRead) throw new Error('SecurityError')
    return this.map.has(k) ? (this.map.get(k) as string) : null
  }
  setItem(k: string, v: string) {
    this.writes.push([k, v])
    this.map.set(k, v)
  }
}

function fakeDom(systemDark: boolean, storage = new FakeStorage()) {
  const attrs = new Map<string, string>()
  const classes = new Set<string>(['chakra-ui-light'])
  const html = {
    style: { colorScheme: '' },
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    getAttribute: (k: string) => (attrs.has(k) ? (attrs.get(k) as string) : null),
  }
  const body = { classList: { add: (c: string) => void classes.add(c), remove: (c: string) => void classes.delete(c) } }
  const document = { documentElement: html, body }
  const window = { localStorage: storage, matchMedia: (q: string) => ({ matches: q === '(prefers-color-scheme: dark)' && systemDark }) }
  return { document, window, storage, attrs, classes, html }
}

/** Run the pre-paint script against a fake document (as the browser would, synchronously). */
function runPrepaint(script: string, dom: ReturnType<typeof fakeDom>) {
  new Function('document', 'window', script)(dom.document, dom.window)
}

// ── preference model ────────────────────────────────────────────────────────

test('preferences parse strictly; the default is dark unless NEXT_PUBLIC_DEFAULT_THEME says otherwise', () => {
  assert.deepEqual([...THEME_PREFERENCES], ['system', 'light', 'dark'])
  for (const p of THEME_PREFERENCES) assert.equal(parseThemePreference(p), p)
  for (const bad of ['', 'Dark', 'auto', null, undefined, 1, {}]) assert.equal(parseThemePreference(bad), null)
  assert.equal(defaultThemePreference(undefined), 'dark')
  assert.equal(defaultThemePreference(''), 'dark')
  assert.equal(defaultThemePreference('nonsense'), 'dark')
  assert.equal(defaultThemePreference(' System '), 'system')
  assert.equal(defaultThemePreference('light'), 'light')
  // decisions.md B2: the brand default stays dark (the test env sets nothing).
  assert.equal(DEFAULT_THEME_PREFERENCE, 'dark')
  assert.equal(serverColorMode('dark'), 'dark')
  assert.equal(serverColorMode('light'), 'light')
  assert.equal(serverColorMode('system'), 'dark')
})

test('a preference resolves to a mode; System follows the operating system', () => {
  assert.equal(resolveColorMode('light', true), 'light')
  assert.equal(resolveColorMode('dark', false), 'dark')
  assert.equal(resolveColorMode('system', true), 'dark')
  assert.equal(resolveColorMode('system', false), 'light')
})

test('stored preference: the new key, a legacy explicit light, never the legacy auto-written dark', () => {
  const s = new FakeStorage()
  assert.equal(readStoredPreference(s, 'dark'), 'dark')
  s.map.set(LEGACY_COLOR_MODE_KEY, 'dark')
  assert.equal(readStoredPreference(s, 'system'), 'system', 'Chakra wrote dark for every first visit: no choice')
  s.map.set(LEGACY_COLOR_MODE_KEY, 'light')
  assert.equal(readStoredPreference(s, 'dark'), 'light', 'a light toggle made before preferences is kept')
  s.map.set(THEME_PREFERENCE_KEY, 'system')
  assert.equal(readStoredPreference(s, 'dark'), 'system', 'the new key wins')
  s.map.set(THEME_PREFERENCE_KEY, 'bogus')
  assert.equal(readStoredPreference(s, 'dark'), 'light')
  s.throwOnRead = true
  assert.equal(readStoredPreference(s, 'dark'), 'dark', 'blocked storage = the default')
  assert.equal(readStoredPreference(null, 'light'), 'light')
})

test('the pre-paint script sets data-theme, color-scheme, the body class and the preference — and matches the model', () => {
  const cases: { stored?: string; legacy?: string; systemDark: boolean; fallback: ThemePreference }[] = []
  for (const stored of [undefined, 'system', 'light', 'dark', 'junk']) {
    for (const legacy of [undefined, 'light', 'dark']) {
      for (const systemDark of [true, false]) {
        for (const fallback of THEME_PREFERENCES) cases.push({ stored, legacy, systemDark, fallback })
      }
    }
  }
  for (const c of cases) {
    const dom = fakeDom(c.systemDark)
    if (c.stored) dom.storage.map.set(THEME_PREFERENCE_KEY, c.stored)
    if (c.legacy) dom.storage.map.set(LEGACY_COLOR_MODE_KEY, c.legacy)
    runPrepaint(themePrepaintScript(c.fallback), dom)
    const pref = readStoredPreference(dom.storage, c.fallback)
    const mode = resolveColorMode(pref, c.systemDark)
    const label = JSON.stringify(c)
    assert.equal(dom.attrs.get('data-theme'), mode, label)
    assert.equal(dom.attrs.get(THEME_PREFERENCE_ATTRIBUTE), pref, label)
    assert.equal(dom.html.style.colorScheme, mode, label)
    assert.ok(dom.classes.has(`chakra-ui-${mode}`), label)
    assert.ok(!dom.classes.has(`chakra-ui-${mode === 'dark' ? 'light' : 'dark'}`), label)
    assert.deepEqual(dom.storage.writes, [], `${label}: nothing is stored before the visitor chooses`)
  }
})

test('the pre-paint script survives blocked storage and a missing matchMedia', () => {
  const dom = fakeDom(true)
  dom.storage.throwOnRead = true
  runPrepaint(themePrepaintScript('system'), dom)
  assert.equal(dom.attrs.get('data-theme'), 'dark')
  const noMql = fakeDom(true)
  ;(noMql.window as { matchMedia?: unknown }).matchMedia = undefined
  noMql.storage.map.set(THEME_PREFERENCE_KEY, 'system')
  runPrepaint(themePrepaintScript('dark'), noMql)
  assert.equal(noMql.attrs.get('data-theme'), 'light', 'no media query support: System reads as light')
  assert.equal(THEME_PREPAINT_SCRIPT, themePrepaintScript('dark'))
  assert.doesNotMatch(THEME_PREPAINT_SCRIPT, /setItem/, 'never writes')
})

// ── client store + Chakra storage manager ───────────────────────────────────

const g = globalThis as unknown as { document?: unknown; window?: unknown }
let saved: { document?: unknown; window?: unknown }

beforeEach(() => {
  saved = { document: g.document, window: g.window }
})
afterEach(() => {
  g.document = saved.document
  g.window = saved.window
})

function installDom(systemDark: boolean, stored?: ThemePreference) {
  const dom = fakeDom(systemDark)
  if (stored) dom.storage.map.set(THEME_PREFERENCE_KEY, stored)
  runPrepaint(themePrepaintScript('dark'), dom)
  g.document = dom.document
  g.window = dom.window
  return dom
}

test('the manager answers with the resolved mode and never turns System into a fixed choice', () => {
  const dom = installDom(false, 'system')
  assert.equal(getThemePreference(), 'system')
  assert.equal(themePreferenceManager.get('dark'), 'light')
  // Chakra's mount call writes back the mode it was given: no change.
  themePreferenceManager.set('light')
  assert.deepEqual(dom.storage.writes, [])
  assert.equal(getThemePreference(), 'system')
  // A toggle (the other mode) is an explicit choice.
  themePreferenceManager.set('dark')
  assert.deepEqual(dom.storage.writes, [[THEME_PREFERENCE_KEY, 'dark']])
  assert.equal(dom.attrs.get(THEME_PREFERENCE_ATTRIBUTE), 'dark')
  assert.equal(currentResolvedMode(), 'dark')
  // 'system' from Chakra is ignored (it only ever passes resolved modes here).
  themePreferenceManager.set('system')
  assert.equal(dom.storage.writes.length, 1)
})

test('commits persist, update <html> and notify; cross-tab commits do not write again', () => {
  const dom = installDom(true)
  let calls = 0
  const off = subscribeThemePreference(() => calls++)
  commitThemePreference('light')
  assert.equal(calls, 1)
  assert.equal(getThemePreference(), 'light')
  assert.deepEqual(dom.storage.writes, [[THEME_PREFERENCE_KEY, 'light']])
  commitThemePreference('system', { persist: false })
  assert.equal(calls, 2)
  assert.equal(dom.attrs.get(THEME_PREFERENCE_ATTRIBUTE), 'system')
  assert.equal(dom.storage.writes.length, 1)
  off()
  commitThemePreference('dark')
  assert.equal(calls, 2, 'unsubscribed')
})

test('on the server the store answers with the default and the manager with its fallback', () => {
  g.document = undefined
  g.window = undefined
  assert.equal(getThemePreference(), DEFAULT_THEME_PREFERENCE)
  assert.equal(themePreferenceManager.get('dark'), 'dark')
  assert.equal(themePreferenceManager.type, 'localStorage')
  assert.equal(themePreferenceManager.ssr, false)
})

// ── menu keyboard model ─────────────────────────────────────────────────────

test('theme menu keys: wrap, Home / End, first-letter jumps; trigger keys open on first / last', () => {
  assert.deepEqual(THEME_OPTIONS.map((o) => o.value), ['system', 'light', 'dark'])
  assert.equal(menuKeyTarget('ArrowDown', 0, 3), 1)
  assert.equal(menuKeyTarget('ArrowDown', 2, 3), 0)
  assert.equal(menuKeyTarget('ArrowUp', 0, 3), 2)
  assert.equal(menuKeyTarget('ArrowDown', -1, 3), 0)
  assert.equal(menuKeyTarget('ArrowUp', -1, 3), 2)
  assert.equal(menuKeyTarget('Home', 2, 3), 0)
  assert.equal(menuKeyTarget('End', 0, 3), 2)
  assert.equal(menuKeyTarget('d', 0, 3), 2)
  assert.equal(menuKeyTarget('L', 2, 3), 1)
  assert.equal(menuKeyTarget('s', 1, 3), 0)
  assert.equal(menuKeyTarget('x', 0, 3), null)
  assert.equal(menuKeyTarget('Enter', 0, 3), null, 'Enter is the button’s own click')
  assert.equal(menuKeyTarget('1', 0, 3), null)
  assert.equal(menuKeyTarget('ArrowDown', 0, 0), null)
  assert.equal(triggerKeyFocus('ArrowDown'), 'first')
  assert.equal(triggerKeyFocus('ArrowUp'), 'last')
  assert.equal(triggerKeyFocus('Enter'), null)
})

// ── colour tokens ───────────────────────────────────────────────────────────

function luminance(hex: string): number {
  const [r, g2, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g2 + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const STATUS_TEXT = ['status.warning', 'status.error', 'status.live', 'status.featured'] as const

test('the status tokens: text ≥ 4.5:1 on every page background in both modes, chips with their border', () => {
  for (const t of STATUS_TEXT) {
    for (const mode of ['light', 'dark'] as const) {
      for (const b of ['page.bg', 'page.bg-elevated', 'page.bg-overlay'] as const) {
        const ratio = contrast(semanticColors[t][mode], semanticColors[b][mode])
        assert.ok(ratio >= 4.5, `${t} on ${b} (${mode}) = ${ratio.toFixed(2)}`)
      }
    }
  }
  // Chips draw a hairline in their status colour.
  for (const t of ['status.live', 'status.open'] as const) assert.ok(`${t}-border` in semanticColors, `${t}-border`)
  // Print maps the new tokens to paper too.
  assert.equal(printColorVariables()['--chakra-colors-status-live'], semanticColors['status.live'].light)
})

test('three elevation levels per mode; dark adds a light hairline so a raised surface reads on near-black', () => {
  assert.deepEqual(Object.keys(semanticShadows), ['elevation.sm', 'elevation.md', 'elevation.lg'])
  for (const [name, pair] of Object.entries(semanticShadows)) {
    assert.match(pair.light, /rgba\(0,0,0,/, name)
    assert.match(pair.dark, /0 0 0 1px rgba\(255,255,255,0\.0\d\)/, name)
  }
  // Values: theme/color.ts, mirrored per data-theme in globals.css (static CSS); Chakra points at the variables.
  const css = read('styles/globals.css')
  const rootBlock = /^:root \{([^}]*)\}/m.exec(css)?.[1] || ''
  const darkBlock = /\[data-theme='dark'\],\s*\.chakra-ui-dark \{([^}]*)\}/.exec(css)?.[1] || ''
  for (const [name, pair] of Object.entries(semanticShadows)) {
    const v = `--${name.replace('.', '-')}`
    assert.ok(rootBlock.includes(`${v}: ${pair.light};`), `${v} light`)
    assert.ok(darkBlock.includes(`${v}: ${pair.dark};`), `${v} dark`)
  }
  const chakra = read('theme/chakra.js')
  assert.match(chakra, /elevation: \{\s*sm: 'var\(--elevation-sm\)',\s*md: 'var\(--elevation-md\)',\s*lg: 'var\(--elevation-lg\)',/)
  assert.match(chakra, /warning: 'status\.warning'/)
  assert.match(chakra, /error: 'status\.error'/)
  assert.doesNotMatch(chakra, /'(orange|red)\.400'/)
  assert.match(chakra, /boxShadow: 'elevation\.md'/)
  assert.match(read('components/General-UI/CommandPalette.tsx'), /boxShadow="elevation\.lg"/)
  assert.match(read('components/Header/ThemeMenu.tsx'), /boxShadow="elevation\.md"/)
  const work = read('pages/work/index.tsx')
  assert.match(work, /const liveColor = 'status\.live'/)
  assert.match(work, /const featuredColor = 'status\.featured'/)
})

// ── wiring ──────────────────────────────────────────────────────────────────

test('the document paints the preference before first paint; the app hands Chakra the preference manager', () => {
  const doc = read('pages/_document.tsx')
  assert.match(doc, /import \{ THEME_COLOR_PREPAINT_SCRIPT, THEME_PREPAINT_SCRIPT \} from '\.\.\/lib\/themePrepaint'/)
  assert.doesNotMatch(read('components/Chrome/themeColor.ts'), /export const THEME_COLOR_PREPAINT_SCRIPT/, 'not in the client bundle')
  assert.doesNotMatch(read('lib/themePreference.ts'), /export (function themePrepaintScript|const THEME_PREPAINT_SCRIPT)/, 'not in the client bundle')
  assert.doesNotMatch(doc, /ColorModeScript/)
  assert.match(doc, /<script dangerouslySetInnerHTML=\{\{ __html: THEME_PREPAINT_SCRIPT \}\} \/>\s*<script dangerouslySetInnerHTML=\{\{ __html: THEME_COLOR_PREPAINT_SCRIPT \}\} \/>/)
  assert.match(doc, /content=\{themeColorFor\(initialColorMode\)\}/)
  assert.match(doc, /const initialColorMode = serverColorMode\(\)/)
  const app = read('pages/_app.tsx')
  assert.match(app, /colorModeManager=\{themePreferenceManager\}/)
  assert.match(app, /<ThemePreferenceSync \/>/)
  const chakra = read('theme/chakra.js')
  assert.match(chakra, /initialColorMode: serverColorMode\(\)/)
  assert.match(chakra, /useSystemColorMode: false/)
})

test('header: a one-tap toggle plus a lazily loaded System / Light / Dark menu; the palette offers all three', () => {
  const header = read('components/Header/Header.tsx')
  assert.match(header, /<ThemeControl \/>/)
  assert.doesNotMatch(header, /from '\.\/ThemeMenu'/, 'the menu is never in the shared bundle')
  const control = read('components/Header/ThemeControl.tsx')
  assert.match(control, /dynamic\(loadThemeMenu, \{ ssr: false/)
  assert.match(control, /const loadThemeMenu = \(\) => import\('\.\/ThemeMenu'\)/)
  assert.match(control, /aria-haspopup="menu"/)
  assert.match(control, /aria-expanded=\{open\}/)
  assert.match(control, /toggleThemeWithTransition\(toggleColorMode, e\.currentTarget\)/, 'the circular reveal stays')
  assert.match(control, /onContextMenu=/)
  assert.match(control, /minW="24px"/, 'WCAG 2.5.8 target size')
  const menu = read('components/Header/ThemeMenu.tsx')
  assert.match(menu, /role="menu"/)
  assert.match(menu, /role="menuitemradio"/)
  assert.match(menu, /aria-checked=\{checked\}/)
  assert.match(menu, /flushSync\(\(\) => onClose\(true\)\)/, 'closed before the reveal snapshot')
  const palette = read('components/General-UI/CommandPalette.tsx')
  // The three preferences, in the palette's language (lib/uiStrings/palette, F3).
  assert.match(palette, /label: p\.themeItems\[value\]/)
  assert.deepEqual(Object.values(PALETTE_UI.en.themeItems), ['System theme', 'Light theme', 'Dark theme'])
  assert.deepEqual(Object.values(PALETTE_UI['zh-Hans'].themeItems), ['跟随系统主题', '浅色主题', '深色主题'])
  assert.match(palette, /run: \(\) => choose\(value, null\)/)
  assert.doesNotMatch(palette, /useColorMode/)
})

test('the default theme is a documented build argument', () => {
  assert.match(read('Dockerfile'), /ARG NEXT_PUBLIC_DEFAULT_THEME=""/)
  assert.match(read('Dockerfile'), /NEXT_PUBLIC_DEFAULT_THEME=\$NEXT_PUBLIC_DEFAULT_THEME/)
  assert.match(read('docker-compose.yml'), /NEXT_PUBLIC_DEFAULT_THEME: \$\{NEXT_PUBLIC_DEFAULT_THEME:-\}/)
  assert.match(read('.env.example'), /^NEXT_PUBLIC_DEFAULT_THEME=$/m)
  assert.match(read('README.md'), /`NEXT_PUBLIC_DEFAULT_THEME`/)
})
