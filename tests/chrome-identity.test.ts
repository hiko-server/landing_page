/**
 * chrome-identity stream: A3 (brand mark, hero seam, portrait frame), G8
 * (manifest), A5 (footer, drawer, keyboard hints), C4 (drag-to-close menu),
 * B5 (release timeline, /now dedupe, 404 suggestions, EmptyState).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  ICON_FILES,
  ICO_SIZES,
  L_POINTS,
  MARK_GRID,
  MARK_ON_INK,
  MARK_ON_PAPER,
  MARK_STROKE,
  MASKABLE_SCALE,
  SAFE_ZONE_RADIUS,
  Y_POINTS,
  icoFromPngs,
  markBounds,
  markSvg,
} from '../lib/brandMark'
import { REPO_URL, buildCommit, normalizeBuildSha } from '../lib/build'
import { HIDE_ON_COARSE_POINTER, isApplePlatform, paletteKeyShortcuts, paletteShortcutLabel } from '../components/Chrome/platform'
import { OPEN_PALETTE_EVENT, PALETTE_QUERY_MAX, normalizePaletteQuery, openCommandPalette } from '../components/Chrome/paletteEvents'
import {
  CLOSE_DISTANCE_RATIO,
  CLOSE_VELOCITY,
  DRAG_SLOP,
  OVERDRAG_ELASTIC,
  RESTAGGER_AFTER_MS,
  SHEET_CLOSE_S,
  VELOCITY_WINDOW_MS,
  classifyMove,
  closeDurationMs,
  dragOffset,
  prefersReducedMotion,
  pushSample,
  releaseVelocity,
  scrimProgress,
  scrimVariants,
  sheetVariants,
  shouldCloseOnRelease,
  shouldStaggerLinks,
  type DragSample,
} from '../components/Header/drawerGesture'
import { ABOUT_SITE_LINKS, FOOTER_COLUMNS, PRIVACY_HREF, SITE_LINKS } from '../components/Footer/footerLinks'
import { PRIMARY_LINKS, adminEditTarget } from '../components/Chrome/chrome'
import { adminEditTarget as adminEditTargetDirect } from '../components/Chrome/adminEditTarget'
import { FEEDS } from '../lib/feeds'
import { bodyReferences, dedupeNowSignals, normalizeSitePath, normalizeText, nowUpdatedOn } from '../lib/nowDedupe'
import type { NowSignals } from '../lib/nowSignals'
import {
  STATIC_CANDIDATES,
  SUGGESTION_LIMIT,
  candidatesFrom,
  editDistance,
  normalizeRequestedPath,
  queryFromPath,
  similarity,
  suggestPages,
} from '../lib/notFoundSuggest'
import { releaseAnchor, releaseChangeCount, releaseIdFromHash } from '../lib/releaseTimeline'
import { PORTRAIT_DARK_FILTER, PORTRAIT_MAT, portraitFrameSx } from '../components/LandingPage/portraitFrame'
import { palette, semanticColors } from '../theme/color'
import { parseChangelog } from '../lib/changelog'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
/** Source without comments, so assertions see code only. */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, '$1')

