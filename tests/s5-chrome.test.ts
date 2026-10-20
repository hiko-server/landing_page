import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  ADMIN_HINT_COOKIE,
  CHROMELESS_ROUTES,
  MOBILE_MENU_DIALOG_ID,
  MOBILE_MENU_ID,
  NAV_SHORTCUTS,
  PRIMARY_LINKS,
  SOCIAL_LINKS,
  adminEditTarget,
  formatAge,
  hasAdminHint,
  isActiveRoute,
  normalizeHost,
  resolveHtmlLang,
  resolveSocialLinks,
  routeHasChrome,
  shortcutLabelFor,
  shortcutTarget,
  shouldProbeSession,
  shouldRecheckSession,
  splitBrand,
} from '../components/Chrome/chrome'
import {
  TransitionGate,
  isCrossPageNavigation,
  pageKeyOf,
  prefersReducedMotion,
  settleWithin,
  startViewTransitionSafely,
  supportsViewTransitions,
} from '../lib/viewTransition'
import { palette, semanticColors, themeColorFor } from '../theme/color'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ── chrome routing ──────────────────────────────────────────────────────────

test('chrome is rendered on content and admin routes, not on the error screens', () => {
  // /admin/db-config renders AdminPageShell → HeaderFooter, so it must sit
  // under the persistent chrome (no header/footer remount on entry / exit).
  for (const p of ['/', '/about', '/blog/[slug]', '/work', '/cv', '/404', '/admin/dashboard', '/admin/login', '/admin/db-config']) {
    assert.equal(routeHasChrome(p), true, p)
  }
  assert.deepEqual([...CHROMELESS_ROUTES], ['/500', '/_error'])
  for (const p of CHROMELESS_ROUTES) assert.equal(routeHasChrome(p), false, p)
})

test('profile links follow the public home.socials; built-ins only when there is none', () => {
  // Channels without a built-in link (WhatsApp: a phone number) never fall back to one.
  const builtIn = SOCIAL_LINKS.filter((s) => s.url).map((s) => s.url)
  assert.ok(!builtIn.some((u) => u.includes('wa.me')))
  assert.deepEqual(resolveSocialLinks(undefined).map((s) => s.url), builtIn)
  assert.deepEqual(resolveSocialLinks(null).map((s) => s.url), builtIn)
  assert.deepEqual(resolveSocialLinks([]).map((s) => s.url), builtIn)
  // A cleared channel is removed — no literal comes back for it.
  const cleared = resolveSocialLinks({ github: 'https://github.com/someone', gitlab: '', linkedin: '   ', whatsapp: '' })
  assert.deepEqual(cleared, [{ key: 'github', name: 'GitHub', url: 'https://github.com/someone' }])
  assert.ok(!JSON.stringify(cleared).includes('wa.me'))
  // A key that is absent keeps its built-in link; bare domains gain https://.
  const partial = resolveSocialLinks({ github: 'github.com/x' })
  assert.deepEqual(
    partial.map((s) => s.url),
    ['https://github.com/x', ...builtIn.slice(1)],
  )
  // Unsafe values never become links.
  assert.deepEqual(resolveSocialLinks({ github: 'javascript:alert(1)', gitlab: '', linkedin: '', whatsapp: '' }), [])
  // Callers get copies, never the shared constant.
  const a = resolveSocialLinks(undefined)
  a[0].url = 'changed'
  assert.equal(SOCIAL_LINKS[0].url, 'https://github.com/HikoPLi')
})

test('active nav matching is exact for home and segment-prefixed otherwise', () => {
  assert.equal(isActiveRoute('/', '/'), true)
  assert.equal(isActiveRoute('/blog', '/'), false)
  assert.equal(isActiveRoute('/blog/[slug]', '/blog'), true)
  assert.equal(isActiveRoute('/blogroll', '/blog'), false)
  assert.equal(isActiveRoute('/work', '/work'), true)
  assert.deepEqual(
    PRIMARY_LINKS.map((l) => l.url),
    ['/', '/about', '/work', '/blog', '/cv', '/now', '/uses', '/contact'],
  )
})

