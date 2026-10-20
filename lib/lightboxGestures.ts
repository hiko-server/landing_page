/**
 * Gesture maths of the image viewer (components/Common/lightboxEngine.ts,
 * C3). Pure and DOM-free (unit-tested in tests/lightbox-gestures.test.ts).
 *
 * Coordinates are viewport CSS px. The image's "base" box is where the
 * viewer lays it out at rest (fitted between the top bar and the caption);
 * the view transform moves and scales that box about its centre:
 *
 *   drawn centre = base centre + (x, y),   drawn size = base size × scale
 *
 * A point of the image therefore stays under a focal point f while zooming
 * when the translation follows `zoomAround`.
 */

export type Point = { x: number; y: number }
export type Box = { left: number; top: number; right: number; bottom: number }
export type Rect = { left: number; top: number; width: number; height: number }
/** The image's laid-out box at rest: centre and size. */
export type Base = { cx: number; cy: number; width: number; height: number }
export type ViewTransform = { x: number; y: number; scale: number }

export const IDENTITY: ViewTransform = Object.freeze({ x: 0, y: 0, scale: 1 })

/** Zoom range (1 = fitted). Pinching past either end rubber-bands, then settles back. */
export const MIN_SCALE = 1
export const MAX_SCALE = 4
/** Double tap / double click / the zoom button: at least this, more if the image needs it to fill the screen. */
export const DOUBLE_TAP_SCALE = 2.5
/** A scale above this counts as zoomed in (pans instead of paging; the zoom button zooms out). */
export const ZOOMED_EPSILON = 1.01

/** Movement (px) before a press becomes a drag; less is a tap. */
export const TAP_SLOP = 8
/** Two taps this close in time (ms) and space (px) are a double tap. */
export const DOUBLE_TAP_MS = 300
export const DOUBLE_TAP_SLOP = 24

/** Paging: a release past this share of the width, or a flick faster than this (px/s). */
export const PAGE_DISTANCE_RATIO = 0.22
export const PAGE_VELOCITY = 500
/** Space between neighbouring images on the track (px). */
export const SLIDE_GAP = 24

/** Drag to close: past this distance (px), or a flick faster than this (px/s) in the drag's direction. */
export const DISMISS_DISTANCE = 120
export const DISMISS_VELOCITY = 800
/** Pinching below this scale (from fitted) and letting go closes the viewer. */
export const PINCH_CLOSE_SCALE = 0.8

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * The iOS rubber band: how far content travels when dragged `overshoot` px
 * past an edge of a `dimension` px track. Approaches `dimension` and never
 * exceeds it; the first pixels move almost 1:1 × `constant`.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  if (overshoot <= 0 || dimension <= 0) return 0
  return (1 - 1 / ((overshoot * constant) / dimension + 1)) * dimension
}

/** `value` held between `min` and `max` with a rubber band past either end. */
export function resist(value: number, min: number, max: number, dimension: number): number {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  if (value < lo) return lo - rubberband(lo - value, dimension)
  if (value > hi) return hi + rubberband(value - hi, dimension)
  return value
}

/**
 * A pinch past the zoom range: above MAX_SCALE it resists like a rubber
 * band (in proportion to the scale); below MIN_SCALE it follows more freely,
 * so a pinch-to-close shows the image really shrinking.
 */
export function resistScale(scale: number): number {
  if (scale > MAX_SCALE) return MAX_SCALE * (1 + rubberband(scale / MAX_SCALE - 1, 1))
  if (scale < MIN_SCALE) return MIN_SCALE - rubberband(MIN_SCALE - scale, 1, 1.4)
  return scale
}

/** The translation that keeps the image point under `focal` there while the scale becomes `scale`. */
export function zoomAround(t: ViewTransform, scale: number, focal: Point, base: Base): ViewTransform {
  const s = t.scale || 1
  const px = (focal.x - base.cx - t.x) / s
  const py = (focal.y - base.cy - t.y) / s
  return { scale, x: focal.x - base.cx - scale * px, y: focal.y - base.cy - scale * py }
}

export type PanBounds = { minX: number; maxX: number; minY: number; maxY: number }

/**
 * Where the image may sit at `scale` inside `view` (the stage): along an
 * axis where it is larger than the stage it may pan until an edge meets the
 * stage's edge; along an axis where it fits it has one place — as near its
 * resting position as the stage allows (so zooming never makes it jump).
 */
