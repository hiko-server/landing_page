#!/usr/bin/env node
/**
 * Draw the synthetic images of the CI fixture store (G7) into
 * e2e/fixtures/store/uploads. They are abstract compositions — gradients,
 * contour lines, blocks — drawn from a seeded generator: no photograph, no
 * person, no real logo, nothing derived from the live site. The files are
 * committed, so every CI run and every visual baseline sees the same pixels;
 * re-run only to change the fixture (then regenerate the baselines):
 *
 *   node scripts/ci/fixture-images.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(here, '..', '..', 'e2e', 'fixtures', 'store', 'uploads')

/** mulberry32: a tiny deterministic PRNG. */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PALETTES = [
  ['#0f172a', '#1e3a8a', '#6366f1', '#a5b4fc', '#e0e7ff'],
  ['#052e16', '#166534', '#22c55e', '#bbf7d0', '#f0fdf4'],
  ['#3b0764', '#7e22ce', '#e879f9', '#fbcfe8', '#fdf4ff'],
  ['#431407', '#c2410c', '#fb923c', '#fed7aa', '#fff7ed'],
  ['#082f49', '#0369a1', '#38bdf8', '#bae6fd', '#f0f9ff'],
]

/** A landscape of layered contour bands under a gradient sky. */
function landscape(w, h, seed, palette) {
  const r = rng(seed)
  const [deep, mid, accent, light, pale] = palette
  let layers = ''
  const bands = 6
  for (let i = 0; i < bands; i++) {
    const base = h * (0.35 + (i / bands) * 0.6)
    const amp = h * (0.04 + r() * 0.06)
    const freq = 1 + r() * 2.5
    const phase = r() * Math.PI * 2
    let d = `M0 ${h} L0 ${base.toFixed(1)}`
    for (let x = 0; x <= w; x += w / 48) {
      const y = base + Math.sin((x / w) * Math.PI * freq + phase) * amp + Math.sin((x / w) * Math.PI * freq * 3.1 + phase) * amp * 0.25
      d += ` L${x.toFixed(1)} ${y.toFixed(1)}`
    }
    d += ` L${w} ${h} Z`
    const fill = [light, accent, mid, mid, deep, deep][i]
    layers += `<path d="${d}" fill="${fill}" fill-opacity="${(0.55 + i * 0.08).toFixed(2)}"/>`
  }
  const sun = `<circle cx="${(w * (0.2 + r() * 0.6)).toFixed(0)}" cy="${(h * (0.18 + r() * 0.12)).toFixed(0)}" r="${(h * 0.08).toFixed(0)}" fill="${pale}" fill-opacity="0.85"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pale}"/><stop offset="1" stop-color="${light}"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#sky)"/>${sun}${layers}</svg>`
}