test('admin session is re-checked only when a navigation can change it', () => {
  // Ordinary public navigation: never.
  assert.equal(shouldRecheckSession('/', '/about', false), false)
  assert.equal(shouldRecheckSession('/blog', '/blog/[slug]', true), false)
  // Same route (query change): never.
  assert.equal(shouldRecheckSession('/admin/dashboard', '/admin/dashboard', false), false)
  // Sign-in screens on either side: always.
  assert.equal(shouldRecheckSession('/admin/login', '/admin/dashboard', false), true)
  assert.equal(shouldRecheckSession('/admin/dashboard', '/admin/login', true), true)
  assert.equal(shouldRecheckSession('/', '/admin/reset', false), true)
  // Entering the admin area while not known to be signed in.
  assert.equal(shouldRecheckSession('/', '/admin/dashboard', false), true)
  assert.equal(shouldRecheckSession('/', '/admin', false), true)
  assert.equal(shouldRecheckSession('/', '/admin/dashboard', true), false)
  assert.equal(shouldRecheckSession('/', '/administrator', false), false)
})

test('the session probe only runs for a possible admin (hint cookie or the admin area)', () => {
  assert.equal(ADMIN_HINT_COOKIE, 'cv_admin_hint')
  assert.equal(hasAdminHint('cv_admin_hint=1'), true)
  assert.equal(hasAdminHint('theme=dark; cv_admin_hint=1; x=y'), true)
  assert.equal(hasAdminHint('theme=dark;cv_admin_hint=1'), true)
  assert.equal(hasAdminHint(''), false)
  assert.equal(hasAdminHint('cv_admin_hint=0'), false)
  assert.equal(hasAdminHint('xcv_admin_hint=1'), false)
  assert.equal(hasAdminHint('cv_admin_hint=12'), false)
  // Ordinary visitors on public pages never send the request.
  assert.equal(shouldProbeSession('', '/'), false)
  assert.equal(shouldProbeSession('theme=dark', '/blog/[slug]'), false)
  assert.equal(shouldProbeSession('cv_admin_hint=1', '/'), true)
  // Inside /admin the middleware already required a session (heals sessions without the hint).
  assert.equal(shouldProbeSession('', '/admin/dashboard'), true)
  assert.equal(shouldProbeSession('', '/administrator'), false)
})

test('route-aware "edit this page" targets for the owner', () => {
  assert.deepEqual(adminEditTarget('/blog/[slug]', 'edge-ai'), { label: 'Edit this post', href: '/admin/blog/edit?slug=edge-ai' })
  assert.deepEqual(adminEditTarget('/work/[slug]', 'we_green-2'), { label: 'Edit this case study', href: '/admin/work/edit?slug=we_green-2' })
  assert.equal(adminEditTarget('/blog/[slug]', undefined), null)
  assert.equal(adminEditTarget('/blog/[slug]', ['a', 'b']), null)
  assert.equal(adminEditTarget('/blog/[slug]', '../x'), null, 'never builds a URL from an odd slug')
  assert.equal(adminEditTarget('/cv', undefined)?.href, '/admin/dashboard?tab=cv')
  assert.equal(adminEditTarget('/cv/zh', undefined)?.href, '/admin/dashboard?tab=cv')
  assert.equal(adminEditTarget('/', undefined)?.href, '/admin/dashboard?tab=home')
  assert.equal(adminEditTarget('/now', undefined)?.href, '/admin/now')
  assert.equal(adminEditTarget('/uses', undefined)?.href, '/admin/uses')
  assert.equal(adminEditTarget('/contact', undefined), null)
})

