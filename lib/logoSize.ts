/**
 * Optical logo normalisation — the pure half (client-safe, unit tested).
 * lib/logoMetrics.ts measures uploaded / referenced logos with sharp when the
 * home document is saved; components/BrandShowcase renders with these rules.
 *
 * Why: a fixed box treats every logo alike, so a wide wordmark (HONSENN)
 * fills its width and towers over a compact crest (CUHK) that fills only a
 * square in the middle, and a logo file's transparent or white padding makes
 * it look smaller than its neighbours. ("The logo soup problem", Sanity.)
 *
 *   1. Measure the CONTENT, not the file: the bounding box of the inked
 *      pixels (alpha, or distance from a light background), its aspect
 *      ratio, and its density (ink coverage inside that box, 0–1).
 *   2. Size by area, not by width or height: width = base × aspect^0.5, so
 *      a 4:1 wordmark is twice as wide as a square mark and half as tall —
 *      both cover the same area.
 *   3. Compensate density gently: a solid crest looks heavier than a thin
 *      wordmark of the same area, so the size is multiplied by
 *      (REFERENCE_DENSITY / density)^0.25, clamped to ±12 %.
 *   4. The owner's per-logo scale (Home editor, 0.5–2) multiplies the result.
 *   5. The file is cropped to its content box when shown (no padding).
 *
 * Layout: below md the strip is a 6-column grid whose rows hold 3 or 2
 * logos — balancedRows() splits the logos so no row is left with a single
 * orphan (5 → 3 + 2, 7 → 3 + 2 + 2); from md one centred, wrapping row.
 */

export type LogoCrop = { x: number; y: number; w: number; h: number }

export type LogoMetrics = {
  /** Width / height of the content box. */
  aspect: number
  /** Ink coverage inside the content box (0–1]. */
  density: number
  /** The content box as fractions of the image (0–1). */
  crop: LogoCrop
  /** The image URL that was measured (metrics of another URL are stale). */
  source: string
  /** Short content hash of a local file (stale when the file at the same path changed). */
  hash?: string
}

/** The side of a square logo (CSS px) at scale 1. */
export const LOGO_BASE = 48
/** Exponent of the aspect ratio: 0 = equal widths, 1 = equal heights, 0.5 = equal areas. */
export const LOGO_ASPECT_EXPONENT = 0.5
export const REFERENCE_DENSITY = 0.35
export const DENSITY_EXPONENT = 0.25
export const DENSITY_CLAMP = [0.88, 1.12] as const
/** Caps at scale 1, so an extreme aspect ratio stays in proportion with the row. */
export const LOGO_MAX_WIDTH = 168
export const LOGO_MAX_HEIGHT = 52
/** The fixed box of a logo that has not been measured (the previous behaviour). */
export const UNMEASURED_LOGO = { width: 120, height: 28 } as const

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const isFraction = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1

/** Valid stored metrics, or null (anything malformed renders the unmeasured fallback). */
export function parseLogoMetrics(value: unknown): LogoMetrics | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const m = value as Record<string, unknown>
  const crop = m.crop as Record<string, unknown> | undefined
  if (typeof m.aspect !== 'number' || !Number.isFinite(m.aspect) || m.aspect < 0.05 || m.aspect > 40) return null
  if (typeof m.density !== 'number' || !Number.isFinite(m.density) || m.density <= 0 || m.density > 1) return null
  if (!crop || typeof crop !== 'object') return null
  if (!isFraction(crop.x) || !isFraction(crop.y) || !isFraction(crop.w) || !isFraction(crop.h)) return null
  if (crop.w <= 0 || crop.h <= 0 || crop.x + crop.w > 1.0001 || crop.y + crop.h > 1.0001) return null
  if (typeof m.source !== 'string' || !m.source) return null
  const out: LogoMetrics = {
    aspect: m.aspect,
    density: m.density,
    crop: { x: crop.x, y: crop.y, w: crop.w, h: crop.h },
    source: m.source,
  }
  if (typeof m.hash === 'string' && /^[0-9a-f]{8,64}$/.test(m.hash)) out.hash = m.hash
  return out
}

/** The density factor: dense marks a little smaller, thin ones a little larger. */
export function densityFactor(density: number): number {
  if (!(density > 0)) return 1
  return clamp((REFERENCE_DENSITY / density) ** DENSITY_EXPONENT, DENSITY_CLAMP[0], DENSITY_CLAMP[1])
}

/**
 * The rendered box (CSS px, rounded) of a measured logo at the owner's
 * scale: equal-area sizing, density compensation, caps at scale 1, then the
 * scale.
 */
export function opticalLogoSize(metrics: Pick<LogoMetrics, 'aspect' | 'density'>, scale = 1): { width: number; height: number } {
  const aspect = clamp(metrics.aspect, 0.05, 40)
  let width = LOGO_BASE * aspect ** LOGO_ASPECT_EXPONENT * densityFactor(metrics.density)
  let height = width / aspect
  // Keep the aspect while fitting the caps.
  const fit = Math.min(1, LOGO_MAX_WIDTH / width, LOGO_MAX_HEIGHT / height)
  width *= fit
  height *= fit
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1
  return { width: Math.round(width * s), height: Math.round(height * s) }
}

