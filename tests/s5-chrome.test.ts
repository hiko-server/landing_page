import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  CHROMELESS_ROUTES,
  PRIMARY_LINKS,
  SOCIAL_LINKS,
  formatAge,
  isActiveRoute,
  normalizeHost,
  resolveHtmlLang,
  resolveSocialLinks,
  routeHasChrome,
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
  const builtIn = SOCIAL_LINKS.map((s) => s.url)
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
  const texts = ['page.fg', 'page.fg-secondary', 'page.fg-subtle'] as const
  for (const mode of ['light', 'dark'] as const) {
    for (const t of texts) {
      for (const b of backgrounds) {
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

// ── manifest + icons ────────────────────────────────────────────────────────

function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(path.join(ROOT, 'public', file))
  assert.equal(buf.subarray(1, 4).toString('ascii'), 'PNG', `${file} is a PNG`)
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

test('web manifest declares real, correctly sized icons and the v6 colours', () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'public/manifest.json'), 'utf8'))
  assert.equal(manifest.name, 'lucian-dev.com')
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

// ── Sentry build gating ─────────────────────────────────────────────────────

function loadNextConfig(env: Record<string, string>) {
  const out = execFileSync(
    process.execPath,
    [
      '-e',
      // `sentry` reports whether @sentry/nextjs was loaded at all — the only
      // reliable signal that the config was wrapped by withSentryConfig.
      "const c = require('./next.config.js'); const sentry = Object.keys(require.cache).some((k) => /[\\\\/]@sentry[\\\\/]nextjs[\\\\/]/.test(k)); process.stdout.write(JSON.stringify({ webpack: typeof c.webpack, output: c.output, headers: typeof c.headers, sentry, scrollRestoration: c.experimental && c.experimental.scrollRestoration }))",
    ],
    { cwd: ROOT, env: { PATH: process.env.PATH ?? '', NODE_ENV: 'production', ...env }, encoding: 'utf8' },
  )
  return JSON.parse(out) as { webpack: string; output: string; headers: string; sentry: boolean; scrollRestoration: boolean }
}

test('next.config is only wrapped with Sentry when a DSN is set at build time', () => {
  const plain = loadNextConfig({})
  // The base config always has a webpack hook (it silences two known
  // OpenTelemetry warnings) but never loads the Sentry build plugin.
  assert.deepEqual(plain, { webpack: 'function', output: 'standalone', headers: 'function', sentry: false, scrollRestoration: true })
  const wrapped = loadNextConfig({ NEXT_PUBLIC_SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0' })
  assert.equal(wrapped.sentry, true)
  assert.equal(wrapped.webpack, 'function')
  assert.equal(wrapped.output, 'standalone')
  assert.equal(wrapped.headers, 'function')
  assert.equal(wrapped.scrollRestoration, true)
})