test('"G then key" shortcuts cover the primary pages', () => {
  assert.equal(shortcutTarget('h'), '/')
  assert.equal(shortcutTarget('C'), '/cv')
  assert.equal(shortcutTarget('x'), null)
  assert.equal(shortcutLabelFor('/blog'), 'G B')
  assert.equal(shortcutLabelFor('/contact'), undefined)
  const primary = new Set(PRIMARY_LINKS.map((l) => l.url))
  for (const s of NAV_SHORTCUTS) assert.ok(primary.has(s.url), s.url)
  assert.equal(new Set(NAV_SHORTCUTS.map((s) => s.key)).size, NAV_SHORTCUTS.length, 'keys are unique')
})

test('the hamburger controls the drawer dialog id Chakra renders', () => {
  assert.equal(MOBILE_MENU_DIALOG_ID, `chakra-modal-${MOBILE_MENU_ID}`)
  const drawer = readFileSync(path.join(ROOT, 'components/Header/MobileDrawer.tsx'), 'utf8')
  assert.match(drawer, /<Drawer id=\{MOBILE_MENU_ID\}/)
  const header = readFileSync(path.join(ROOT, 'components/Header/Header.tsx'), 'utf8')
  assert.match(header, /aria-controls=\{MOBILE_MENU_DIALOG_ID\}/)
})

test('html lang accepts BCP-47 tags and falls back to en', () => {
  assert.equal(resolveHtmlLang('zh-Hans'), 'zh-Hans')
  assert.equal(resolveHtmlLang('en'), 'en')
  assert.equal(resolveHtmlLang(' zh-HK '), 'zh-HK')
  assert.equal(resolveHtmlLang(undefined), 'en')
  assert.equal(resolveHtmlLang(''), 'en')
  assert.equal(resolveHtmlLang(42), 'en')
  assert.equal(resolveHtmlLang('en" onload="x'), 'en')
  assert.equal(resolveHtmlLang('zh_Hans'), 'en')
})

test('brand helpers', () => {
  assert.equal(normalizeHost('www.lucian-dev.com:3002'), 'lucian-dev.com')
  assert.deepEqual(splitBrand('lucian-dev.com'), ['lucian-dev', '.com'])
  assert.deepEqual(splitBrand('localhost'), ['localhost', ''])
  assert.deepEqual(splitBrand('.hidden'), ['.hidden', ''])
})

test('last-commit age label', () => {
  const now = Date.parse('2026-01-02T12:00:00Z')
  assert.equal(formatAge('2026-01-02T11:59:30Z', now), '0m ago')
  assert.equal(formatAge('2026-01-02T11:15:00Z', now), '45m ago')
  assert.equal(formatAge('2026-01-02T07:00:00Z', now), '5h ago')
  assert.equal(formatAge('2025-12-30T12:00:00Z', now), '3d ago')
  assert.equal(formatAge('2026-01-03T00:00:00Z', now), '0m ago')
  assert.equal(formatAge('not a date', now), null)
})

// ── view transitions ────────────────────────────────────────────────────────

test('page keys ignore query and hash', () => {
  assert.equal(pageKeyOf('/cv?lang=zh#experience'), '/cv')
  assert.equal(pageKeyOf('/blog/post'), '/blog/post')
  assert.equal(pageKeyOf('?x=1'), '/')
})

test('only pathname changes on the same origin are page transitions', () => {
  const here = 'https://lucian-dev.com/cv?lang=en'
  assert.equal(isCrossPageNavigation(here, '/about'), true)
  assert.equal(isCrossPageNavigation(here, '/cv?lang=zh'), false)
  assert.equal(isCrossPageNavigation(here, '/cv#skills'), false)
  assert.equal(isCrossPageNavigation(here, 'https://example.com/about'), false)
  assert.equal(isCrossPageNavigation('not a url', '/about'), false)
})

