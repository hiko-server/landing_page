/**
 * The site's one brand mark: the monogram "LY" (Li Yanpei).
 *
 * Two letters drawn as plain polygons on a 512-unit grid — no font, so the
 * mark renders identically in a browser tab, on a home screen and in the
 * PNGs generated from it. The L takes the foreground colour and the Y the
 * accent, the same split as the header wordmark ("lucian-dev" + ".com").
 * The Y's left arm sits over the L's open corner, so the pair reads as one
 * shape even at 16 px (stroke 52/512 → 1.6 px).
 *
 * Variants (all from the same geometry):
 *   - `adaptive`  the SVG favicon (public/icon.svg): a rounded tile whose
 *                 colours follow prefers-color-scheme — an ink tile on light
 *                 browser chrome, a paper tile on dark chrome — so it always
 *                 stands out from the tab strip;
 *   - `tile`      the same rounded ink tile, fixed colours (favicon.ico and
 *                 the manifest's "any" icons);
 *   - `square`    full-bleed ink square: the Apple touch icon (iOS rounds
 *                 the corners itself and has no transparency) and, with the
 *                 letters scaled down to stay inside the 40 % safe-zone
 *                 circle, the maskable icon.
 *
 * Pure and dependency-free: scripts/build-icons.mjs renders the PNGs and the
 * ICO from these strings with sharp, and tests/chrome-identity.test.ts checks
 * the geometry and the files.
 */

// Kept free of imports so scripts/build-icons.mjs can load this file with
// Node's own type stripping; the colours equal theme/color.ts (palette.ink,
// page.fg, accent.text), which tests/chrome-identity.test.ts asserts.
const INK = '#050505'
const PAPER = '#fafafa'

export const MARK_GRID = 512

/** Stroke weight of both letters, in grid units. */
export const MARK_STROKE = 52

/** Corner radius of the rounded tile (≈ 22 %, the iOS / Android icon look). */
export const MARK_TILE_RADIUS = 112

type Point = readonly [number, number]

/** L: stem x 99–151, cap height 140–372, foot to x 249. */
export const L_POINTS: readonly Point[] = [
  [99, 140],
  [151, 140],
  [151, 320],
  [249, 320],
  [249, 372],
  [99, 372],
]

/**
 * Y: two arms of the same thickness as the stems (their edges are parallel,
 * 60 units wide horizontally → 51 units perpendicular) meeting a centred
 * stem (x 282–334). The left arm's top starts 52 units right of the L's
 * stem; the stem keeps 33 units clear of the L's foot.
 */
export const Y_POINTS: readonly Point[] = [
  [203, 140],
  [263, 140],
  [308, 214],
  [353, 140],
  [413, 140],
  [334, 270],
  [334, 372],
  [282, 372],
  [282, 270],
]

