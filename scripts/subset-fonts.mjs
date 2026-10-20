#!/usr/bin/env node
/**
 * Split the self-hosted Geist variable fonts into a Latin core and an
 * extension file (G3), and print the `unicode-range` each needs.
 *
 *   assets/fonts/source/<Name>-Variable.woff2   the full fonts (SIL OFL,
 *                                               public/fonts/OFL-Geist.txt)
 *   assets/fonts/<Name>-Latin.woff2             every glyph of LATIN_CORE —
 *                                               what English pages use; the
 *                                               two upright faces are preloaded
 *   assets/fonts/<Name>-Ext.woff2               everything else the font has
 *                                               (Latin Extended, Vietnamese,
 *                                               Greek μ Ω π, Cyrillic, symbols,
 *                                               box drawing), fetched only when
 *                                               such a character is on the page
 *
 * pages/_app.tsx declares both files of a face under ONE font-family with
 * these unicode-ranges (next/font `declarations`), so the browser picks the
 * file per character and never downloads the extension for an English page.
 * Nothing is lost: every glyph, the `wght` axis (100–900) and every OpenType
 * feature (ss01, ss02, cv11, tnum, ligatures, kerning) stay, and a character
 * that is in neither range (CJK) falls through to the system fonts exactly
 * as before. tests/perf-g3-fonts.test.ts checks the files against the ranges
 * and the ranges against pages/_app.tsx.
 *
 * Re-run after replacing a source font, then paste the printed ranges into
 * pages/_app.tsx (next/font only accepts literal options):
 *
 *   pip install fonttools brotli        # pyftsubset with WOFF2 support
 *   node scripts/subset-fonts.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const repoRoot = path.resolve(here, '..')
export const SOURCE_DIR = path.join(repoRoot, 'assets', 'fonts', 'source')
export const OUT_DIR = path.join(repoRoot, 'assets', 'fonts')

/**
 * The Latin core: Basic Latin and Latin-1 (the Google Fonts "latin" subset)
 * plus the arrows, maths signs and keyboard glyphs the site's own interface
 * draws (← ↑ → ↓ ↔ ↗ ↵ ⇧ − ≈ ≠ ≤ ≥). Inclusive [first, last] code points.
 */
export const LATIN_CORE = Object.freeze([
  [0x0000, 0x00ff],
  [0x0131, 0x0131],
  [0x0152, 0x0153],
  [0x02bb, 0x02bc],
  [0x02c6, 0x02c6],
  [0x02da, 0x02da],
  [0x02dc, 0x02dc],
  [0x0304, 0x0304],
  [0x0308, 0x0308],
  [0x0329, 0x0329],
  [0x2000, 0x206f],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
  [0x2190, 0x2199],
  [0x21b5, 0x21b5],
  [0x21e7, 0x21e7],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
  [0x2248, 0x2248],
  [0x2260, 0x2260],
  [0x2264, 0x2265],
  [0xfeff, 0xfeff],
  [0xfffd, 0xfffd],
])

/** The faces: source file → the two subsets. */
export const FACES = Object.freeze([
  { source: 'Geist-Variable.woff2', latin: 'Geist-Latin.woff2', ext: 'Geist-Ext.woff2' },
  { source: 'Geist-Italic-Variable.woff2', latin: 'Geist-Italic-Latin.woff2', ext: 'Geist-Italic-Ext.woff2' },
  { source: 'GeistMono-Variable.woff2', latin: 'GeistMono-Latin.woff2', ext: 'GeistMono-Ext.woff2' },
])

/**
 * @param {number} cp
 * @param {ReadonlyArray<readonly number[]>} [ranges]
 */
export function inRanges(cp, ranges = LATIN_CORE) {
  return ranges.some(([a, b]) => cp >= a && cp <= b)
}

/**
 * Code points → sorted [[first, last], …] runs.
 * @param {number[]} codepoints
 * @returns {number[][]}
 */
export function toRanges(codepoints) {
  const sorted = Array.from(new Set(codepoints)).sort((a, b) => a - b)
  /** @type {number[][]} */
  const out = []
  for (const cp of sorted) {
    const last = out[out.length - 1]
    if (last && cp === last[1] + 1) last[1] = cp
    else out.push([cp, cp])
  }
  return out
}