/** A blocky "system diagram": rounded boxes joined by lines, on a dot grid. */
function diagram(w, h, seed, palette) {
  const r = rng(seed)
  const [deep, mid, accent, light, pale] = palette
  let dots = ''
  for (let x = 16; x < w; x += 32) for (let y = 16; y < h; y += 32) dots += `<circle cx="${x}" cy="${y}" r="1.5" fill="${light}"/>`
  const cols = 4
  const boxW = w / (cols * 1.6)
  const boxH = h * 0.22
  let boxes = ''
  let links = ''
  const centers = []
  for (let i = 0; i < cols; i++) {
    const x = (w / cols) * i + (w / cols - boxW) / 2
    const y = h * (0.25 + r() * 0.35)
    centers.push([x + boxW / 2, y + boxH / 2])
    boxes += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${boxW.toFixed(0)}" height="${boxH.toFixed(0)}" rx="18" fill="${i % 2 ? mid : accent}" stroke="${deep}" stroke-width="4"/>`
    boxes += `<rect x="${(x + 24).toFixed(0)}" y="${(y + 24).toFixed(0)}" width="${(boxW * 0.55).toFixed(0)}" height="12" rx="6" fill="${pale}"/>`
    boxes += `<rect x="${(x + 24).toFixed(0)}" y="${(y + 48).toFixed(0)}" width="${(boxW * 0.35).toFixed(0)}" height="10" rx="5" fill="${light}"/>`
  }
  for (let i = 0; i < centers.length - 1; i++) {
    const [x1, y1] = centers[i]
    const [x2, y2] = centers[i + 1]
    links += `<path d="M${x1.toFixed(0)} ${y1.toFixed(0)} C ${((x1 + x2) / 2).toFixed(0)} ${y1.toFixed(0)}, ${((x1 + x2) / 2).toFixed(0)} ${y2.toFixed(0)}, ${x2.toFixed(0)} ${y2.toFixed(0)}" stroke="${deep}" stroke-width="5" fill="none"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${pale}"/>${dots}${links}${boxes}</svg>`
}

/** An abstract, non-human avatar: concentric rings and a diagonal split. */
function avatar(size, seed, palette) {
  const r = rng(seed)
  const [deep, mid, accent, light] = palette
  let rings = ''
  for (let i = 6; i > 0; i--) rings += `<circle cx="${size / 2}" cy="${size / 2}" r="${((size / 2) * i) / 6}" fill="${[deep, mid, accent, light, accent, mid][i - 1]}" fill-opacity="${(0.5 + r() * 0.5).toFixed(2)}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${deep}"/>${rings}<path d="M0 ${size} L${size} 0 L${size} ${size} Z" fill="${deep}" fill-opacity="0.35"/></svg>`
}

/** A wordless logo mark: a few geometric glyph-like blocks on transparency. */
function logo(w, h, seed, palette) {
  const r = rng(seed)
  const [deep, , accent] = palette
  let marks = `<circle cx="${h / 2}" cy="${h / 2}" r="${h * 0.38}" fill="none" stroke="${deep}" stroke-width="${h * 0.1}"/>`
  let x = h * 1.2
  for (let i = 0; i < 5; i++) {
    const bw = h * (0.25 + r() * 0.5)
    const bh = h * (0.3 + r() * 0.4)
    if (x + bw > w - h * 0.1) break
    marks += `<rect x="${x.toFixed(0)}" y="${((h - bh) / 2).toFixed(0)}" width="${bw.toFixed(0)}" height="${bh.toFixed(0)}" rx="${(h * 0.06).toFixed(0)}" fill="${i === 2 ? accent : deep}"/>`
    x += bw + h * 0.12
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${marks}</svg>`
}

const IMAGES = [
  { name: 'example-portrait.jpg', svg: avatar(800, 11, PALETTES[0]) },
  { name: 'field-ridge.jpg', svg: landscape(1200, 900, 21, PALETTES[4]) },
  { name: 'field-meadow.jpg', svg: landscape(1200, 900, 22, PALETTES[1]) },
  { name: 'field-dusk.jpg', svg: landscape(1200, 900, 23, PALETTES[3]) },
  { name: 'cover-sorting-station.jpg', svg: diagram(1600, 1000, 31, PALETTES[0]) },
  { name: 'cover-field-atlas.jpg', svg: landscape(1600, 1000, 32, PALETTES[2]) },
  { name: 'post-pipeline.png', svg: diagram(1400, 800, 41, PALETTES[4]) },
  { name: 'post-bench.jpg', svg: landscape(1200, 800, 42, PALETTES[3]) },
  { name: 'gallery-tall.jpg', svg: landscape(900, 1200, 51, PALETTES[1]) },
  { name: 'gallery-wide.jpg', svg: landscape(1200, 800, 52, PALETTES[2]) },
  { name: 'logo-example-lab.png', svg: logo(600, 160, 61, PALETTES[0]) },
  { name: 'logo-sample-institute.png', svg: logo(600, 160, 62, PALETTES[1]) },
]

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  for (const { name, svg } of IMAGES) {
    const img = sharp(Buffer.from(svg))
    const buf = name.endsWith('.png') ? await img.png({ compressionLevel: 9, palette: true }).toBuffer() : await img.jpeg({ quality: 78, mozjpeg: true }).toBuffer()
    fs.writeFileSync(path.join(OUT, name), buf)
    console.log(`[fixture-images] ${name} ${(buf.length / 1024).toFixed(1)} KB`)
  }
}

main().catch((err) => {
  console.error('[fixture-images] failed:', err)
  process.exit(1)
})
