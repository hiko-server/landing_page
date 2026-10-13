import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  DENSITY_CLAMP,
  LOGO_BASE,
  LOGO_GRID_COLUMNS,
  LOGO_MAX_HEIGHT,
  LOGO_MAX_WIDTH,
  analyzeLogoPixels,
  balancedRows,
  balancedSpans,
  cropPlacement,
  densityFactor,
  opticalLogoSize,
  parseLogoMetrics,
} from '../lib/logoSize'
import { contentHash, measureLogo, measureLogoBuffer, publicImagePath, readLogoSource, withLogoMetrics } from '../lib/logoMetrics'
import type { HomeBrand } from '../lib/homeShape'

/**
 * B4 — optically normalised affiliation logos: content-box / ink-density
 * measurement (pure pixel analysis + sharp on real files), equal-area sizing
 * with gentle density compensation and the owner's scale, crop placement,
 * the orphan-free phone grid, and metrics carried over or re-measured on save.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const silent = { debug() {}, info() {}, warn() {}, error() {} } as unknown as Parameters<typeof withLogoMetrics>[2]

/** A W×H RGBA canvas filled with `bg`, with `paint(x, y)` returning a pixel or null. */
function canvas(w: number, h: number, bg: [number, number, number, number], paint: (x: number, y: number) => [number, number, number, number] | null) {
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = paint(x, y) || bg
      data.set(p, (y * w + x) * 4)
    }
  }
  return data
}

const INK: [number, number, number, number] = [20, 30, 60, 255]
const CLEAR: [number, number, number, number] = [0, 0, 0, 0]
const WHITE: [number, number, number, number] = [255, 255, 255, 255]

// ── pixel analysis ──────────────────────────────────────────────────────────

test('transparent logo: the inked box, its aspect and density, padding excluded', () => {
  // 200×100 canvas, a solid 80×20 bar at (60, 40).
  const data = canvas(200, 100, CLEAR, (x, y) => (x >= 60 && x < 140 && y >= 40 && y < 60 ? INK : null))
  const r = analyzeLogoPixels(data, 200, 100)
  assert.ok(r)
  assert.equal(r.aspect, 4)
  assert.equal(r.density, 1)
  assert.deepEqual(r.crop, { x: 0.3, y: 0.4, w: 0.4, h: 0.2 })
})

test('opaque logo on white (a JPEG): the background is the frame’s median, noise is not ink', () => {
  // A ring (thin ink) inside a 120×120 white image with light JPEG-like noise.
  const data = canvas(120, 120, WHITE, (x, y) => {
    const d = Math.hypot(x - 60, y - 60)
    if (d >= 36 && d <= 40) return INK
    const n = (x * 7 + y * 13) % 9 // ±9 levels of noise
    return [255 - n, 255 - n, 255 - n, 255]
  })
  const r = analyzeLogoPixels(data, 120, 120)
  assert.ok(r)
  assert.ok(Math.abs(r.aspect - 1) < 0.05, `aspect ${r.aspect}`)
  assert.ok(r.density > 0.1 && r.density < 0.4, `a thin ring is light ink: ${r.density}`)
  assert.ok(r.crop.x > 0.15 && r.crop.w < 0.7)
})

test('an anti-aliased edge on an opaque light backdrop is not transparency (the WeGreen case)', () => {
  // Opaque #fdfdfd backdrop with a half-transparent 1 px frame, ink in the middle.
  const data = canvas(100, 50, [253, 253, 253, 255], (x, y) => {
    if (x === 0 || y === 0 || x === 99 || y === 49) return [252, 252, 252, 221]
    return x >= 20 && x < 80 && y >= 10 && y < 40 ? INK : null
  })
  const r = analyzeLogoPixels(data, 100, 50)
  assert.ok(r)
  assert.equal(r.aspect, 2)
  assert.deepEqual(r.crop, { x: 0.2, y: 0.2, w: 0.6, h: 0.6 })
})

test('a coloured or dark tile is a full-bleed mark; a blank image has no metrics', () => {
  const tile = canvas(60, 30, [30, 60, 160, 255], (x, y) => (x > 20 && x < 40 && y > 10 && y < 20 ? WHITE : null))
  assert.deepEqual(analyzeLogoPixels(tile, 60, 30), { aspect: 2, density: 1, crop: { x: 0, y: 0, w: 1, h: 1 } })
  assert.equal(analyzeLogoPixels(canvas(40, 40, CLEAR, () => null), 40, 40), null)
  assert.equal(analyzeLogoPixels(canvas(40, 40, WHITE, () => null), 40, 40), null)
  assert.equal(analyzeLogoPixels(new Uint8Array(10), 40, 40), null, 'short buffer')
})

// ── sizing ──────────────────────────────────────────────────────────────────