test('feature detection is defensive', () => {
  assert.equal(supportsViewTransitions(undefined), false)
  assert.equal(supportsViewTransitions({}), false)
  assert.equal(supportsViewTransitions({ startViewTransition() {} }), true)
  assert.equal(prefersReducedMotion(undefined), false)
  assert.equal(prefersReducedMotion({ matchMedia: () => ({ matches: true }) }), true)
  assert.equal(prefersReducedMotion({ matchMedia: () => ({ matches: false }) }), false)
  assert.equal(
    prefersReducedMotion({
      matchMedia: () => {
        throw new Error('blocked')
      },
    }),
    false,
  )
})

test('startViewTransitionSafely calls the API with the document as this and swallows skip rejections', async () => {
  let calledWith: unknown = null
  let boundToDoc = false
  const skipped = () => Promise.reject(new Error('AbortError: skipped'))
  const doc = {
    startViewTransition(this: unknown, cb: () => void) {
      boundToDoc = this === doc
      calledWith = cb
      return { ready: skipped(), finished: skipped(), updateCallbackDone: skipped() }
    },
  }
  const update = () => undefined
  assert.equal(startViewTransitionSafely(doc, update), true)
  assert.equal(calledWith, update)
  assert.equal(boundToDoc, true)
  // Give the swallowed rejections a tick; an unhandled one would fail the run.
  await new Promise((r) => setTimeout(r, 5))

  assert.equal(startViewTransitionSafely({}, update), false)
  assert.equal(
    startViewTransitionSafely(
      {
        startViewTransition() {
          throw new Error('InvalidStateError')
        },
      },
      update,
    ),
    false,
  )
})

test('settleWithin resolves on settle or timeout and never rejects', async () => {
  await settleWithin(Promise.resolve(), 1000)
  await settleWithin(Promise.reject(new Error('x')), 1000)
  const t0 = Date.now()
  await settleWithin(new Promise(() => undefined), 20)
  assert.ok(Date.now() - t0 >= 15)
})

test('TransitionGate holds only pages other than the one on screen', async () => {
  const gate = new TransitionGate()
  gate.commit('/')
  assert.equal(gate.holding, false)
  assert.equal(gate.pendingFor('/about'), null)

  gate.hold()
  assert.equal(gate.holding, true)
  assert.equal(gate.pendingFor('/'), null, 'the current page may re-render')
  const pending = gate.pendingFor('/about')
  assert.ok(pending instanceof Promise)
  assert.equal(gate.pendingFor('/work'), pending, 'one promise per hold')

  let released = false
  pending!.then(() => {
    released = true
  })
  const waited = gate.waitForCommit(1000)
  gate.release()
  await Promise.resolve()
  assert.equal(released, true)
  assert.equal(gate.holding, false)
  assert.equal(gate.pendingFor('/about'), null)

  let committed = false
  waited.then(() => {
    committed = true
  })
  await Promise.resolve()
  assert.equal(committed, false, 'waits for React to commit the new page')
  gate.commit('/about')
  await waited
  assert.equal(committed, true)
})

test('TransitionGate.waitForCommit resolves at once when the page already committed, else times out', async () => {
  const gate = new TransitionGate()
  gate.commit('/')
  gate.hold()
  gate.release()
  gate.commit('/about')
  await gate.waitForCommit(10_000) // would hang the test if it did not resolve immediately

  gate.hold()
  const t0 = Date.now()
  await gate.waitForCommit(20)
  assert.ok(Date.now() - t0 >= 15, 'bounded by the timeout')
  gate.release()
  // Re-committing the same page is not a new commit.
  gate.hold()
  gate.commit('/about')
  const t1 = Date.now()
  await gate.waitForCommit(20)
  assert.ok(Date.now() - t1 >= 15)
  gate.release()
  gate.release() // idempotent
})

test('TransitionGate: routeChangeComplete counts as a commit even when the page key is unchanged', async () => {
  const gate = new TransitionGate()
  gate.commit('/blog/a')
  gate.hold()
  gate.release()
  const waited = gate.waitForCommit(10_000)
  gate.commit('/blog/a') // same key: no layout-effect commit
  gate.markCommitted()
  await waited // would hang the test if markCommitted did not resolve it
})