const hex = (/** @type {number} */ cp) => cp.toString(16).toUpperCase().padStart(4, '0')

/**
 * CSS `unicode-range` value of [first, last] runs: "U+0000-00FF, U+0131, …".
 * @param {ReadonlyArray<readonly number[]>} ranges
 */
export function unicodeRange(ranges) {
  return ranges.map(([a, b]) => (a === b ? `U+${hex(a)}` : `U+${hex(a)}-${hex(b)}`)).join(', ')
}

/**
 * "U+0000-00FF, U+0131" → [[0, 255], [305, 305]] (wildcards are not used here).
 * @param {string} value
 * @returns {number[][]}
 */
export function parseUnicodeRange(value) {
  return String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = /^U\+([0-9A-F]{1,6})(?:-([0-9A-F]{1,6}))?$/i.exec(part)
      if (!m) throw new Error(`unsupported unicode-range part: ${part}`)
      const a = parseInt(m[1], 16)
      return [a, m[2] ? parseInt(m[2], 16) : a]
    })
}

/** The code points a font file maps (its cmap), via fontkit; noncharacters (a format-4 cmap's U+FFFF end marker) left out. */
/**
 * @param {string} file
 * @returns {Promise<number[]>}
 */
export async function fontCodepoints(file) {
  const fontkit = await import('fontkit')
  const create = fontkit.create || fontkit.default?.create
  const font = create(fs.readFileSync(file))
  return Array.from(new Set(font.characterSet)).filter((cp) => (cp & 0xfffe) !== 0xfffe)
}

/**
 * Split one source font's code points into the Latin core and the rest.
 * @param {number[]} codepoints
 * @returns {{ latin: number[], ext: number[] }}
 */
export function splitCodepoints(codepoints) {
  const latin = codepoints.filter((cp) => inRanges(cp))
  const ext = codepoints.filter((cp) => !inRanges(cp))
  return { latin, ext }
}

/**
 * pyftsubset arguments for one subset: WOFF2, every layout feature and name record kept.
 * @param {string} source
 * @param {string} out
 * @param {number[]} codepoints
 */
export function subsetArgs(source, out, codepoints) {
  return [
    source,
    `--unicodes=${codepoints.map((cp) => `U+${hex(cp)}`).join(',')}`,
    `--output-file=${out}`,
    '--flavor=woff2',
    // Every OpenType feature (ss01/ss02/cv11 are on site-wide, tnum in tables).
    '--layout-features=*',
    // Keep the licence and naming records.
    '--name-IDs=*',
    '--name-languages=*',
    '--notdef-outline',
  ]
}

/**
 * @param {string} source
 * @param {string} out
 * @param {number[]} codepoints
 */
function subset(source, out, codepoints) {
  // pyftsubset, run as a module of the Python that has fontTools (PYTHON overrides).
  const python = process.env.PYTHON || 'python3'
  const res = spawnSync(python, ['-m', 'fontTools.subset', ...subsetArgs(source, out, codepoints)], { stdio: ['ignore', 'inherit', 'inherit'] })
  if (res.error) throw new Error(`${python} could not run (${res.error.message}); install fontTools with: pip install fonttools brotli`)
  if (res.status !== 0) throw new Error(`pyftsubset failed for ${path.basename(out)}`)
}

const kb = (/** @type {number} */ bytes) => `${(bytes / 1024).toFixed(1)} KB`

export async function main() {
  for (const face of FACES) {
    const source = path.join(SOURCE_DIR, face.source)
    const { latin, ext } = splitCodepoints(await fontCodepoints(source))
    const latinOut = path.join(OUT_DIR, face.latin)
    const extOut = path.join(OUT_DIR, face.ext)
    subset(source, latinOut, latin)
    subset(source, extOut, ext)
    console.log(
      `[subset-fonts] ${face.source}: ${kb(fs.statSync(source).size)} → ${face.latin} ${kb(fs.statSync(latinOut).size)} (${latin.length} chars) + ${face.ext} ${kb(fs.statSync(extOut).size)} (${ext.length} chars)`,
    )
    console.log(`  latin unicode-range: ${unicodeRange(LATIN_CORE)}`)
    console.log(`  ext   unicode-range: ${unicodeRange(toRanges(ext))}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error('[subset-fonts] failed:', err.message || err)
    process.exit(1)
  })
}