test('equal areas: a 4:1 wordmark is twice as wide and half as tall as a square mark', () => {
  const square = opticalLogoSize({ aspect: 1, density: 0.35 })
  const wide = opticalLogoSize({ aspect: 4, density: 0.35 })
  assert.deepEqual(square, { width: LOGO_BASE, height: LOGO_BASE })
  assert.deepEqual(wide, { width: LOGO_BASE * 2, height: LOGO_BASE / 2 })
  assert.equal(square.width * square.height, wide.width * wide.height)
})

test('density compensation is gentle and clamped; caps keep the aspect; the owner scale multiplies', () => {
  assert.equal(densityFactor(0.35), 1)
  assert.ok(densityFactor(1) < 1 && densityFactor(1) >= DENSITY_CLAMP[0], 'a solid crest a little smaller')
  assert.ok(densityFactor(0.1) > 1 && densityFactor(0.1) <= DENSITY_CLAMP[1], 'a thin wordmark a little larger')
  assert.equal(densityFactor(0.01), DENSITY_CLAMP[1])
  assert.equal(densityFactor(0), 1)
  const extreme = opticalLogoSize({ aspect: 20, density: 0.35 })
  assert.ok(extreme.width <= LOGO_MAX_WIDTH)
  assert.ok(Math.abs(extreme.width / extreme.height - 20) < 1.5, 'aspect kept under the cap')
  const tall = opticalLogoSize({ aspect: 0.5, density: 0.35 })
  assert.ok(tall.height <= LOGO_MAX_HEIGHT)
  const base = opticalLogoSize({ aspect: 3, density: 0.3 })
  const doubled = opticalLogoSize({ aspect: 3, density: 0.3 }, 2)
  assert.ok(Math.abs(doubled.width - base.width * 2) <= 1)
  assert.deepEqual(opticalLogoSize({ aspect: 3, density: 0.3 }, Number.NaN), base)
})

test('crop placement puts the inked box exactly in the frame', () => {
  assert.deepEqual(cropPlacement({ x: 0, y: 0, w: 1, h: 1 }), { width: '100%', height: '100%', left: '0%', top: '0%' })
  assert.deepEqual(cropPlacement({ x: 0.3, y: 0.4, w: 0.4, h: 0.2 }), { width: '250%', height: '500%', left: '-75%', top: '-200%' })
})

test('phones: rows of 3 or 2, never a lone orphan, and the 6-column spans fill every row', () => {
  assert.deepEqual(balancedRows(5), [3, 2])
  assert.deepEqual(balancedRows(7), [3, 2, 2])
  assert.deepEqual(balancedRows(4), [2, 2])
  assert.deepEqual(balancedRows(1), [1])
  assert.deepEqual(balancedRows(0), [])
  for (let n = 2; n <= 24; n++) {
    const rows = balancedRows(n)
    assert.equal(rows.reduce((a, b) => a + b, 0), n)
    assert.ok(rows.every((r) => r >= 2 && r <= 3), `${n}: ${rows}`)
    const spans = balancedSpans(n)
    assert.equal(spans.length, n)
    let i = 0
    for (const r of rows) {
      const row = spans.slice(i, i + r)
      assert.equal(row.reduce((a, b) => a + b, 0), LOGO_GRID_COLUMNS, `${n}: row of ${r}`)
      i += r
    }
  }
})

test('stored metrics are validated before use', () => {
  const good = { aspect: 2, density: 0.4, crop: { x: 0.1, y: 0, w: 0.8, h: 1 }, source: '/images/a.svg', hash: 'abcdef0123456789' }
  assert.deepEqual(parseLogoMetrics(good), good)
  for (const bad of [
    null,
    [],
    { ...good, aspect: 0 },
    { ...good, aspect: Number.NaN },
    { ...good, density: 0 },
    { ...good, density: 1.5 },
    { ...good, crop: { x: 0.5, y: 0, w: 0.8, h: 1 } },
    { ...good, crop: { x: 0, y: 0, w: 0, h: 1 } },
    { ...good, source: '' },
  ]) {
    assert.equal(parseLogoMetrics(bad), null, JSON.stringify(bad))
  }
  assert.equal(parseLogoMetrics({ ...good, hash: 'not hex!' })?.hash, undefined)
})

// ── measurement on real files (sharp) ───────────────────────────────────────

test('site files resolve inside public/ only', () => {
  assert.equal(publicImagePath('/images/brand/Wegreen.svg'), path.join(ROOT, 'public/images/brand/Wegreen.svg'))
  for (const bad of ['/../package.json', '/images/../../etc/passwd.png', '//evil.example/x.png', 'images/x.png', '/images/x.txt', '/%2e%2e/%2e%2e/etc/hosts.png']) {
    assert.equal(publicImagePath(bad), null, bad)
  }
})