// ── theme tokens ────────────────────────────────────────────────────────────

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

test('readable text tokens meet WCAG AA (4.5:1) on every page background in both modes', () => {
  const backgrounds = ['page.bg', 'page.bg-elevated', 'page.bg-overlay'] as const
  const texts = ['page.fg', 'page.fg-secondary', 'page.fg-subtle', 'page.fg-prose', 'status.closed'] as const
  for (const mode of ['light', 'dark'] as const) {
    for (const t of texts) {
      for (const b of backgrounds) {
        const ratio = contrast(semanticColors[t][mode], semanticColors[b][mode])
        assert.ok(ratio >= 4.5, `${t} on ${b} (${mode}) = ${ratio.toFixed(2)}`)
      }
    }
  }
})

test('availability status colours meet AA on the page and card backgrounds in both modes', () => {
  assert.deepEqual(semanticColors['page.fg-prose'], { light: '#27272a', dark: '#d4d4d8' })
  assert.deepEqual(semanticColors['status.open'], { light: '#15803d', dark: '#4ade80' })
  assert.deepEqual(semanticColors['status.limited'], { light: '#b45309', dark: '#fbbf24' })
  assert.deepEqual(semanticColors['status.closed'], { light: '#525252', dark: '#a1a1a1' })
  for (const mode of ['light', 'dark'] as const) {
    for (const t of ['status.open', 'status.limited', 'status.closed'] as const) {
      for (const b of ['page.bg', 'page.bg-elevated'] as const) {
        const ratio = contrast(semanticColors[t][mode], semanticColors[b][mode])
        assert.ok(ratio >= 4.5, `${t} on ${b} (${mode}) = ${ratio.toFixed(2)}`)
      }
    }
  }
})

/** rgba(r, g, b, a) composited over an opaque hex background. */
function over(rgba: string, bg: string): string {
  const m = rgba.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/)
  assert.ok(m, `parsable rgba: ${rgba}`)
  const a = Number(m[4])
  const ch = (i: number, fg: number) => Math.round(fg * a + parseInt(bg.slice(i, i + 2), 16) * (1 - a))
  return '#' + [ch(1, Number(m[1])), ch(3, Number(m[2])), ch(5, Number(m[3]))].map((v) => v.toString(16).padStart(2, '0')).join('')
}

test('accent text meets AA on every page background and on the accent-soft wash, in both modes', () => {
  const css = readFileSync(path.join(ROOT, 'styles/globals.css'), 'utf8')
  const soft = css.match(/--accent-soft:\s*(rgba\([^)]*\))/)?.[1]
  assert.ok(soft, '--accent-soft is declared in globals.css')
  for (const mode of ['light', 'dark'] as const) {
    const text = semanticColors['accent.text'][mode]
    for (const b of ['page.bg', 'page.bg-elevated', 'page.bg-overlay'] as const) {
      const bg = semanticColors[b][mode]
      const plain = contrast(text, bg)
      assert.ok(plain >= 4.5, `accent.text on ${b} (${mode}) = ${plain.toFixed(2)}`)
      // Active segmented buttons: accent text on the accent-soft wash.
      const washed = contrast(text, over(soft, bg))
      assert.ok(washed >= 4.5, `accent.text on accent-soft over ${b} (${mode}) = ${washed.toFixed(2)}`)
    }
  }
})

