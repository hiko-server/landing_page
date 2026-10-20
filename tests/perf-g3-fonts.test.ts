/**
 * G3 — font subsetting: every Geist face is a Latin core (the two upright
 * cores preloaded) plus an extension file, chained under one font-family by
 * unicode-range (scripts/subset-fonts.mjs, pages/_app.tsx).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import {
  FACES,
  LATIN_CORE,
  OUT_DIR,
  SOURCE_DIR,
  fontCodepoints,
  inRanges,
  parseUnicodeRange,
  splitCodepoints,
  toRanges,
  unicodeRange,
} from '../scripts/subset-fonts.mjs'

const ROOT = process.cwd()
const requireFromRoot = createRequire(path.join(ROOT, 'package.json'))

type FontCall = { name: string; file: string; preload: boolean; family: string | null; range: string | null; adjust: string | null }

/** The localFont({...}) calls of pages/_app.tsx with the options this test checks. */
function fontCalls(): FontCall[] {
  const app = fs.readFileSync(path.join(ROOT, 'pages/_app.tsx'), 'utf8')
  const out: FontCall[] = []
  for (const m of app.matchAll(/const (\w+) = localFont\(\{([\s\S]*?)\n\}\)/g)) {
    const body = m[2]
    out.push({
      name: m[1],
      file: path.basename(/path: '([^']+)'/.exec(body)?.[1] || ''),
      preload: /preload: true/.test(body),
      family: /prop: 'font-family', value: '([^']+)'/.exec(body)?.[1] ?? null,
      range: /prop: 'unicode-range',\s*value:\s*'([^']+)'/.exec(body)?.[1] ?? null,
      adjust: /adjustFontFallback: ([^,\n]+)/.exec(body)?.[1] ?? null,
    })
  }
  return out
}

test('LATIN_CORE: Basic Latin + Latin-1, the UI arrows and signs; never CJK or Greek', () => {
  for (const ch of 'Aé—’“…€™→←↗↵⇧−≤≥≈') assert.ok(inRanges(ch.codePointAt(0) as number), ch)
  for (const ch of 'μΩπĀЖ中、〜') assert.equal(inRanges(ch.codePointAt(0) as number), false, ch)
  assert.deepEqual(parseUnicodeRange(unicodeRange(LATIN_CORE)), LATIN_CORE.map((r) => [...r]))
  assert.deepEqual(toRanges([5, 1, 2, 3, 9, 10]), [[1, 3], [5, 5], [9, 10]])
  assert.equal(unicodeRange([[0, 255], [0x131, 0x131]]), 'U+0000-00FF, U+0131')
})

test('each subset pair splits its source exactly: Latin core ∪ extension = the source cmap, no overlap, wght 100–900 and the features kept', async () => {
  const fontkit = requireFromRoot('fontkit') as { create: (buf: Buffer) => any }
  for (const face of FACES) {
    const source = await fontCodepoints(path.join(SOURCE_DIR, face.source))
    const latin = await fontCodepoints(path.join(OUT_DIR, face.latin))
    const ext = await fontCodepoints(path.join(OUT_DIR, face.ext))
    const expected = splitCodepoints(source)
    assert.deepEqual(latin.sort((a, b) => a - b), expected.latin.sort((a, b) => a - b), face.latin)
    assert.deepEqual(ext.sort((a, b) => a - b), expected.ext.sort((a, b) => a - b), face.ext)
    assert.ok(latin.every((cp) => inRanges(cp)))
    assert.ok(ext.every((cp) => !inRanges(cp)))
    for (const file of [face.latin, face.ext]) {
      const font = fontkit.create(fs.readFileSync(path.join(OUT_DIR, file)))
      assert.deepEqual(font.variationAxes.wght && [font.variationAxes.wght.min, font.variationAxes.wght.max], [100, 900], `${file}: variable weight axis`)
    }
    const core = fontkit.create(fs.readFileSync(path.join(OUT_DIR, face.latin)))
    for (const feature of ['ss01', 'ss02', 'liga', 'frac', 'sups'].filter((f) => face.source !== 'GeistMono-Variable.woff2' || f !== 'liga')) {
      assert.ok(core.availableFeatures.includes(feature), `${face.latin}: ${feature}`)
    }
    if (face.source !== 'GeistMono-Variable.woff2') assert.ok(core.availableFeatures.includes('tnum'), `${face.latin}: tnum`)
  }
})

test('Greek μ, Ω and π come from the sans extension file, not the preloaded core', async () => {
  const geist = FACES[0]
  const latin = new Set(await fontCodepoints(path.join(OUT_DIR, geist.latin)))
  const ext = new Set(await fontCodepoints(path.join(OUT_DIR, geist.ext)))
  for (const ch of 'μΩπ') {
    const cp = ch.codePointAt(0) as number
    assert.ok(ext.has(cp), `${ch} in ${geist.ext}`)
    assert.equal(latin.has(cp), false, `${ch} not in ${geist.latin}`)
  }
})

test('pages/_app declares each pair under one family with the generated unicode-ranges; only the two upright cores are preloaded', async () => {
  const calls = fontCalls()
  const byFile = new Map(calls.map((c) => [c.file, c]))
  const latinRange = unicodeRange(LATIN_CORE)
  for (const face of FACES) {
    const core = byFile.get(face.latin)
    const ext = byFile.get(face.ext)
    assert.ok(core && ext, `${face.latin} and ${face.ext} are declared`)
    assert.equal(core.range, latinRange, `${face.latin}: the Latin core range`)
    assert.equal(core.family, null, `${face.latin}: keeps the next/font family (${core.name})`)
    const { ext: extCodepoints } = splitCodepoints(await fontCodepoints(path.join(SOURCE_DIR, face.source)))
    assert.equal(ext.range, unicodeRange(toRanges(extCodepoints)), `${face.ext}: re-run scripts/subset-fonts.mjs and paste its range`)
    assert.equal(ext.family, core.name, `${face.ext} joins the ${core.name} family`)
    assert.equal(ext.preload, false, `${face.ext} is never preloaded`)
    assert.equal(ext.adjust, 'false', `${face.ext} adds no fallback face of its own`)
  }
  assert.deepEqual(calls.filter((c) => c.preload).map((c) => c.file).sort(), ['Geist-Latin.woff2', 'GeistMono-Latin.woff2'])
  const preloadBytes = ['Geist-Latin.woff2', 'GeistMono-Latin.woff2'].reduce((n, f) => n + fs.statSync(path.join(OUT_DIR, f)).size, 0)
  const sourceBytes = ['Geist-Variable.woff2', 'GeistMono-Variable.woff2'].reduce((n, f) => n + fs.statSync(path.join(SOURCE_DIR, f)).size, 0)
  assert.ok(preloadBytes < sourceBytes * 0.55, `preloads ${preloadBytes} B vs ${sourceBytes} B before subsetting`)
})

test('the full source fonts are not served from public/ (only the licence is)', () => {
  const served = fs.readdirSync(path.join(ROOT, 'public/fonts'))
  assert.deepEqual(served, ['OFL-Geist.txt'])
})