test('the repository’s own logos are measured: content boxes, padding cropped', async () => {
  const wegreen = await measureLogo('/images/brand/Wegreen.svg')
  assert.ok(wegreen)
  assert.equal(wegreen.source, '/images/brand/Wegreen.svg')
  assert.match(wegreen.hash || '', /^[0-9a-f]{16}$/)
  assert.ok(wegreen.crop.w < 1 && wegreen.crop.h < 1, 'its white backdrop is cropped away')
  assert.ok(wegreen.density < 0.9, 'the backdrop is not ink')
  const hkmu = await measureLogo('/images/brand/hkmu.png')
  assert.ok(hkmu && hkmu.aspect > 3 && hkmu.aspect < 5.5)
  assert.equal(await measureLogo('/images/brand/does-not-exist.svg'), null)
  assert.equal(await readLogoSource('/uploads/../secret.png'), null)
  // Raw buffers: a PNG made by sharp itself.
  const sharp = (await import('sharp')).default
  const png = await sharp({ create: { width: 90, height: 30, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp({ create: { width: 30, height: 10, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } } }).png().toBuffer(), left: 30, top: 10 }])
    .png()
    .toBuffer()
  const measured = await measureLogoBuffer(png)
  assert.ok(measured)
  assert.equal(measured.aspect, 3)
})

test('saving: unchanged logos keep their metrics, changed files and new URLs are measured, removed images drop them', async () => {
  const fresh = await withLogoMetrics(
    [
      { name: 'WeGreen', href: '', image: '/images/brand/Wegreen.svg' },
      { name: 'Text only', href: '', image: '' },
      { name: 'Missing', href: '', image: '/images/brand/nope.png' },
    ],
    null,
    silent,
  )
  assert.ok(parseLogoMetrics(fresh[0].metrics), 'measured')
  assert.equal(fresh[1].metrics, undefined)
  assert.equal(fresh[2].metrics, undefined, 'unreadable: no metrics, fixed box')

  // Carried over from the stored document when URL and content match (the editor never sends metrics).
  const stored = fresh[0].metrics!
  const fake = { ...stored, aspect: 9.99 }
  const kept = await withLogoMetrics([{ name: 'WeGreen', href: '', image: '/images/brand/Wegreen.svg' }], [{ name: 'WeGreen', href: '', image: '/images/brand/Wegreen.svg', metrics: fake }], silent)
  assert.equal(kept[0].metrics?.aspect, 9.99, 'reused, not re-measured')

  // A file replaced at the same path (different hash) is measured again.
  const stale = { ...stored, aspect: 9.99, hash: '0000000000000000' }
  const remeasured = await withLogoMetrics([{ name: 'WeGreen', href: '', image: '/images/brand/Wegreen.svg' }], [{ name: 'WeGreen', href: '', image: '/images/brand/Wegreen.svg', metrics: stale }], silent)
  assert.equal(remeasured[0].metrics?.aspect, stored.aspect)

  // Metrics of another URL are never applied.
  const moved: HomeBrand[] = await withLogoMetrics([{ name: 'HKMU', href: '', image: '/images/brand/hkmu.png', metrics: stored }], null, silent)
  assert.equal(moved[0].metrics?.source, '/images/brand/hkmu.png')
  assert.equal(contentHash(Buffer.from('x')).length, 16)
})

test('the home save measures logos; the public strip renders the optical size; the editor previews it', () => {
  const api = read('pages/api/home.ts')
  assert.match(api, /brands: await withLogoMetrics\(checked\.home\.brands, current\.home\?\.brands, ctx\.log\)/)
  assert.ok(api.indexOf('withLogoMetrics(') < api.indexOf('await writeHome('), 'measured before the write')
  const strip = read('components/BrandShowcase/BrandShowcase.tsx')
  assert.match(strip, /opticalLogoSize\(m, brand\.scale\)/)
  assert.match(strip, /cropPlacement\(m\.crop\)/)
  assert.match(strip, /aspectRatio: String\(m\.aspect\)/)
  assert.match(strip, /gridColumn=\{\{ base: `span \$\{spans\[i\]\}`, md: 'auto' \}\}/)
  assert.match(strip, /metrics\.source === /, 'stale metrics are ignored')
  const admin = read('components/Admin/home/BrandsSection.tsx')
  assert.match(admin, /<BrandStrip brands=\{preview\} \/>/)
  assert.match(admin, /Optical size \$\{width\} × \$\{height\} px/)
  const endpoint = read('pages/api/admin/logo-metrics.ts')
  assert.match(endpoint, /isAdminRequest\(req, res\)/)
  assert.match(endpoint, /rateLimit\(req, 120/)
  assert.match(read('lib/homeShape.ts'), /metrics\?: LogoMetrics/)
  // The editor's logo cards show the whole logo (Chakra's AspectRatio forces cover on a direct <img>).
  assert.match(read('components/Admin/home/ImageCards.tsx'), /sx=\{variant === 'brand' \? \{ '&&': \{ objectFit: 'contain' \} \} : undefined\}/)
})