export function panBounds(base: Base, scale: number, view: Box): PanBounds {
  const axis = (center: number, size: number, lo: number, hi: number): [number, number] => {
    const half = (size * scale) / 2
    const alignStart = lo - (center - half) // the image's start edge on the stage's start edge
    const alignEnd = hi - (center + half) // the image's end edge on the stage's end edge
    if (size * scale <= hi - lo) {
      const rest = clamp(0, alignStart, alignEnd)
      return [rest, rest]
    }
    return [alignEnd, alignStart]
  }
  const [minX, maxX] = axis(base.cx, base.width, view.left, view.right)
  const [minY, maxY] = axis(base.cy, base.height, view.top, view.bottom)
  return { minX, maxX, minY, maxY }
}

/** The transform held inside the zoom range and the pan bounds (where a gesture settles). */
export function clampView(t: ViewTransform, base: Base, view: Box): ViewTransform {
  const scale = clamp(t.scale, MIN_SCALE, MAX_SCALE)
  const b = panBounds(base, scale, view)
  return { scale, x: clamp(t.x, b.minX, b.maxX), y: clamp(t.y, b.minY, b.maxY) }
}

/** The settled transform after a pinch released at `t` around `focal`: back inside the range, focal point kept. */
export function settleView(t: ViewTransform, focal: Point, base: Base, view: Box): ViewTransform {
  const scale = clamp(t.scale, MIN_SCALE, MAX_SCALE)
  if (scale <= MIN_SCALE) return { ...IDENTITY }
  return clampView(scale === t.scale ? t : zoomAround(t, scale, focal, base), base, view)
}

/** The scale at which the image covers the whole stage. */
export function fillScale(base: Base, view: Box): number {
  if (base.width <= 0 || base.height <= 0) return MIN_SCALE
  return Math.max((view.right - view.left) / base.width, (view.bottom - view.top) / base.height)
}

/** The zoomed-in level of a double tap or the zoom button: DOUBLE_TAP_SCALE, or enough to fill the stage. */
export function zoomInScale(base: Base, view: Box): number {
  return clamp(Math.max(DOUBLE_TAP_SCALE, fillScale(base, view)), MIN_SCALE, MAX_SCALE)
}

export function isZoomed(t: ViewTransform): boolean {
  return t.scale > ZOOMED_EPSILON
}

/** Double tap / double click at `focal`: zoom in there, or back out to fitted when zoomed. */
export function toggleZoom(t: ViewTransform, focal: Point, base: Base, view: Box): ViewTransform {
  if (isZoomed(t)) return { ...IDENTITY }
  return clampView(zoomAround(t, zoomInScale(base, view), focal, base), base, view)
}

/** `+` / `−` from the keyboard: one step of ×1.5 around `focal`, snapping back to fitted near it. */
export function stepZoom(t: ViewTransform, direction: 1 | -1, focal: Point, base: Base, view: Box): ViewTransform {
  const raw = direction > 0 ? t.scale * 1.5 : t.scale / 1.5
  const scale = raw < 1.05 ? MIN_SCALE : clamp(raw, MIN_SCALE, MAX_SCALE)
  if (scale <= MIN_SCALE) return { ...IDENTITY }
  return clampView(zoomAround(t, scale, focal, base), base, view)
}

/** Zoom around `focal` to an absolute `scale` (wheel, trackpad pinch), held in range and bounds. */
export function zoomTo(t: ViewTransform, scale: number, focal: Point, base: Base, view: Box): ViewTransform {
  const s = clamp(scale, MIN_SCALE, MAX_SCALE)
  if (s <= MIN_SCALE) return { ...IDENTITY }
  return clampView(zoomAround(t, s, focal, base), base, view)
}

export type PinchStart = { view: ViewTransform; a: Point; b: Point }

/**
 * A two-finger pinch: the scale follows the change in finger distance (with
 * a rubber band past the range) and the image point that was under the
 * fingers' midpoint stays under it, so pinching also pans.
 */
export function pinchView(start: PinchStart, a: Point, b: Point, base: Base, view: Box): ViewTransform {
  const d0 = Math.max(distance(start.a, start.b), 1)
  const raw = start.view.scale * (distance(a, b) / d0)
  const scale = resistScale(raw)
  const m0 = midpoint(start.a, start.b)
  const m = midpoint(a, b)
  const s0 = start.view.scale || 1
  const px = (m0.x - base.cx - start.view.x) / s0
  const py = (m0.y - base.cy - start.view.y) / s0
  const x = m.x - base.cx - scale * px
  const y = m.y - base.cy - scale * py
  if (scale < MIN_SCALE) return { scale, x, y }
  const bounds = panBounds(base, Math.min(scale, MAX_SCALE), view)
  return {
    scale,
    x: resist(x, bounds.minX, bounds.maxX, view.right - view.left),
    y: resist(y, bounds.minY, bounds.maxY, view.bottom - view.top),
  }
}