/** Bounding box of the two letters together. */
export function markBounds(): { x: number; y: number; width: number; height: number } {
  const all = [...L_POINTS, ...Y_POINTS]
  const xs = all.map((p) => p[0])
  const ys = all.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/** The colours of one rendering of the mark. */
export type MarkColors = { tile: string; letter: string; accent: string }

/** Ink tile, paper L, indigo-400 Y: the dark brand look (also the PNGs). */
export const MARK_ON_INK: MarkColors = { tile: INK, letter: PAPER, accent: '#818cf8' }

/** Paper tile, ink L, indigo-600 Y: the favicon on dark browser chrome. */
export const MARK_ON_PAPER: MarkColors = { tile: PAPER, letter: INK, accent: '#4f46e5' }

/** Polygon points attribute ("x,y x,y …"), scaled about the grid centre. */
function pointsAttr(points: readonly Point[], scale: number): string {
  const c = MARK_GRID / 2
  const r = (v: number) => Math.round((c + (v - c) * scale) * 100) / 100
  return points.map(([x, y]) => `${r(x)},${r(y)}`).join(' ')
}

export type MarkVariant = 'adaptive' | 'tile' | 'square'

/**
 * Letter scale of the maskable icon: the letters' half-diagonal (195 units
 * at scale 1) shrinks to 164, well inside the safe-zone circle (radius 40 %
 * of the icon = 204.8) that every launcher mask keeps.
 */
export const MASKABLE_SCALE = 0.84

/** Radius of the maskable safe zone, in grid units. */
export const SAFE_ZONE_RADIUS = MARK_GRID * 0.4

/** The mark as a standalone SVG document; `scale` shrinks the letters about the centre. */
export function markSvg(variant: MarkVariant, scale = 1): string {
  const s = scale
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_GRID} ${MARK_GRID}">`
  const title = '<title>LY</title>'
  const letters = (l: string, y: string) =>
    `<polygon ${l} points="${pointsAttr(L_POINTS, s)}"/><polygon ${y} points="${pointsAttr(Y_POINTS, s)}"/>`
  if (variant === 'adaptive') {
    const style =
      '<style>' +
      `.t{fill:${MARK_ON_INK.tile}}.l{fill:${MARK_ON_INK.letter}}.y{fill:${MARK_ON_INK.accent}}` +
      `@media (prefers-color-scheme:dark){.t{fill:${MARK_ON_PAPER.tile}}.l{fill:${MARK_ON_PAPER.letter}}.y{fill:${MARK_ON_PAPER.accent}}}` +
      '</style>'
    return `${open}${title}${style}<rect class="t" width="${MARK_GRID}" height="${MARK_GRID}" rx="${MARK_TILE_RADIUS}"/>${letters('class="l"', 'class="y"')}</svg>`
  }
  const c = MARK_ON_INK
  const rx = variant === 'tile' ? ` rx="${MARK_TILE_RADIUS}"` : ''
  return `${open}${title}<rect fill="${c.tile}" width="${MARK_GRID}" height="${MARK_GRID}"${rx}/>${letters(`fill="${c.letter}"`, `fill="${c.accent}"`)}</svg>`
}

/** The files scripts/build-icons.mjs writes under public/ (path → variant and pixel size). */
export const ICON_FILES: readonly { file: string; variant: Exclude<MarkVariant, 'adaptive'>; size: number; scale: number }[] = [
  { file: 'icons/icon-192.png', variant: 'tile', size: 192, scale: 1 },
  { file: 'icons/icon-512.png', variant: 'tile', size: 512, scale: 1 },
  { file: 'icons/icon-maskable-512.png', variant: 'square', size: 512, scale: MASKABLE_SCALE },
  { file: 'icons/apple-touch-icon.png', variant: 'square', size: 180, scale: 1 },
]

/** Sizes packed into public/favicon.ico (the fallback for browsers without SVG favicons). */
export const ICO_SIZES = [16, 32, 48] as const

/**
 * An ICO container holding PNG images (valid since Windows Vista and in every
 * browser): 6-byte header, one 16-byte directory entry per image, then the
 * PNG data. A 256 px image is written as 0 in the one-byte size fields.
 */
export function icoFromPngs(images: readonly { size: number; png: Uint8Array }[]): Uint8Array {
  const headerSize = 6 + 16 * images.length
  const total = headerSize + images.reduce((n, i) => n + i.png.length, 0)
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint16(0, 0, true) // reserved
  view.setUint16(2, 1, true) // type: icon
  view.setUint16(4, images.length, true)
  let offset = headerSize
  images.forEach((img, i) => {
    const e = 6 + 16 * i
    const dim = img.size >= 256 ? 0 : img.size
    view.setUint8(e, dim)
    view.setUint8(e + 1, dim)
    view.setUint8(e + 2, 0) // palette colours
    view.setUint8(e + 3, 0) // reserved
    view.setUint16(e + 4, 1, true) // colour planes
    view.setUint16(e + 6, 32, true) // bits per pixel
    view.setUint32(e + 8, img.png.length, true)
    view.setUint32(e + 12, offset, true)
    out.set(img.png, offset)
    offset += img.png.length
  })
  return out
}