/**
 * How the image is placed inside its content-box frame (percentages of the
 * frame), so the inked part fills the frame exactly whatever the padding.
 */
export function cropPlacement(crop: LogoCrop): { width: string; height: string; left: string; top: string } {
  const pct = (v: number) => `${Math.round(v * 10000) / 100}%`
  return {
    width: pct(1 / crop.w),
    height: pct(1 / crop.h),
    left: pct(-crop.x / crop.w),
    top: pct(-crop.y / crop.h),
  }
}

/**
 * Logos per row with no orphan: as few rows as `maxPerRow` allows, the
 * logos spread evenly, fuller rows first (5 → [3, 2], 7 → [3, 2, 2],
 * 4 → [2, 2]). Only a single logo sits alone.
 */
export function balancedRows(count: number, maxPerRow = 3): number[] {
  if (count <= 0) return []
  const rows = Math.ceil(count / Math.max(1, maxPerRow))
  const base = Math.floor(count / rows)
  const extra = count % rows
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0))
}

/** The 6-column grid span of each logo for balancedRows (3 per row → 2, 2 per row → 3, alone → 6). */
export const LOGO_GRID_COLUMNS = 6

export function balancedSpans(count: number, maxPerRow = 3): number[] {
  return balancedRows(count, maxPerRow).flatMap((n) => Array.from({ length: n }, () => LOGO_GRID_COLUMNS / n))
}

// ── Pixel analysis (used by lib/logoMetrics.ts on decoded RGBA pixels) ──────

/** Alpha below this is background; a pixel this far (RGB distance) from a light background is ink. */
const ALPHA_INK = 24
const BACKGROUND_DISTANCE = 40
const INK_FULL_DISTANCE = 96
/** A background is "light" (white paper, light grey) when every channel is at least this. */
const LIGHT_BACKGROUND = 200

export type PixelAnalysis = Pick<LogoMetrics, 'aspect' | 'density' | 'crop'>

/**
 * Measure decoded RGBA pixels (row-major, 4 channels): the content box,
 * its aspect ratio and ink density. Transparent images use alpha; opaque
 * images on a light background use the distance from that background (the
 * median of the outer frame); any other opaque image is a full-bleed mark.
 * Returns null when nothing is inked.
 */
export function analyzeLogoPixels(data: Uint8Array, width: number, height: number): PixelAnalysis | null {
  if (width <= 0 || height <= 0 || data.length < width * height * 4) return null
  // Transparent logos are measured by alpha. The outer 1 px frame is left out
  // of that decision: an opaque logo with a light backdrop often has a
  // half-transparent anti-aliased edge, which is not transparency.
  let transparent = 0
  let interior = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      interior++
      if (data[(y * width + x) * 4 + 3] < 128) transparent++
    }
  }
  const useAlpha = interior > 0 ? transparent > interior * 0.02 : data[3] < 128

  let bg: [number, number, number] | null = null
  if (!useAlpha) {
    const rs: number[] = []
    const gs: number[] = []
    const bs: number[] = []
    const push = (x: number, y: number) => {
      const o = (y * width + x) * 4
      // Composite over white: a half-transparent edge pixel reads as the backdrop it fades into.
      const a = data[o + 3] / 255
      rs.push(Math.round(data[o] * a + 255 * (1 - a)))
      gs.push(Math.round(data[o + 1] * a + 255 * (1 - a)))
      bs.push(Math.round(data[o + 2] * a + 255 * (1 - a)))
    }
    for (let x = 0; x < width; x++) {
      push(x, 0)
      push(x, height - 1)
    }
    for (let y = 1; y < height - 1; y++) {
      push(0, y)
      push(width - 1, y)
    }
    const median = (v: number[]) => v.sort((a, b) => a - b)[v.length >> 1]
    const candidate: [number, number, number] = [median(rs), median(gs), median(bs)]
    if (Math.min(...candidate) < LIGHT_BACKGROUND) {
      // A full-bleed mark (a coloured or dark tile): the whole image is the logo.
      return { aspect: width / height, density: 1, crop: { x: 0, y: 0, w: 1, h: 1 } }
    }
    bg = candidate
  }

  const weightAt = (o: number): number => {
    if (useAlpha) {
      const a = data[o + 3]
      return a > ALPHA_INK ? a / 255 : 0
    }
    const [br, bgc, bb] = bg as [number, number, number]
    const a = data[o + 3] / 255
    const d = Math.hypot(
      data[o] * a + 255 * (1 - a) - br,
      data[o + 1] * a + 255 * (1 - a) - bgc,
      data[o + 2] * a + 255 * (1 - a) - bb,
    )
    return d > BACKGROUND_DISTANCE ? Math.min(1, d / INK_FULL_DISTANCE) : 0
  }

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (weightAt((y * width + x) * 4) > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null

  const boxW = maxX - minX + 1
  const boxH = maxY - minY + 1
  let ink = 0
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) ink += weightAt((y * width + x) * 4)
  }
  const r4 = (v: number) => Math.round(v * 10000) / 10000
  return {
    aspect: r4(boxW / boxH),
    density: r4(Math.max(0.0001, Math.min(1, ink / (boxW * boxH)))),
    crop: { x: r4(minX / width), y: r4(minY / height), w: r4(boxW / width), h: r4(boxH / height) },
  }
}