/** The raw (unresisted) scale of a pinch: decides a pinch-to-close. */
export function pinchRawScale(start: PinchStart, a: Point, b: Point): number {
  return start.view.scale * (distance(a, b) / Math.max(distance(start.a, start.b), 1))
}

/**
 * Splits a horizontal drag of a zoomed image between panning and the track:
 * the image pans until its edge, and whatever the finger travels beyond
 * that moves the strip towards the neighbouring image.
 */
export function panWithOverflow(x: number, minX: number, maxX: number): { x: number; overflow: number } {
  if (x > maxX) return { x: maxX, overflow: x - maxX }
  if (x < minX) return { x: minX, overflow: x - minX }
  return { x, overflow: 0 }
}

/** The first clear direction of a drag: null until it has moved TAP_SLOP px. */
export function lockAxis(dx: number, dy: number, slop = TAP_SLOP): 'x' | 'y' | null {
  if (Math.hypot(dx, dy) < slop) return null
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
}

/**
 * Where a horizontal release goes: +1 to the next image (dragged left), -1
 * to the previous one, 0 back. A flick decides on its own; a slow drag must
 * pass PAGE_DISTANCE_RATIO of the width; a flick back cancels.
 */
export function pageDecision(dx: number, vx: number, width: number): -1 | 0 | 1 {
  const far = Math.abs(dx) > width * PAGE_DISTANCE_RATIO
  if (dx < 0 && vx <= PAGE_VELOCITY && (vx < -PAGE_VELOCITY || far)) return 1
  if (dx > 0 && vx >= -PAGE_VELOCITY && (vx > PAGE_VELOCITY || far)) return -1
  return 0
}

/** Whether a vertical release closes the viewer (far enough, or flicked in the drag's direction). */
export function shouldDismiss(dy: number, vy: number): boolean {
  const against = Math.sign(vy) !== 0 && Math.sign(vy) !== Math.sign(dy) && Math.abs(vy) > PAGE_VELOCITY
  if (Math.abs(dy) > DISMISS_DISTANCE && !against) return true
  return Math.abs(dy) > TAP_SLOP && Math.sign(vy) === Math.sign(dy) && Math.abs(vy) > DISMISS_VELOCITY
}

/** How far a drag to close has gone, 0 to 1 (full at half the stage or 400 px, whichever is less). */
export function dismissProgress(dy: number, stageHeight: number): number {
  const span = Math.max(1, Math.min(400, stageHeight / 2))
  return clamp(Math.abs(dy) / span, 0, 1)
}

/** Backdrop opacity while dragging to close or pinching small (1 → 0.2). */
export function backdropOpacity(progress: number): number {
  return 1 - 0.8 * clamp(progress, 0, 1)
}

/** The image's scale while dragging to close (1 → 0.9). */
export function dismissScale(progress: number): number {
  return 1 - 0.1 * clamp(progress, 0, 1)
}

/** How much of a pinch below fitted reads as closing (fitted → PINCH_CLOSE_SCALE is 0 → 1). */
export function pinchCloseProgress(scale: number): number {
  return clamp((MIN_SCALE - scale) / (MIN_SCALE - PINCH_CLOSE_SCALE), 0, 1)
}

/** One wheel event's zoom factor (d3-zoom's curve: a mouse notch ≈ ×1.15, a trackpad pinch is smooth). */
export function wheelZoomFactor(deltaY: number, deltaMode: number, pinch: boolean): number {
  const k = deltaMode === 1 ? 0.05 : deltaMode === 2 ? 1 : 0.002
  return clamp(2 ** (-deltaY * k * (pinch ? 10 : 1)), 0.5, 2)
}

/** A wheel delta in px (line and page modes converted). */
export function wheelPixels(delta: number, deltaMode: number, pageSize: number): number {
  return deltaMode === 1 ? delta * 16 : deltaMode === 2 ? delta * pageSize : delta
}

/** Index `delta` steps from `index`, wrapping around `count`. */
export function wrapIndex(index: number, delta: number, count: number): number {
  if (count <= 0) return 0
  return (((index + delta) % count) + count) % count
}

/** The images kept mounted around `index`: itself and its neighbours (wrapping), each once. */
export function windowIndices(index: number, count: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [index]
  const set = [wrapIndex(index, -1, count), index, wrapIndex(index, 1, count)]
  return set.filter((v, i) => set.indexOf(v) === i)
}