test('white-on-accent buttons meet AA in every state and both modes', () => {
  for (const mode of ['light', 'dark'] as const) {
    for (const bg of ['accent.solid', 'accent.solid-hover', 'accent.solid-active'] as const) {
      const ratio = contrast(semanticColors['accent.fg'][mode], semanticColors[bg][mode])
      assert.ok(ratio >= 4.5, `accent.fg on ${bg} (${mode}) = ${ratio.toFixed(2)}`)
    }
  }
  // The skip link and text selection use the same solid pair.
  const css = readFileSync(path.join(ROOT, 'styles/globals.css'), 'utf8')
  assert.match(css, /\.skip-nav\s*\{[^}]*background:\s*var\(--chakra-colors-accent-solid/)
})

test('the brand accent stays a decorative/UI colour with at least 3:1 on the page backgrounds', () => {
  for (const mode of ['light', 'dark'] as const) {
    const ratio = contrast(palette.accent, semanticColors['page.bg'][mode])
    assert.ok(ratio >= 3, `accent on page.bg (${mode}) = ${ratio.toFixed(2)}`)
  }
})

test('v6 palette and existing token names are intact', () => {
  assert.equal(palette.ink, '#050505')
  assert.equal(palette.paper, '#fdfdfd')
  assert.equal(palette.accent, '#6366f1')
  assert.deepEqual(semanticColors['page.bg'], { light: '#fdfdfd', dark: '#050505' })
  for (const name of ['page.bg', 'page.bg-elevated', 'page.bg-overlay', 'page.fg', 'page.fg-secondary', 'page.muted', 'page.border', 'page.border-strong', 'page.surface', 'accent.fg']) {
    assert.ok(name in semanticColors, name)
  }
  assert.equal(themeColorFor('dark'), '#050505')
  assert.equal(themeColorFor('light'), '#fdfdfd')
})

// ── typography, global CSS, chrome weight ───────────────────────────────────

const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

test('Geist is self-hosted: two preloaded faces, a lazily used italic, the old fonts gone', () => {
  const app = read('pages/_app.tsx')
  // G3: each face is a Latin core plus an extension file (tests/perf-g3-fonts.test.ts).
  assert.match(app, /Geist-Latin\.woff2/)
  assert.match(app, /GeistMono-Latin\.woff2/)
  assert.match(app, /Geist-Italic-Latin\.woff2[^)]*preload:\s*false/s, 'the italic is not preloaded')
  assert.equal((app.match(/preload:\s*true/g) || []).length, 2, 'exactly two preloaded faces')
  assert.match(app, /--font-geist-sans-italic/)
  assert.doesNotMatch(app, /InterVariable|JetBrainsMono/)
  assert.ok(readFileSync(path.join(ROOT, 'public/fonts/OFL-Geist.txt')).length > 0, 'the licence is served')
  for (const f of ['Geist-Latin.woff2', 'Geist-Ext.woff2', 'Geist-Italic-Latin.woff2', 'Geist-Italic-Ext.woff2', 'GeistMono-Latin.woff2', 'GeistMono-Ext.woff2']) {
    assert.ok(readFileSync(path.join(ROOT, 'assets/fonts', f)).length > 0, f)
  }
  for (const f of ['InterVariable.woff2', 'InterVariable-Italic.woff2', 'JetBrainsMono-Variable.woff2', 'Geist-Variable.woff2']) {
    assert.throws(() => readFileSync(path.join(ROOT, 'public/fonts', f)), f)
  }
  // The two preloads stay under the 75 KB budget (scripts/perf-budget.mjs).
  const preloaded = ['Geist-Latin.woff2', 'GeistMono-Latin.woff2'].reduce((n, f) => n + readFileSync(path.join(ROOT, 'assets/fonts', f)).length, 0)
  assert.ok(preloaded < 75 * 1024, `${preloaded} bytes`)
  const theme = read('theme/chakra.js')
  assert.doesNotMatch(theme, /\bInter\b/)
  assert.match(theme, /PingFang SC/)
})