function luminance(hex: string): number {
  const c = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

// ── A3: the brand mark ──────────────────────────────────────────────────────

test('A3: the LY mark sits centred on its grid with equal stroke weights', () => {
  for (const [x, y] of [...L_POINTS, ...Y_POINTS]) {
    assert.ok(x >= 0 && x <= MARK_GRID && y >= 0 && y <= MARK_GRID, `${x},${y}`)
  }
  const b = markBounds()
  assert.ok(Math.abs(b.x + b.width / 2 - MARK_GRID / 2) <= 1, 'centred horizontally')
  assert.ok(Math.abs(b.y + b.height / 2 - MARK_GRID / 2) <= 1, 'centred vertically')
  // L stem and foot, Y stem: the stroke weight.
  assert.equal(L_POINTS[1][0] - L_POINTS[0][0], MARK_STROKE)
  assert.equal(L_POINTS[4][1] - L_POINTS[2][1], MARK_STROKE)
  assert.equal(Y_POINTS[6][0] - Y_POINTS[7][0], MARK_STROKE)
  // Y arms: outer and inner edges parallel; perpendicular thickness ≈ the stroke.
  const slope = (a: readonly number[], c: readonly number[]) => (c[0] - a[0]) / (c[1] - a[1])
  assert.ok(Math.abs(slope(Y_POINTS[0], Y_POINTS[8]) - slope(Y_POINTS[1], Y_POINTS[2])) < 0.01, 'left arm edges parallel')
  assert.ok(Math.abs(slope(Y_POINTS[4], Y_POINTS[5]) - slope(Y_POINTS[3], Y_POINTS[2])) < 0.01, 'right arm edges parallel')
  const horizontal = Y_POINTS[1][0] - Y_POINTS[0][0]
  const perpendicular = horizontal * Math.cos(Math.atan(slope(Y_POINTS[0], Y_POINTS[8])))
  assert.ok(Math.abs(perpendicular - MARK_STROKE) < 3, `arm thickness ${perpendicular}`)
  // The letters never touch: the L's foot keeps clear of the Y's stem.
  assert.ok(Y_POINTS[7][0] - L_POINTS[3][0] >= 24)
  assert.ok(Y_POINTS[0][0] - L_POINTS[1][0] >= 24)
})

test('A3: the maskable icon keeps the letters inside the safe zone', () => {
  const c = MARK_GRID / 2
  for (const [x, y] of [...L_POINTS, ...Y_POINTS]) {
    const d = Math.hypot((x - c) * MASKABLE_SCALE, (y - c) * MASKABLE_SCALE)
    assert.ok(d < SAFE_ZONE_RADIUS - 20, `${x},${y} → ${d.toFixed(1)}`)
  }
  const square = markSvg('square', MASKABLE_SCALE)
  assert.doesNotMatch(square, /rx=/, 'full bleed: the launcher applies its own mask')
  assert.equal(ICON_FILES.find((f) => f.file.includes('maskable'))?.scale, MASKABLE_SCALE)
})

test('A3: the adaptive SVG favicon follows prefers-color-scheme with on-brand colours', () => {
  const svg = markSvg('adaptive')
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 512 512">/)
  assert.match(svg, /<title>LY<\/title>/)
  assert.match(svg, /@media \(prefers-color-scheme:dark\)\{\.t\{fill:#fafafa\}\.l\{fill:#050505\}\.y\{fill:#4f46e5\}\}/)
  assert.match(svg, /\.t\{fill:#050505\}\.l\{fill:#fafafa\}\.y\{fill:#818cf8\}/)
  assert.match(markSvg('tile'), /rx="112"/)
  // The palette is the site's own (theme/color.ts).
  assert.equal(MARK_ON_INK.tile, palette.ink)
  assert.equal(MARK_ON_INK.letter, semanticColors['page.fg'].dark)
  assert.equal(MARK_ON_INK.accent, semanticColors['accent.text'].dark)
  assert.equal(MARK_ON_PAPER.accent, semanticColors['accent.text'].light)
  // Legible in both renderings: text-level contrast for the L, ≥ 3:1 (graphics) for the Y.
  for (const c of [MARK_ON_INK, MARK_ON_PAPER]) {
    assert.ok(contrast(c.letter, c.tile) >= 7, `L ${contrast(c.letter, c.tile)}`)
    assert.ok(contrast(c.accent, c.tile) >= 4.5, `Y ${contrast(c.accent, c.tile)}`)
  }
  // public/icon.svg is the generated file, in sync with the module.
  assert.equal(read('public/icon.svg'), `${svg}\n`)
})

function pngSize(rel: string): { width: number; height: number } {
  const buf = readFileSync(path.join(ROOT, 'public', rel))
  assert.equal(buf.subarray(1, 4).toString('ascii'), 'PNG', rel)
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

test('A3: the PNG icons and the ICO are rendered at their declared sizes', () => {
  for (const f of ICON_FILES) assert.deepEqual(pngSize(f.file), { width: f.size, height: f.size }, f.file)
  const ico = readFileSync(path.join(ROOT, 'public/favicon.ico'))
  assert.equal(ico.readUInt16LE(0), 0)
  assert.equal(ico.readUInt16LE(2), 1, 'icon type')
  assert.equal(ico.readUInt16LE(4), ICO_SIZES.length)
  ICO_SIZES.forEach((size, i) => {
    const e = 6 + 16 * i
    assert.equal(ico.readUInt8(e), size)
    const length = ico.readUInt32LE(e + 8)
    const offset = ico.readUInt32LE(e + 12)
    assert.equal(ico.subarray(offset + 1, offset + 4).toString('ascii'), 'PNG')
    assert.equal(ico.readUInt32BE(offset + 16), size, 'embedded PNG width')
    assert.ok(offset + length <= ico.length)
  })
  // The old emoji favicon and selfie icons are gone.
  assert.equal(existsSync(path.join(ROOT, 'public/images/favicon-32x32.png')), false)
  assert.equal(existsSync(path.join(ROOT, 'public/apple-icon.png')), false)
  assert.match(read('scripts/build-icons.mjs'), /from '\.\.\/lib\/brandMark\.ts'/)
})

test('A3: icoFromPngs writes a valid directory (256 px as 0)', () => {
  const a = new Uint8Array([1, 2, 3])
  const b = new Uint8Array([4, 5])
  const out = Buffer.from(icoFromPngs([{ size: 16, png: a }, { size: 256, png: b }]))
  assert.equal(out.readUInt16LE(4), 2)
  assert.equal(out.readUInt8(6), 16)
  assert.equal(out.readUInt8(6 + 16), 0, '256 is written as 0')
  assert.equal(out.readUInt32LE(6 + 8), 3)
  assert.equal(out.readUInt32LE(6 + 12), 6 + 32)
  assert.deepEqual([...out.subarray(38, 41)], [1, 2, 3])
  assert.deepEqual([...out.subarray(41, 43)], [4, 5])
})

test('A3: one icon set in <head>: the SVG, its ICO fallback and the Apple icon', () => {
  const app = code('pages/_app.tsx')
  assert.match(app, /<link rel="icon" href="\/favicon\.ico" sizes="32x32" \/>/)
  assert.match(app, /<link rel="icon" type="image\/svg\+xml" href="\/icon\.svg" \/>/)
  assert.match(app, /<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png" \/>/)
  assert.doesNotMatch(app, /favicon-32x32/)
  // The footer shows the same mark inline, from the same geometry.
  const mark = code('components/Icons/BrandMark.tsx')
  assert.match(mark, /L_POINTS, MARK_GRID, MARK_TILE_RADIUS, Y_POINTS/)
  assert.match(code('components/Footer/Footer.tsx'), /<BrandMark size=\{28\} \/>/)
})

test('A3: the hero dissolves into the page and its dot grid continues the page grid', () => {
  const hero = code('components/Background/HeroAmbient.tsx')
  assert.match(hero, /HERO_FADE_MASK = `linear-gradient\(180deg, #000 0, #000 calc\(100% - \$\{HERO_FADE\}\), transparent 100%\)`/)
  assert.match(hero, /maskImage: HERO_FADE_MASK, WebkitMaskImage: HERO_FADE_MASK/)
  assert.match(hero, /HERO_GRID_POSITION = '0 calc\(-1 \* var\(--header-h, 57px\)\)'/)
  assert.match(hero, /radial-gradient\(circle at center, var\(--dot-color\) 1px, transparent 1px\)/)
  assert.match(hero, /backgroundPosition: HERO_GRID_POSITION/)
  // The body grid uses the same tile size and colour variable.
  assert.match(read('theme/chakra.js'), /var\(--dot-color, rgba\(0,0,0,0\.05\)\) 1px, transparent 1px\)'/)
  assert.match(read('theme/chakra.js'), /backgroundSize: '16px 16px'/)
  assert.match(read('styles/globals.css'), /--header-h: 57px;/)
})

test('A3: the white-background portrait is matted in dark mode only', () => {
  const dark = "[data-theme='dark'] &, .chakra-ui-dark &"
  for (const size of ['card', 'avatar'] as const) {
    const sx = portraitFrameSx(size) as Record<string, any>
    const after = sx[dark]['&::after']
    assert.equal(sx[dark]['& img'].filter, PORTRAIT_DARK_FILTER)
    assert.match(after.boxShadow, new RegExp(`inset 0 0 0 ${PORTRAIT_MAT[size]}px var\\(--chakra-colors-page-bg-elevated\\)`))
    assert.equal(after.pointerEvents, 'none')
    assert.equal(after.borderRadius, 'inherit')
    assert.equal(sx['@media (forced-colors: active)']['&::after'].display, 'none')
    assert.equal(Object.keys(sx).filter((k) => !k.startsWith('@media') && k !== dark).length, 0, 'nothing changes in light mode')
  }
  const info = code('components/LandingPage/PersonalInfo.tsx')
  assert.match(info, /sx=\{\{ \.\.\.settleSx\(2\), \.\.\.portraitFrameSx\('avatar'\) \}\}/)
  assert.match(info, /sx=\{portraitFrameSx\('card'\)\}/)
})

// ── G8: manifest ────────────────────────────────────────────────────────────

test('G8: the manifest names the owner, lists real shortcuts and registers no service worker', () => {
  const m = JSON.parse(read('public/manifest.json'))
  assert.equal(m.name, 'Li Yanpei (Lucian)')
  assert.ok(m.short_name.length <= 12)
  assert.equal(m.id, '/')
  assert.equal(m.display, 'standalone')
  assert.deepEqual(m.launch_handler, { client_mode: 'navigate-existing' })
  const routes: Record<string, string> = { '/cv': 'pages/cv/index.tsx', '/cv/zh': 'pages/cv/zh.tsx', '/blog': 'pages/blog/index.tsx', '/contact': 'pages/contact/index.tsx' }
  assert.deepEqual(m.shortcuts.map((s: { url: string }) => s.url), Object.keys(routes))
  for (const s of m.shortcuts) {
    assert.ok(s.name && s.description, s.url)
    assert.ok(existsSync(path.join(ROOT, routes[s.url])), s.url)
  }
  assert.equal(m.screenshots, undefined, 'no screenshots that would go stale')
  for (const icon of m.icons) assert.ok(ICON_FILES.some((f) => `/${f.file}` === icon.src), icon.src)
  // No service worker (decision G8).
  assert.equal(existsSync(path.join(ROOT, 'public/sw.js')), false)
  for (const f of ['pages/_app.tsx', 'pages/_document.tsx', 'components/Chrome/SiteChrome.tsx']) {
    assert.doesNotMatch(read(f), /serviceWorker/, f)
  }
})

// ── A5: footer, drawer, keyboard hints ──────────────────────────────────────

test('A5: footer columns — site, this site (colophon, privacy, feeds, source), elsewhere', () => {
  assert.deepEqual([...FOOTER_COLUMNS], ['Site', 'This site', 'Elsewhere'])
  assert.equal(SITE_LINKS, PRIMARY_LINKS)
  const hrefs = ABOUT_SITE_LINKS.map((l) => l.href)
  assert.deepEqual(hrefs.slice(0, 2), ['/colophon', PRIVACY_HREF])
  assert.equal(PRIVACY_HREF, '/colophon#privacy')
  assert.match(read('pages/colophon.tsx'), /\{ id: 'privacy', label: 'Privacy & analytics' \}/)
  for (const f of FEEDS) assert.ok(ABOUT_SITE_LINKS.some((l) => l.href === f.href && l.type === f.type), f.href)
  assert.deepEqual(ABOUT_SITE_LINKS.at(-1), { label: 'Source', href: REPO_URL, external: true })
  const footer = code('components/Footer/Footer.tsx')
  assert.doesNotMatch(footer, /All rights reserved/)
  assert.doesNotMatch(footer, /justifyContent=\{\{ base: 'center'/, 'no centred row that strands Contact')
  assert.match(footer, /gridTemplateAreas=\{\{ base: `"brand brand" "site meta" "site else"`, md: `"brand site meta else"` \}\}/)
  assert.match(footer, /BUILD_COMMIT && \(/)
  // F3: the footer's words are the chrome's dictionary's (Chinese on a Chinese page).
  assert.match(footer, /aria-label=\{t\.footerNav\}/)
})

test('A5: the build line names the deployed commit, or nothing', () => {
  assert.equal(normalizeBuildSha(' 1A2E842 '), '1a2e842')
  assert.equal(normalizeBuildSha('e948d48c0ffee'), 'e948d48c0ffee')
  for (const bad of ['', 'main', '12345', 'g948d48', null, undefined, 42]) assert.equal(normalizeBuildSha(bad), null, String(bad))
  assert.deepEqual(buildCommit('e948d48aaaa'), { sha: 'e948d48aaaa', short: 'e948d48', href: `${REPO_URL}/commit/e948d48aaaa` })
  assert.equal(buildCommit(''), null)
  // /colophon reads the same helper.
  assert.match(code('pages/colophon.tsx'), /buildSha: normalizeBuildSha\(process\.env\.NEXT_PUBLIC_BUILD_SHA\)/)
})

test('A5: palette shortcut label by platform; hints hidden on touch-first devices', () => {
  assert.equal(isApplePlatform({ platform: 'MacIntel' }), true)
  assert.equal(isApplePlatform({ platform: 'iPhone' }), true)
  assert.equal(isApplePlatform({ userAgentData: { platform: 'iOS' }, platform: 'Linux armv8l' }), true)
  assert.equal(isApplePlatform({ userAgentData: { platform: 'macOS' } }), true)
  assert.equal(isApplePlatform({ userAgentData: { platform: 'Windows' }, platform: 'Win32' }), false)
  assert.equal(isApplePlatform({ userAgentData: { platform: 'Android' } }), false)
  assert.equal(isApplePlatform({ platform: 'Linux x86_64' }), false)
  assert.equal(isApplePlatform({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' }), true)
  assert.equal(isApplePlatform(undefined), false)
  assert.equal(paletteShortcutLabel(true), '⌘K')
  assert.equal(paletteShortcutLabel(false), 'Ctrl K')
  assert.equal(paletteKeyShortcuts(true, true), 'Meta+K /')
  assert.equal(paletteKeyShortcuts(false, false), 'Control+K')
  // Hidden on touch-first devices until a hardware keyboard has been used there (UX-A-4).
  assert.deepEqual(HIDE_ON_COARSE_POINTER, { '@media (pointer: coarse)': { 'html:not([data-keyboard]) &': { display: 'none !important' } } })
  const header = code('components/Header/Header.tsx')
  assert.match(header, /sx=\{HIDE_ON_COARSE_POINTER\}\s*>\s*\{paletteShortcutLabel\(isMac\)\}/)
  const palette = code('components/General-UI/CommandPalette.tsx')
  assert.equal((palette.match(/sx=\{HIDE_ON_COARSE_POINTER\}/g) || []).length, 3, 'every Key, the cheatsheet and the footer hints')
})

test('A5: the drawer theme control pairs each icon with its own label', () => {
  const drawer = code('components/Header/MobileDrawer.tsx')
  assert.doesNotMatch(drawer, /'Light mode'|'Dark mode'/)
  assert.match(drawer, /<ThemeSwitch \/>/)
  const sw = code('components/Header/ThemeSwitch.tsx')
  // System / Light / Dark from the tokens-theme preference model: the same options, icons and store as the header menu.
  assert.match(sw, /const ICONS: Record<ThemePreference, typeof SunIcon> = \{ system: MonitorIcon, light: SunIcon, dark: MoonIcon \}/)
  assert.match(sw, /import \{ THEME_OPTIONS as PREFERENCE_OPTIONS \} from '\.\/themeMenuKeys'/)
  assert.match(sw, /const \{ preference, choose \} = useThemePreference\(\)/)
  assert.match(sw, /const pressed = preference === value/)
  assert.match(sw, /aria-pressed=\{pressed\}/)
  assert.match(sw, /role="group"\s*aria-label=\{t\.theme\}/)
  assert.match(sw, /if \(!pressed\) choose\(value, e\.currentTarget\)/)
  assert.doesNotMatch(sw, /toggleColorMode|useColorMode/, 'never a two-state toggle that would overwrite System')
  // Quick actions and large links.
  // F3: the drawer's words are the menu dictionary's, in the chrome's language.
  assert.match(drawer, /aria-label=\{m\.quickActions\}/)
  // CV as PDF downloads the server-rendered PDF in the chrome's language (cv-docs E2, F3).
  assert.match(drawer, /href=\{cvPdfPath\(uiLang === 'en' \? 'en' : 'zh'\)\} download/)
  assert.doesNotMatch(drawer, /print=1/)
  // …and the other tile opens the CV in the other language.
  assert.match(drawer, /uiLang === 'en' \? \{ href: '\/cv\/zh', lang: 'zh-Hans' \} : \{ href: '\/cv', lang: 'en' \}/)
  assert.match(drawer, /onClick=\{onSearch\} aria-haspopup="dialog"/)
  assert.match(drawer, /fontSize="26px"/)
})

test('A5: the palette opens from page content with a prefilled query', () => {
  assert.equal(normalizePaletteQuery('  work \n swc  '), 'work swc')
  assert.equal(normalizePaletteQuery(42), '')
  assert.equal(normalizePaletteQuery('x'.repeat(200)).length, PALETTE_QUERY_MAX)
  const seen: unknown[] = []
  const g = globalThis as unknown as { window?: unknown }
  const had = 'window' in g
  g.window = { dispatchEvent: (e: CustomEvent) => seen.push([e.type, e.detail]) }
  try {
    openCommandPalette('  blog   carboy ')
  } finally {
    if (!had) delete g.window
  }
  assert.deepEqual(seen, [[OPEN_PALETTE_EVENT, { query: 'blog carboy', page: null, instant: false }]])
  const header = code('components/Header/Header.tsx')
  assert.match(header, /window\.addEventListener\(OPEN_PALETTE_EVENT, onOpen\)/)
  assert.match(header, /initialQuery=\{paletteQuery\}/)
  assert.match(code('components/General-UI/CommandPalette.tsx'), /setQuery\(initialQueryRef\.current\)/)
})

test('A5: palette-only and admin-only code stays out of the shared bundle', () => {
  assert.equal(adminEditTarget, adminEditTargetDirect, 'chrome.ts re-exports the moved helper')
  assert.match(code('components/General-UI/CommandPalette.tsx'), /import \{ adminEditTarget \} from '\.\.\/Chrome\/adminEditTarget'/)
  const boundary = code('components/Common/ErrorBoundary.tsx')
  assert.doesNotMatch(boundary, /PanelFallback|copyText|unsavedText/)
  assert.match(code('components/Common/PanelFallback.tsx'), /export function PanelFallback/)
  for (const f of ['pages/admin/dashboard.tsx', 'components/Admin/shell/LivePreview.tsx']) {
    assert.match(code(f), /import \{ PanelFallback \} from '.*Common\/PanelFallback'/, f)
  }
  // The drawer's gesture uses no framer-motion primitives (they would split framer out of the shared chunk).
  assert.doesNotMatch(code('components/Header/MobileDrawer.tsx'), /from 'framer-motion'/)
})

// ── C4: drag-to-close ───────────────────────────────────────────────────────

test('C4: release decision — 35 % of the width or a 500 px/s flick, rightwards only', () => {
  assert.equal(CLOSE_DISTANCE_RATIO, 0.35)
  assert.equal(CLOSE_VELOCITY, 500)
  assert.equal(shouldCloseOnRelease(120, 0, 320), true, '37.5 %')
  assert.equal(shouldCloseOnRelease(100, 0, 320), false, '31 %')
  assert.equal(shouldCloseOnRelease(30, 900, 320), true, 'flick')
  assert.equal(shouldCloseOnRelease(30, 400, 320), false)
  assert.equal(shouldCloseOnRelease(-20, 900, 320), false, 'never when pulled left')
  assert.equal(shouldCloseOnRelease(0, 900, 320), false)
  assert.equal(shouldCloseOnRelease(200, 0, 0), false, 'unknown width: distance alone never closes')
})

test('C4: drag geometry — slop, direction, elastic overdrag, scrim', () => {
  assert.equal(classifyMove(DRAG_SLOP - 1, 2), null)
  assert.equal(classifyMove(12, 3), 'drag')
  assert.equal(classifyMove(-12, 3), 'drag')
  assert.equal(classifyMove(4, 12), 'scroll')
  assert.equal(dragOffset(80), 80)
  assert.equal(dragOffset(-100), -100 * OVERDRAG_ELASTIC)
  assert.equal(dragOffset(Number.NaN), 0)
  assert.equal(scrimProgress(0, 320), 1)
  assert.equal(scrimProgress(160, 320), 0.5)
  assert.equal(scrimProgress(400, 320), 0)
  assert.equal(scrimProgress(-10, 320), 1)
  assert.equal(scrimProgress(50, 0), 1)
})

test('C4: release velocity from the last 100 ms of movement', () => {
  let samples: DragSample[] = []
  for (const [t, x] of [[0, 0], [50, 10], [200, 20], [220, 40], [240, 60]]) samples = pushSample(samples, { t, x })
  assert.ok(samples.every((s) => 240 - s.t <= VELOCITY_WINDOW_MS), 'old samples dropped')
  assert.equal(releaseVelocity(samples, 240), 1000, '40 px in 40 ms')
  assert.equal(releaseVelocity(samples, 600), 0, 'the finger stopped before lifting')
  assert.equal(releaseVelocity([{ t: 0, x: 0 }], 10), 0)
  assert.equal(closeDurationMs(200, 0), SHEET_CLOSE_S * 1000)
  assert.equal(closeDurationMs(200, 4000), 120, 'never faster than 120 ms')
  assert.ok(closeDurationMs(200, 1500) < SHEET_CLOSE_S * 1000)
})

test('C4: entrance and reduced motion', () => {
  assert.equal(shouldStaggerLinks(null, 1000, false), true)
  assert.equal(shouldStaggerLinks(1000, 1000 + RESTAGGER_AFTER_MS - 1, false), false, 'a quick re-open skips it')
  assert.equal(shouldStaggerLinks(1000, 1000 + RESTAGGER_AFTER_MS + 1, false), true)
  assert.equal(shouldStaggerLinks(null, 1000, true), false)
  assert.equal(sheetVariants(true).enter.transition.duration, 0)
  assert.equal(sheetVariants(true).exit.transition.duration, 0)
  assert.equal(scrimVariants(true).exit.transition.duration, 0)
  assert.equal(sheetVariants(false).exit.x, '100%')
  assert.ok(sheetVariants(false).enter.transition.duration > 0)
  assert.equal(prefersReducedMotion({ matchMedia: (q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)' }) }), true)
  assert.equal(prefersReducedMotion(undefined), false)
  assert.equal(
    prefersReducedMotion({
      matchMedia: () => {
        throw new Error('no')
      },
    }),
    false,
  )
})

test('C4: the drawer wires the gesture on an inner panel and keeps the dialog contract', () => {
  const drawer = code('components/Header/MobileDrawer.tsx')
  assert.match(drawer, /<Drawer\s+id=\{MOBILE_MENU_ID\}/)
  assert.match(drawer, /<DrawerContent lang=\{chromeLang\}/)
  assert.match(drawer, /initialFocusRef=\{firstLinkRef\}/)
  assert.match(drawer, /returnFocusOnClose=\{returnFocusOnClose\}/)
  assert.match(drawer, /ref=\{panelRef\}\s*data-drawer-panel=""/)
  assert.match(drawer, /sx=\{\{ touchAction: 'pan-y' \}\}/)
  assert.match(drawer, /onPointerCancel=\{\(e\) => endGesture\(e, true\)\}/)
  assert.match(drawer, /onClickCapture=\{onClickCapture\}/)
  assert.match(drawer, /motionProps=\{\{ variants: sheetVariants\(reduceMotion\) \}\}/)
  assert.match(drawer, /variants: scrimVariants\(reduceMotion\)/)
  assert.doesNotMatch(drawer, /layoutId/, 'no sliding active bar: the menu closes before it could move')
  // The overlay and the dialog keep Chakra's classes, so route transitions still lift them (FIX-03).
  assert.match(read('lib/viewTransition.ts'), /DISMISSIBLE_LAYER_SELECTOR = '\.chakra-modal__overlay, \.chakra-modal__content'/)
})

// ── B5: colophon timeline ───────────────────────────────────────────────────

test('B5: release anchors, hash lookup and change counts', () => {
  assert.equal(releaseAnchor('2.3.0'), 'v2-3-0')
  assert.equal(releaseIdFromHash('#v2-2-0', ['2.3.0', '2.2.0']), '2.2.0')
  assert.equal(releaseIdFromHash('v2-3-0', ['2.3.0']), '2.3.0')
  assert.equal(releaseIdFromHash('#privacy', ['2.3.0']), null)
  assert.equal(releaseIdFromHash('#%E0%A4%A', ['2.3.0']), null, 'malformed escapes are ignored')
  assert.equal(releaseIdFromHash('', ['2.3.0']), null)
  assert.equal(releaseChangeCount([{ count: 3 }, { count: 2 }, { count: -1 }, { count: Number.NaN }]), 5)
  // Every release in the real changelog has a summary paragraph and notes.
  const releases = parseChangelog(read('CHANGELOG.md'))
  assert.ok(releases.length >= 2)
  assert.ok(releases.slice(0, 3).every((r) => r.groups.length > 0))
  const colophon = code('pages/colophon.tsx')
  assert.match(colophon, /useState<ReadonlySet<string>>\(\(\) => new Set\(releases\[0\] \? \[releases\[0\]\.version\] : \[\]\)\)/, 'only the latest opens by default')
  assert.match(colophon, /aria-expanded=\{isOpen\}/)
  assert.match(colophon, /<Collapse open=\{isOpen\} id=\{`\$\{id\}-notes`\}>/)
  assert.match(colophon, /window\.addEventListener\('hashchange', openFromHash\)/)
})

// ── B5: /now ────────────────────────────────────────────────────────────────

const el = (tagName: string, properties: Record<string, unknown>, children: unknown[] = []) => ({ type: 'element', tagName, properties, children })
const txt = (value: string) => ({ type: 'text', value })

const SIGNALS: NowSignals = {
  roles: [
    { kind: 'study', status: 'current', title: 'MSc in Artificial Intelligence for Science', org: 'The Chinese University of Hong Kong', location: 'Hong Kong', when: 'Sep 2026 – Expected Dec 2028' },
    { kind: 'work', status: 'upcoming', title: 'Data Engineer', org: 'Example Org', location: '', when: 'Starts Jan 2027' },
  ],
  coding: { label: 'currently coding', project: 'WeGreen AI', note: '' },
  post: { title: 'A post', href: '/blog/swcs', description: '', date: 'May 30, 2026', dateTime: '2026-05-30' },
  work: { title: 'A case study', href: '/work/swcs', description: '', date: '2025 – 2026', dateTime: '' },
  composed: '2026-10-13',
}

test('B5: site paths and text are normalised before comparing', () => {
  assert.equal(normalizeSitePath('/blog/swcs/', 'lucian-dev.com'), '/blog/swcs')
  assert.equal(normalizeSitePath('https://www.lucian-dev.com/Blog/SWCS?ref=x#top', 'lucian-dev.com'), '/blog/swcs')
  assert.equal(normalizeSitePath('blog/swcs', 'lucian-dev.com'), '/blog/swcs', 'relative to /now')
  assert.equal(normalizeSitePath('https://example.com/blog/swcs', 'lucian-dev.com'), null)
  assert.equal(normalizeSitePath('mailto:a@b.c', 'lucian-dev.com'), null)
  assert.equal(normalizeSitePath('#section', 'lucian-dev.com'), null)
  assert.equal(normalizeSitePath(undefined, 'lucian-dev.com'), null)
  assert.equal(normalizeText('MSc — AI, for “Science”!'), ' msc ai for science ')
  assert.equal(normalizeText('  '), '')
})

test('B5: /now drops the signals its own text already links to or names', () => {
  const tree = {
    type: 'root',
    children: [
      el('h2', {}, [txt('Currently')]),
      el('p', {}, [txt('Studying the MSc in Artificial Intelligence for Science at The Chinese University of Hong Kong.')]),
      el('p', {}, [txt('Latest: '), el('a', { href: 'https://lucian-dev.com/blog/swcs/' }, [txt('the waste sorter post')])]),
      el('p', {}, [txt('Building WeGreen'), el('em', {}, [txt('AI')])]),
    ],
  }
  const refs = bodyReferences(tree, 'lucian-dev.com')
  assert.ok(refs.hrefs.has('/blog/swcs'))
  assert.match(refs.text, / building wegreen ai /, 'element boundaries separate words')
  const out = dedupeNowSignals(SIGNALS, refs, 'lucian-dev.com')
  assert.deepEqual(out.roles.map((r) => r.title), ['Data Engineer'], 'the named study is dropped; the unnamed role stays')
  assert.equal(out.post, null, 'linked post dropped')
  assert.deepEqual(out.work, SIGNALS.work, 'unlinked case study kept')
  assert.equal(out.coding, null, 'named project dropped')
  assert.equal(out.composed, SIGNALS.composed)
  // Whole words only: "Data Engineering" does not name "Data Engineer"; a title without its organisation keeps the role.
  const partial = bodyReferences({ type: 'root', children: [el('p', {}, [txt('Data Engineering and an MSc in Artificial Intelligence for Science.')])] }, 'lucian-dev.com')
  assert.equal(dedupeNowSignals(SIGNALS, partial, 'lucian-dev.com').roles.length, 2)
  // An empty body changes nothing.
  assert.deepEqual(dedupeNowSignals(SIGNALS, bodyReferences(null, 'lucian-dev.com'), 'lucian-dev.com'), SIGNALS)
})

test('B5: /now shows one "Updated" date — the newest of the owner date and the shown signals', () => {
  assert.equal(nowUpdatedOn('2026-05-28', '2026-10-13', true), '2026-10-13')
  assert.equal(nowUpdatedOn('2026-11-01', '2026-10-13', true), '2026-11-01')
  assert.equal(nowUpdatedOn('2026-05-28', '2026-10-13', false), '2026-05-28', 'no sidebar: the owner date')
  assert.equal(nowUpdatedOn(null, '', true), '')
  assert.equal(nowUpdatedOn('May 2026', '2026-10-13', true), '2026-10-13', 'malformed dates ignored')
  const page = code('pages/now.tsx')
  assert.doesNotMatch(page, /Last updated ·/)
  assert.equal((page.match(/<UpdatedLine /g) || []).length, 2, 'one line in the header, owner-written or composed — none in the sidebar')
  assert.match(page, /dedupeNowSignals\(allSignals, bodyReferences\(tree, SITE_HOST\), SITE_HOST\)/)
  assert.match(page, /coding: currentlyCodingSignal\(cvEn, manualCoding, clockMonth\)/)
})

// ── B5: 404 suggestions ─────────────────────────────────────────────────────

const DOCS = [
  { kind: 'post' as const, title: 'The AI was the easy part', href: '/blog/swcs', tags: ['edge-ai'] },
  { kind: 'post' as const, title: 'Car Boy', href: '/blog/carboy' },
  { kind: 'post' as const, title: 'YDC Best Potential Startup Award', href: '/blog/ydc-award' },
  { kind: 'work' as const, title: 'Smart Waste Classification System (SWCS)', href: '/work/swcs' },
  { kind: 'work' as const, title: 'Carboy', href: '/work/project-carboy' },
  { kind: 'page' as const, title: 'Now', href: '/now' },
  { kind: 'cv' as const, title: 'IEEE Xtreme 19.0 – Global Programming Competition', href: '/cv#cv-competitionAwards-0' },
  { kind: 'evil' as never, title: 'x', href: '//evil.example' },
]

test('B5: requested paths are normalised; edit distance counts transpositions', () => {
  assert.equal(normalizeRequestedPath('/Work/SWC/?utm=1#x'), '/work/swc')
  assert.equal(normalizeRequestedPath('/blog/index.html'), '/blog')
  assert.equal(normalizeRequestedPath('//blog//x'), '/blog/x')
  assert.equal(normalizeRequestedPath('/%E4%B8%AD%E6%96%87'), '/中文')
  assert.equal(normalizeRequestedPath('/%E0%A4%A'), '/%e0%a4%a', 'a malformed escape is kept as typed')
  assert.equal(editDistance('blgo', 'blog'), 1)
  assert.equal(editDistance('swc', 'swcs'), 1)
  assert.equal(editDistance('', 'abc'), 3)
  assert.equal(similarity('uses', 'uses'), 1)
  assert.equal(queryFromPath('/work/swc'), 'work swc')
})

test('B5: "Did you mean" ranks the closest pages and never invents one', () => {
  const candidates = candidatesFrom(DOCS)
  assert.ok(!candidates.some((c) => c.href.startsWith('//')), 'only same-site paths')
  assert.equal(new Set(candidates.map((c) => c.href)).size, candidates.length, 'one per href')
  const top = (p: string) => suggestPages(p, candidates).map((s) => s.href)
  assert.equal(top('/work/swc')[0], '/work/swcs', 'a typo in the slug')
  assert.equal(top('/blgo')[0], '/blog', 'a transposition')
  assert.equal(top('/blog/car-boy')[0], '/blog/carboy', 'separators ignored')
  assert.deepEqual(top('/posts/swcs').slice(0, 2).sort(), ['/blog/swcs', '/work/swcs'], 'same slug, another section')
  assert.equal(top('/resume')[0], '/cv', 'a synonym from the page keywords')
  assert.equal(top('/cv/en')[0], '/cv')
  assert.equal(top('/about-me')[0], '/about')
  assert.equal(top('/usess')[0], '/uses')
  assert.ok(top('/work/swc').indexOf('/work') > top('/work/swc').indexOf('/work/swcs'), 'the section page ranks below the specific match')
  assert.deepEqual(top('/xyz'), [], 'nothing close: nothing offered')
  assert.deepEqual(top('/this-page-does-not-exist'), [])
  assert.deepEqual(top('/'), [])
  assert.ok(top('/blog/ydc').length <= SUGGESTION_LIMIT)
  // Without the index, the fixed pages still answer.
  assert.equal(suggestPages('/contacts', STATIC_CANDIDATES)[0].href, '/contact')
  assert.ok(STATIC_CANDIDATES.some((c) => c.href === '/cv/zh' && c.lang === 'zh-Hans'))
})

test('B5: the 404 stays a real 404 and recovers client-side', () => {
  const page = code('pages/404.tsx')
  assert.doesNotMatch(page, /router\.(replace|push)|location\.(assign|replace)|getServerSideProps|getStaticProps/)
  assert.match(page, /<PageHeader/)
  // F3: the words of the missing address's language (Chinese under /zh/).
  assert.match(page, /<NotFoundRecovery t=\{t\} \/>/)
  const recovery = code('components/NotFound/NotFoundRecovery.tsx')
  assert.match(recovery, /fetch\('\/api\/search-index'/)
  assert.match(recovery, /openCommandPalette\(query\)/)
  assert.match(recovery, /sx=\{HIDE_ON_COARSE_POINTER\}/)
  assert.doesNotMatch(recovery, /console\.|sendBeacon|analytics/, 'the address is never logged or sent')
})

// ── B5: one EmptyState ──────────────────────────────────────────────────────

test('B5: public empty states use the one EmptyState component', () => {
  for (const f of ['pages/blog/index.tsx', 'pages/work/index.tsx', 'pages/now.tsx']) {
    const src = code(f)
    assert.match(src, /import EmptyState from '.*General-UI\/EmptyState'/, f)
    assert.match(src, /<EmptyState\s/, f)
    assert.doesNotMatch(src, /border="1px dashed"/, `${f}: no hand-made dashed box`)
  }
  assert.doesNotMatch(code('pages/blog/index.tsx'), /\[ no posts yet \]/)
  const widget = code('components/Common/WidgetNotice.tsx')
  assert.match(widget, /<EmptyState variant="inline" tone=\{kind\} role=\{kind === 'error' \? 'status' : undefined\}/)
  const empty = code('components/General-UI/EmptyState.tsx')
  assert.match(empty, /data-empty-state="block"/)
  assert.match(empty, /data-empty-state="inline"/)
  assert.match(empty, /minH="44px"/, 'action links are full-size targets')
})