/**
 * Where slide `slide` sits on the track while `current` is shown, in slide
 * widths: -1 left, 0 centre, +1 right. With two images the other one is
 * both neighbours, so it goes to `side` — the side the strip is moving
 * towards.
 */
export function slideOffset(slide: number, current: number, count: number, side: -1 | 1): number {
  if (slide === current || count <= 1) return 0
  if (count === 2) return side
  const forward = wrapIndex(slide, -current, count)
  return forward <= count / 2 ? forward : forward - count
}

// ── Open / close morph ─────────────────────────────────────────────────────

/** Where an image of aspect ratio `ratio` (w / h) is drawn in `box` with object-fit cover or contain, centred. */
export function fittedRect(box: Rect, ratio: number, fit: 'cover' | 'contain'): Rect {
  if (!(ratio > 0) || box.width <= 0 || box.height <= 0) return box
  const boxRatio = box.width / box.height
  const wide = ratio > boxRatio
  const width = (fit === 'cover') === wide ? box.height * ratio : box.width
  const height = (fit === 'cover') === wide ? box.height : box.width / ratio
  return { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height }
}

export function intersect(a: Rect, b: Rect): Rect {
  const left = Math.max(a.left, b.left)
  const top = Math.max(a.top, b.top)
  const right = Math.min(a.left + a.width, b.left + b.width)
  const bottom = Math.min(a.top + a.height, b.top + b.height)
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

/** Share of `rect`'s area inside the viewport (0 when it has none). */
export function visibleFraction(rect: Rect, viewport: { width: number; height: number }): number {
  const area = rect.width * rect.height
  if (area <= 0) return 0
  const inside = intersect(rect, { left: 0, top: 0, width: viewport.width, height: viewport.height })
  return (inside.width * inside.height) / area
}

export type Insets = { top: number; right: number; bottom: number; left: number }

/**
 * The viewer image's pose: its layer's translation and scale (as the view
 * transform), plus a clip in the image's own (unscaled) px and its corner
 * radius in the same units.
 */
export type MorphPose = { x: number; y: number; scale: number; clip: Insets; radius: number }

export const NO_CLIP: Insets = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 })

/**
 * The pose that puts the viewer image (laid out at `target`) exactly over
 * the page image: the whole picture where the page draws it (`drawn`),
 * cut to the part the page shows (`shown`: its tile's box), with the
 * tile's corner radius. Morphing from this pose to the resting one is the
 * shared-element open; the reverse is the close.
 */
export function morphPose(target: Rect, drawn: Rect, shown: Rect, radius: number): MorphPose {
  const scale = target.width > 0 ? drawn.width / target.width : 1
  const s = scale > 0 ? scale : 1
  const x = drawn.left + drawn.width / 2 - (target.left + target.width / 2)
  const y = drawn.top + drawn.height / 2 - (target.top + target.height / 2)
  const vis = intersect(drawn, shown)
  const clip: Insets = {
    top: Math.max(0, (vis.top - drawn.top) / s),
    left: Math.max(0, (vis.left - drawn.left) / s),
    right: Math.max(0, (drawn.left + drawn.width - (vis.left + vis.width)) / s),
    bottom: Math.max(0, (drawn.top + drawn.height - (vis.top + vis.height)) / s),
  }
  return { x, y, scale: s, clip, radius: Math.max(0, radius) / s }
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p

export function lerpPose(a: MorphPose, b: MorphPose, p: number): MorphPose {
  return {
    x: lerp(a.x, b.x, p),
    y: lerp(a.y, b.y, p),
    scale: lerp(a.scale, b.scale, p),
    clip: {
      top: lerp(a.clip.top, b.clip.top, p),
      right: lerp(a.clip.right, b.clip.right, p),
      bottom: lerp(a.clip.bottom, b.clip.bottom, p),
      left: lerp(a.clip.left, b.clip.left, p),
    },
    radius: lerp(a.radius, b.radius, p),
  }
}

/** CSS clip-path of a pose (none when nothing is cut). */
export function clipPathOf(pose: MorphPose): string {
  const { top, right, bottom, left } = pose.clip
  if (top < 0.01 && right < 0.01 && bottom < 0.01 && left < 0.01) return ''
  const r = (n: number) => `${Math.round(n * 100) / 100}px`
  return `inset(${r(top)} ${r(right)} ${r(bottom)} ${r(left)} round ${r(pose.radius)})`
}

/** CSS transform of a translation + scale about the element's centre. */
export function transformOf(x: number, y: number, scale: number): string {
  const r = (n: number) => Math.round(n * 1000) / 1000
  return `translate3d(${r(x)}px, ${r(y)}px, 0) scale(${r(scale)})`
}