test('globals.css: typography rules, shared utilities and the italic face mapping', () => {
  const css = read('styles/globals.css')
  assert.match(css, /h1,\s*h2,\s*h3,\s*\.chakra-heading\s*\{\s*text-wrap:\s*balance/)
  assert.match(css, /\.article-prose p,\s*\.article-prose li,\s*\.lede\s*\{\s*text-wrap:\s*pretty/)
  assert.match(css, /\.tnum\s*\{\s*font-variant-numeric:\s*tabular-nums/)
  assert.match(css, /em,\s*i,\s*cite,\s*\[data-italic\]\s*\{[^}]*var\(--font-geist-sans-italic\)[^}]*font-style:\s*italic/)
  for (const cls of ['.spotlight', '.hover-list', '.nudge', '.stretched-link::after', '.hit-area::after', '.hint-wrap', '.hint--top', '.hint--left', '.digit', '.hero-word', '.hero-drift', '.rail-fill', '.rail-dot', '.collapse', '.article-prose']) {
    assert.ok(css.includes(cls), cls)
  }
  for (const kf of ['hero-word', 'hero-drift', 'rail-grow', 'dot-on', 'status-pulse', 'vt-out-left', 'vt-in-right', 'vt-out-right', 'vt-in-left']) {
    assert.match(css, new RegExp(`@keyframes ${kf}\\b`), kf)
  }
  assert.match(css, /--grain-opacity:\s*0\.03/)
  assert.match(css, /--grain-opacity:\s*0\.06/)
})

test('globals.css: directional view transitions, pinned header, theme reveal, a11y fallbacks', () => {
  const css = read('styles/globals.css')
  assert.match(css, /html:active-view-transition-type\(next, forward\)::view-transition-old\(root\)\s*\{[^}]*vt-out-left/)
  assert.match(css, /html:active-view-transition-type\(prev, back\)::view-transition-new\(root\)\s*\{[^}]*vt-in-left/)
  assert.match(css, /::view-transition-group\(site-header\)\s*\{\s*animation:\s*none/)
  assert.match(css, /::view-transition-old\(site-header\)\s*\{\s*display:\s*none/)
  assert.match(css, /\.theme-vt::view-transition-new\(root\)\s*\{\s*z-index:\s*2/)
  assert.match(css, /@media \(forced-colors: active\)/)
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/)
  // The global reduced-motion rule still disables every view-transition pseudo.
  assert.match(css, /prefers-reduced-motion: reduce\)\s*\{[\s\S]*::view-transition-new\(\*\)\s*\{\s*animation:\s*none !important/)
  const chrome = read('components/Chrome/SiteChrome.tsx')
  assert.match(chrome, /viewTransitionName: 'site-header'/)
})

test('the header keeps the palette and the drawer out of the shared bundle', () => {
  const header = read('components/Header/Header.tsx')
  assert.doesNotMatch(header, /from ['"]\.\.\/General-UI\/CommandPalette['"]/, 'no static import of the palette')
  assert.match(header, /from ['"]\.\.\/General-UI\/CommandPaletteLazy['"]/)
  assert.doesNotMatch(header, /^import [^\n]*from ['"]\.\/MobileDrawer['"]/m, 'no static import of the drawer')
  assert.match(header, /import\(['"]\.\/MobileDrawer['"]\)/)
  assert.match(read('components/General-UI/CommandPaletteLazy.tsx'), /dynamic\(loadCommandPalette, \{ ssr: false/)
  for (const f of ['components/Header/Header.tsx', 'components/Header/MobileDrawer.tsx', 'components/Footer/Footer.tsx', 'pages/_app.tsx']) {
    assert.doesNotMatch(read(f), /from ['"]react-icons/, f)
  }
  assert.doesNotMatch(read('pages/_app.tsx'), /gtag/)
})

test('theme: one accent focus ring, press feedback, v6 toasts, no body colour fade', () => {
  const theme = read('theme/chakra.js')
  assert.match(theme, /outline:\s*'0 0 0 2px var\(--accent\)'/)
  assert.match(theme, /'\*:focus-visible'/)
  assert.match(theme, /_active:\s*\{\s*transform:\s*'scale\(0\.97\)'\s*\}/)
  assert.match(theme, /v6:\s*\(props\)/)
  assert.match(theme, /transitionProperty:\s*'none'/)
  const app = read('pages/_app.tsx')
  // Every toast closable; its timing comes from one policy (lib/notify via UnifiedToast, H11).
  assert.match(app, /variant:\s*'v6',\s*position:\s*'bottom',\s*isClosable:\s*true/)
  assert.match(app, /component:\s*UnifiedToast/)
  assert.match(app, /toastOptions=\{TOAST_OPTIONS\}/)
})

// ── manifest + icons ────────────────────────────────────────────────────────

function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(path.join(ROOT, 'public', file))
  assert.equal(buf.subarray(1, 4).toString('ascii'), 'PNG', `${file} is a PNG`)
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

test('web manifest declares real, correctly sized icons and the v6 colours', () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'public/manifest.json'), 'utf8'))
  assert.equal(manifest.name, 'Li Yanpei (Lucian)')
  assert.equal(manifest.short_name, 'Lucian')
  assert.equal(manifest.theme_color, palette.ink)
  assert.equal(manifest.background_color, palette.ink)
  assert.equal(manifest.start_url, '/')
  const icons: Array<{ src: string; sizes: string; type: string; purpose?: string }> = manifest.icons
  const byPurpose = (p: string) => icons.filter((i) => (i.purpose || 'any').split(' ').includes(p))
  assert.ok(byPurpose('any').some((i) => i.sizes === '192x192'))
  assert.ok(byPurpose('any').some((i) => i.sizes === '512x512'))
  assert.ok(byPurpose('maskable').some((i) => i.sizes === '512x512'))
  for (const icon of icons) {
    assert.equal(icon.type, 'image/png')
    const [w, h] = icon.sizes.split('x').map(Number)
    assert.deepEqual(pngSize(icon.src.replace(/^\//, '')), { width: w, height: h }, icon.src)
  }
  assert.deepEqual(pngSize('icons/apple-touch-icon.png'), { width: 180, height: 180 })
})

// ── next.config: a plain object, built with webpack ─────────────────────────

function loadNextConfig(env: Record<string, string>) {
  const out = execFileSync(
    process.execPath,
    [
      '-e',
      // `sentry` reports whether any @sentry package was loaded at all.
      "const c = require('./next.config.js'); const sentry = Object.keys(require.cache).some((k) => /[\\\\/]@sentry[\\\\/]/.test(k)); process.stdout.write(JSON.stringify({ webpack: typeof c.webpack, output: c.output, headers: typeof c.headers, sentry, scrollRestoration: c.experimental && c.experimental.scrollRestoration }))",
    ],
    { cwd: ROOT, env: { PATH: process.env.PATH ?? '', NODE_ENV: 'production', ...env }, encoding: 'utf8' },
  )
  return JSON.parse(out) as { webpack: string; output: string; headers: string; sentry: boolean; scrollRestoration: boolean }
}

test('next.config is the plain config object: no Sentry wrap (removed), even with a DSN in the environment', () => {
  // No webpack hook: the one it had silenced an Edge-runtime warning of the old
  // middleware.ts; proxy.ts runs on Node.js, and the build has no warning to hide.
  const expected = { webpack: 'undefined', output: 'standalone', headers: 'function', sentry: false, scrollRestoration: true }
  assert.deepEqual(loadNextConfig({}), expected)
  assert.deepEqual(loadNextConfig({ NEXT_PUBLIC_SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0' }), expected)
})

test('dev and build opt out of Turbopack (the Next 16 default) with --webpack; no Sentry SDK dependency', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert.match(pkg.scripts.build, /^next build --webpack(\s|$)/)
  assert.match(pkg.scripts.dev, /^next dev --webpack(\s|$)/)
  assert.equal(pkg.dependencies['@sentry/nextjs'], undefined)
  assert.equal(pkg.devDependencies['@sentry/nextjs'], undefined)
})
