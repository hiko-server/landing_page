/**
 * C3 — Lightbox gestures 2.0: the gesture maths (lib/lightboxGestures.ts),
 * the motion physics (lib/lightboxPhysics.ts) and static guards on how the
 * viewer is wired (touch-action, lazy loading, the morph origins).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  DISMISS_DISTANCE,
  DOUBLE_TAP_SCALE,
  IDENTITY,
  MAX_SCALE,
  MIN_SCALE,
  PAGE_VELOCITY,
  PINCH_CLOSE_SCALE,
  backdropOpacity,
  clampView,
  clipPathOf,
  dismissProgress,
  dismissScale,
  fillScale,
  fittedRect,
  intersect,
  isZoomed,
  lerpPose,
  lockAxis,
  morphPose,
  pageDecision,
  panBounds,
  panWithOverflow,
  pinchCloseProgress,
  pinchRawScale,
  pinchView,
  resist,
  resistScale,
  rubberband,
  settleView,
  shouldDismiss,
  slideOffset,
  stepZoom,
  toggleZoom,
  transformOf,
  visibleFraction,
  wheelPixels,
  wheelZoomFactor,
  windowIndices,
  wrapIndex,
  zoomAround,
  zoomInScale,
  zoomTo,
  type Base,
  type Box,
  type ViewTransform,
} from '../lib/lightboxGestures'
import {
  BOUNCE_SPRING,
  MORPH_SPRING,
  PAGE_SPRING,
  SETTLE_SPRING,
  VelocityTracker,
  momentumRestingPoint,
  springSettled,
  stepDecay,
  stepMomentum,
  stepSpring,
  type SpringConfig,
  type SpringState,
} from '../lib/lightboxPhysics'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const near = (actual: number, expected: number, eps = 1e-6, msg?: string) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${msg ? `${msg}: ` : ''}${actual} ≉ ${expected} (±${eps})`)

/** A 1000 × 800 stage with a 600 × 400 image centred in it. */
const VIEW: Box = { left: 0, top: 0, right: 1000, bottom: 800 }
const BASE: Base = { cx: 500, cy: 400, width: 600, height: 400 }

/** Where the image point under `p` (viewport) is drawn after the transform changes from `a` to `b`. */
function follow(p: { x: number; y: number }, a: ViewTransform, b: ViewTransform, base = BASE) {
  const lx = (p.x - base.cx - a.x) / a.scale
  const ly = (p.y - base.cy - a.y) / a.scale
  return { x: base.cx + b.x + lx * b.scale, y: base.cy + b.y + ly * b.scale }
}

// ── Rubber band and resistance ────────────────────────────────────────────

test('rubberband: zero at the edge, ~0.55× at first, never reaches the dimension', () => {
  assert.equal(rubberband(0, 500), 0)
  assert.equal(rubberband(-10, 500), 0)
  near(rubberband(1, 500), 0.55, 0.01, 'first pixel')
  let previous = 0
  for (const d of [10, 50, 100, 300, 1000, 10_000, 1e6]) {
    const r = rubberband(d, 500)
    assert.ok(r > previous, 'monotonic')
    assert.ok(r < 500, 'bounded by the dimension')
    previous = r
  }
})

test('resist: free inside the range, rubber-banded past either end', () => {
  assert.equal(resist(50, 0, 100, 400), 50)
  assert.equal(resist(100, 0, 100, 400), 100)
  near(resist(150, 0, 100, 400), 100 + rubberband(50, 400))
  near(resist(-50, 0, 100, 400), -rubberband(50, 400))
  // Bounds given the other way round work the same.
  near(resist(150, 100, 0, 400), 100 + rubberband(50, 400))
})

test('resistScale: free within 1–4×, a rubber band above, a softer give below', () => {
  assert.equal(resistScale(2), 2)
  assert.equal(resistScale(MAX_SCALE), MAX_SCALE)
  const over = resistScale(8)
  assert.ok(over > MAX_SCALE && over < 8 && over < MAX_SCALE * 2)
  const under = resistScale(0.5)
  assert.ok(under < MIN_SCALE && under > 0.5, 'shrinks, but less than the fingers')
  assert.ok(resistScale(0.5) < resistScale(0.8), 'monotonic below 1')
})

// ── Zoom geometry ────────────────────────────────────────────────────────

test('zoomAround keeps the image point under the focal point', () => {
  const start: ViewTransform = { x: 30, y: -20, scale: 1.5 }
  for (const focal of [
    { x: 500, y: 400 },
    { x: 210, y: 220 },
    { x: 790, y: 590 },
  ]) {
    const next = zoomAround(start, 3, focal, BASE)
    const p = follow(focal, start, next)
    near(p.x, focal.x, 1e-9)
    near(p.y, focal.y, 1e-9)
    assert.equal(next.scale, 3)
  }
})

test('panBounds: nothing to pan at 1×; a zoomed image may pan until its edges meet the stage', () => {
  assert.deepEqual(panBounds(BASE, 1, VIEW), { minX: 0, maxX: 0, minY: 0, maxY: 0 })
  // 2×: 1200 × 800 — wider than the stage by 200 (±100), exactly as tall (no vertical travel).
  const b = panBounds(BASE, 2, VIEW)
  near(b.minX, -100)
  near(b.maxX, 100)
  near(b.minY, 0)
  near(b.maxY, 0)
  // 4×: 2400 × 1600 — ±700 and ±400.
  const c = panBounds(BASE, 4, VIEW)
  near(c.maxX, 700)
  near(c.minX, -700)
  near(c.maxY, 400)
  near(c.minY, -400)
})

test('panBounds: an axis that still fits stays as near its resting place as the stage allows (no jump when zooming)', () => {
  // The image rests high (room for the caption below): centre y = 300 in an 800 px stage.
  const high: Base = { cx: 500, cy: 300, width: 600, height: 400 }
  // 1.5×: 600 px tall — fits; it can stay centred on 300 (top 0, bottom 600).
  const b = panBounds(high, 1.5, VIEW)
  near(b.minY, 0)
  near(b.maxY, 0)
  // 1.75×: 700 px tall — centred on 300 its top would be at -50: pushed down 50 to stay on stage.
  const c = panBounds(high, 1.75, VIEW)
  near(c.minY, 50)
  near(c.maxY, 50)
})

test('clampView / settleView: back inside the range and the bounds; a pinch below 1× settles to fitted', () => {
  assert.deepEqual(clampView({ x: 900, y: -900, scale: 9 }, BASE, VIEW), { x: 700, y: -400, scale: MAX_SCALE })
  assert.deepEqual(settleView({ x: 10, y: 10, scale: 0.7 }, { x: 500, y: 400 }, BASE, VIEW), { ...IDENTITY })
  // Over-pinched around a point: the scale comes back to 4× around that same point, then bounds apply.
  const focal = { x: 400, y: 350 }
  const over: ViewTransform = zoomAround(IDENTITY, 5, focal, BASE)
  const settled = settleView(over, focal, BASE, VIEW)
  assert.equal(settled.scale, MAX_SCALE)
  const expected = clampView(zoomAround(over, MAX_SCALE, focal, BASE), BASE, VIEW)
  near(settled.x, expected.x)
  near(settled.y, expected.y)
})

test('double tap: zooms in at the tapped point (enough to fill the stage), and back out to fitted', () => {
  assert.equal(fillScale(BASE, VIEW), 2) // 800 / 400
  assert.equal(zoomInScale(BASE, VIEW), DOUBLE_TAP_SCALE)
  // A wide image on a tall phone fills the height instead.
  const phone: Box = { left: 0, top: 0, right: 390, bottom: 844 }
  const wide: Base = { cx: 195, cy: 400, width: 366, height: 183 }
  near(zoomInScale(wide, phone), Math.min(MAX_SCALE, 844 / 183))

  const p = { x: 520, y: 410 } // near the centre: no clamping
  const zoomed = toggleZoom(IDENTITY, p, BASE, VIEW)
  assert.equal(zoomed.scale, DOUBLE_TAP_SCALE)
  const q = follow(p, IDENTITY, zoomed)
  near(q.x, p.x, 1e-9, 'the tapped point stays put')
  near(q.y, p.y, 1e-9)
  // Near an edge, the bounds win over the focal point: the image still covers the stage.
  const edge = toggleZoom(IDENTITY, { x: 210, y: 210 }, BASE, VIEW)
  const b = panBounds(BASE, edge.scale, VIEW)
  assert.ok(edge.x <= b.maxX + 1e-9 && edge.x >= b.minX - 1e-9)
  assert.deepEqual(toggleZoom(zoomed, p, BASE, VIEW), { ...IDENTITY })
  assert.ok(isZoomed(zoomed) && !isZoomed(IDENTITY))
})

test('keyboard zoom steps ×1.5, stops at 4×, snaps back to fitted', () => {
  const c = { x: 500, y: 400 }
  let t: ViewTransform = { ...IDENTITY }
  const scales: number[] = []
  for (let i = 0; i < 5; i++) {
    t = stepZoom(t, 1, c, BASE, VIEW)
    scales.push(Math.round(t.scale * 1000) / 1000)
  }
  assert.deepEqual(scales, [1.5, 2.25, 3.375, 4, 4])
  t = stepZoom({ x: 0, y: 0, scale: 1.5 }, -1, c, BASE, VIEW)
  assert.deepEqual(t, { ...IDENTITY })
  t = stepZoom({ x: 0, y: 0, scale: 1.55 }, -1, c, BASE, VIEW)
  assert.deepEqual(t, { ...IDENTITY }, 'snaps when the step lands just above 1×')
})

test('zoomTo (wheel / trackpad): absolute scale around the pointer, clamped', () => {
  assert.deepEqual(zoomTo(IDENTITY, 0.5, { x: 100, y: 100 }, BASE, VIEW), { ...IDENTITY })
  assert.equal(zoomTo(IDENTITY, 12, { x: 500, y: 400 }, BASE, VIEW).scale, MAX_SCALE)
  const p = { x: 480, y: 390 }
  const t = zoomTo(IDENTITY, 1.8, p, BASE, VIEW)
  const q = follow(p, IDENTITY, t)
  near(q.x, p.x, 1e-9)
})

// ── Pinch ──────────────────────────────────────────────────────────────────

test('pinch: the scale follows the finger distance and the midpoint carries the image', () => {
  const start = { view: { ...IDENTITY }, a: { x: 450, y: 400 }, b: { x: 550, y: 400 } }
  // Fingers twice as far apart, around the same midpoint: 2×, centred.
  const t = pinchView(start, { x: 400, y: 400 }, { x: 600, y: 400 }, BASE, VIEW)
  near(t.scale, 2)
  near(t.x, 0)
  near(t.y, 0)
  near(pinchRawScale(start, { x: 400, y: 400 }, { x: 600, y: 400 }), 2)
  // Same distance, midpoint moved 40 px right: pans 40 (inside the 2× bounds of ±100).
  const s2 = { view: t, a: { x: 400, y: 400 }, b: { x: 600, y: 400 } }
  const moved = pinchView(s2, { x: 440, y: 400 }, { x: 640, y: 400 }, BASE, VIEW)
  near(moved.x, 40)
  near(moved.scale, 2)
  // Past the bounds the pan rubber-bands.
  const far = pinchView(s2, { x: 700, y: 400 }, { x: 900, y: 400 }, BASE, VIEW)
  assert.ok(far.x > 100 && far.x < 300, `resisted ${far.x}`)
})

test('pinch: past 4× it resists; below 1× it follows (pinch-to-close), and the backdrop reads it', () => {
  const start = { view: { ...IDENTITY }, a: { x: 490, y: 400 }, b: { x: 510, y: 400 } }
  const huge = pinchView(start, { x: 400, y: 400 }, { x: 600, y: 400 }, BASE, VIEW) // raw 10×
  assert.ok(huge.scale > MAX_SCALE && huge.scale < 10)
  const small = pinchView({ view: { ...IDENTITY }, a: { x: 400, y: 400 }, b: { x: 600, y: 400 } }, { x: 450, y: 400 }, { x: 550, y: 400 }, BASE, VIEW)
  assert.ok(small.scale < 1 && small.scale >= 0.5)
  assert.equal(pinchCloseProgress(1), 0)
  assert.equal(pinchCloseProgress(PINCH_CLOSE_SCALE), 1)
  assert.equal(pinchCloseProgress(0.3), 1)
  near(pinchCloseProgress(0.9), 0.5)
})

// ── Drag decisions ─────────────────────────────────────────────────────────

test('lockAxis: undecided inside the tap slop, then the dominant direction', () => {
  assert.equal(lockAxis(3, 4), null)
  assert.equal(lockAxis(9, 2), 'x')
  assert.equal(lockAxis(-2, -9), 'y')
  assert.equal(lockAxis(-12, 11), 'x')
})

test('pageDecision: distance or flick pages, a flick back cancels', () => {
  const w = 390
  assert.equal(pageDecision(-40, -800, w), 1, 'a short fast flick left: next')
  assert.equal(pageDecision(40, 800, w), -1, 'a short fast flick right: previous')
  assert.equal(pageDecision(-120, 0, w), 1, 'a slow drag past ~22% of the width')
  assert.equal(pageDecision(-60, -100, w), 0, 'a slow short drag snaps back')
  assert.equal(pageDecision(-200, PAGE_VELOCITY + 100, w), 0, 'dragged far, then flicked back')
  assert.equal(pageDecision(0, -2000, w), 0, 'no displacement, no page')
})

test('shouldDismiss: past 120 px or a flick in the direction of the drag', () => {
  assert.equal(shouldDismiss(DISMISS_DISTANCE + 1, 0), true)
  assert.equal(shouldDismiss(-(DISMISS_DISTANCE + 1), 0), true, 'upwards too')
  assert.equal(shouldDismiss(60, 1200), true, 'a flick down')
  assert.equal(shouldDismiss(60, -1200), false, 'a flick against the drag')
  assert.equal(shouldDismiss(200, -900), false, 'dragged far, flicked back')
  assert.equal(shouldDismiss(5, 2000), false, 'a twitch is not a drag')
  assert.equal(shouldDismiss(80, 300), false)
})

test('drag to close: progress, backdrop 1 → 0.2 and image scale 1 → 0.9', () => {
  assert.equal(dismissProgress(0, 800), 0)
  near(dismissProgress(200, 800), 0.5)
  near(dismissProgress(-200, 800), 0.5)
  assert.equal(dismissProgress(2000, 800), 1)
  near(dismissProgress(150, 300), 1, 1e-9, 'half a short stage')
  assert.equal(backdropOpacity(0), 1)
  near(backdropOpacity(1), 0.2)
  assert.equal(dismissScale(0), 1)
  near(dismissScale(1), 0.9)
})

test('panWithOverflow: a zoomed image pans to its edge, then the strip takes over', () => {
  assert.deepEqual(panWithOverflow(50, -100, 100), { x: 50, overflow: 0 })
  assert.deepEqual(panWithOverflow(160, -100, 100), { x: 100, overflow: 60 })
  assert.deepEqual(panWithOverflow(-130, -100, 100), { x: -100, overflow: -30 })
})

// ── Wheel ──────────────────────────────────────────────────────────────────

test('wheel: a mouse notch is about ×1.15, a trackpad pinch streams small steps, both directions symmetric', () => {
  near(wheelZoomFactor(-100, 0, false), 2 ** 0.2, 1e-9)
  near(wheelZoomFactor(100, 0, false) * wheelZoomFactor(-100, 0, false), 1, 1e-9)
  near(wheelZoomFactor(-3, 1, false), 2 ** 0.15, 1e-9, 'Firefox line mode')
  const pinch = wheelZoomFactor(-2, 0, true)
  assert.ok(pinch > 1 && pinch < 1.05)
  assert.equal(wheelZoomFactor(-100_000, 0, true), 2, 'one event never more than doubles')
  assert.equal(wheelZoomFactor(100_000, 0, true), 0.5)
  assert.equal(wheelPixels(3, 1, 800), 48)
  assert.equal(wheelPixels(1, 2, 800), 800)
  assert.equal(wheelPixels(-12, 0, 800), -12)
})

// ── The strip ──────────────────────────────────────────────────────────────

test('wrapIndex / windowIndices: neighbours wrap, each image once', () => {
  assert.equal(wrapIndex(0, -1, 5), 4)
  assert.equal(wrapIndex(4, 1, 5), 0)
  assert.equal(wrapIndex(2, 7, 5), 4)
  assert.deepEqual(windowIndices(0, 5), [4, 0, 1])
  assert.deepEqual(windowIndices(3, 5), [2, 3, 4])
  assert.deepEqual(windowIndices(0, 2), [1, 0])
  assert.deepEqual(windowIndices(0, 1), [0])
  assert.deepEqual(windowIndices(0, 0), [])
})

test('slideOffset: left / centre / right, wrapping; with two images the other one goes where the strip is heading', () => {
  assert.equal(slideOffset(3, 3, 5, 1), 0)
  assert.equal(slideOffset(4, 3, 5, 1), 1)
  assert.equal(slideOffset(2, 3, 5, 1), -1)
  assert.equal(slideOffset(0, 4, 5, 1), 1, 'wraps forward')
  assert.equal(slideOffset(4, 0, 5, 1), -1, 'wraps back')
  assert.equal(slideOffset(1, 0, 2, 1), 1)
  assert.equal(slideOffset(1, 0, 2, -1), -1)
  assert.equal(slideOffset(0, 0, 1, 1), 0)
})

// ── The morph ──────────────────────────────────────────────────────────────

test('fittedRect: object-fit cover crops the long side, contain letterboxes', () => {
  const box = { left: 10, top: 20, width: 400, height: 300 } // 4:3 tile
  const cover = fittedRect(box, 16 / 9, 'cover')
  near(cover.height, 300)
  near(cover.width, 300 * (16 / 9))
  near(cover.left + cover.width / 2, 210)
  const contain = fittedRect(box, 16 / 9, 'contain')
  near(contain.width, 400)
  near(contain.height, 225)
  near(contain.top, 20 + 37.5)
  const tall = fittedRect(box, 0.5, 'cover')
  near(tall.width, 400)
  near(tall.height, 800)
})

test('morphPose: lands the viewer image exactly on the tile, cut to what the tile shows, with its radius', () => {
  const target = { left: 200, top: 100, width: 600, height: 400 } // the viewer frame at rest (3:2)
  // A 4:3 tile at (40, 500), 160 × 120, drawing the 3:2 photo with object-fit cover.
  const tile = { left: 40, top: 500, width: 160, height: 120 }
  const drawn = fittedRect(tile, 1.5, 'cover') // 180 × 120, 10 px cropped each side
  const pose = morphPose(target, drawn, tile, 8)
  near(pose.scale, 180 / 600)
  near(pose.x, 120 - 500)
  near(pose.y, 560 - 300)
  // Clip in the frame's own px: 10 / 0.3 = 33.3 left and right, nothing top and bottom.
  near(pose.clip.left, 10 / 0.3, 1e-6)
  near(pose.clip.right, 10 / 0.3, 1e-6)
  near(pose.clip.top, 0)
  near(pose.clip.bottom, 0)
  near(pose.radius, 8 / 0.3, 1e-6)
  // The clipped, scaled frame covers exactly the tile.
  const visibleW = (600 - pose.clip.left - pose.clip.right) * pose.scale
  near(visibleW, 160, 1e-6)

  const rest = { x: 0, y: 0, scale: 1, clip: { top: 0, right: 0, bottom: 0, left: 0 }, radius: 8 }
  assert.deepEqual(lerpPose(pose, rest, 0), pose)
  assert.deepEqual(lerpPose(pose, rest, 1), rest)
  near(lerpPose(pose, rest, 0.5).scale, (0.3 + 1) / 2)
  assert.equal(clipPathOf(rest), '')
  assert.match(clipPathOf(pose), /^inset\(0px 33\.33px 0px 33\.33px round 26\.67px\)$/)
  assert.equal(transformOf(10.12345, -3, 0.5), 'translate3d(10.123px, -3px, 0) scale(0.5)')
})

test('visibleFraction / intersect: how much of a tile is on screen', () => {
  const vp = { width: 400, height: 800 }
  assert.equal(visibleFraction({ left: 0, top: 0, width: 100, height: 100 }, vp), 1)
  near(visibleFraction({ left: 350, top: 0, width: 100, height: 100 }, vp), 0.5)
  assert.equal(visibleFraction({ left: 500, top: 0, width: 100, height: 100 }, vp), 0)
  assert.equal(visibleFraction({ left: 0, top: 0, width: 0, height: 100 }, vp), 0)
  assert.deepEqual(intersect({ left: 0, top: 0, width: 10, height: 10 }, { left: 20, top: 0, width: 10, height: 10 }).width, 0)
})

// ── Physics ────────────────────────────────────────────────────────────────

function runSpring(config: SpringConfig, from: number, velocity: number, hz: number, seconds = 2) {
  let s: SpringState = { value: from, velocity }
  let min = from
  let max = from
  let settledAt = Infinity
  const dt = 1 / hz
  for (let t = 0; t < seconds; t += dt) {
    s = stepSpring(s, 0, config, dt)
    min = Math.min(min, s.value)
    max = Math.max(max, s.value)
    if (settledAt === Infinity && springSettled(s, 0, 0.5)) settledAt = t
  }
  return { s, min, max, settledAt }
}

test('springs: reach their target, the paging spring without overshoot, in well under a second', () => {
  const page = runSpring(PAGE_SPRING, 390, 0, 60)
  near(page.s.value, 0, 0.01)
  assert.ok(page.min > -1, `paging overshoots by at most a pixel (${page.min})`)
  assert.ok(page.settledAt < 0.6, `settles in ${page.settledAt}s`)
  // A flick's velocity carries into the spring without breaking it.
  const flick = runSpring(PAGE_SPRING, 390, -2500, 60)
  near(flick.s.value, 0, 0.01)
  for (const cfg of [SETTLE_SPRING, MORPH_SPRING, BOUNCE_SPRING]) near(runSpring(cfg, 300, 0, 60).s.value, 0, 0.05)
})

test('springs are frame-rate independent (60 Hz, 120 Hz and a janky 20 Hz agree)', () => {
  const at = (hz: number) => {
    let s: SpringState = { value: 300, velocity: 0 }
    const dt = 1 / hz
    for (let t = 0; t < 0.25 - 1e-9; t += dt) s = stepSpring(s, 0, MORPH_SPRING, dt)
    return s.value
  }
  near(at(60), at(120), 0.5)
  near(at(60), at(20), 1)
  // A frame gap of seconds (a background tab) is clamped, not integrated blindly.
  const s = stepSpring({ value: 300, velocity: 0 }, 0, PAGE_SPRING, 5)
  assert.ok(Number.isFinite(s.value) && Math.abs(s.value) <= 300)
})

test('momentum: exponential decay to the predicted resting point', () => {
  let s: SpringState = { value: 0, velocity: 1000 }
  for (let i = 0; i < 600; i++) s = stepDecay(s, 1 / 60)
  near(s.value, momentumRestingPoint(0, 1000), 0.5)
  assert.ok(Math.abs(s.velocity) < 1)
})

test('momentum against bounds: runs past the edge, bounces back, rests on the edge', () => {
  let s: SpringState = { value: 90, velocity: 1500 }
  let peak = s.value
  let done = false
  let frames = 0
  while (!done && frames < 600) {
    const r = stepMomentum(s, { min: -100, max: 100 }, 1 / 60)
    s = r.state
    done = r.done
    peak = Math.max(peak, s.value)
    frames++
  }
  assert.ok(done, 'comes to rest')
  assert.ok(peak > 100, 'overshoots the edge (the bounce)')
  assert.equal(s.value, 100)
  // Inside the bounds it simply glides to a stop.
  const free = stepMomentum({ value: 0, velocity: 5 }, { min: -100, max: 100 }, 1 / 60)
  assert.equal(free.done, true)
})

test('VelocityTracker: px/s over the last 100 ms; zero after a pause; tolerant of jitter', () => {
  const v = new VelocityTracker()
  v.reset(0, 0, 0)
  for (let t = 8; t <= 200; t += 8) v.add(t, t * 2, -t) // 2000 px/s right, 1000 px/s up
  const fast = v.velocity(200)
  near(fast.x, 2000, 1)
  near(fast.y, -1000, 1)
  assert.deepEqual(v.velocity(400), { x: 0, y: 0 }, 'held still before lifting')
  // One jittery sample barely moves a least-squares estimate.
  const j = new VelocityTracker()
  j.reset(0, 0, 0)
  for (let t = 8; t <= 96; t += 8) j.add(t, t + (t === 48 ? 6 : 0), 0)
  near(j.velocity(96).x, 1000, 120)
  const lone = new VelocityTracker()
  lone.reset(5, 1, 1)
  assert.deepEqual(lone.velocity(5), { x: 0, y: 0 })
})

// ── Wiring guards ──────────────────────────────────────────────────────────

test('touch-action: only the viewer stage takes every touch; the page keeps native pinch-zoom', () => {
  const lightbox = code('components/Common/Lightbox.tsx')
  // One stage, one touch-action: none — the viewer implements pinch, pan and swipe itself.
  assert.equal((lightbox.match(/touchAction: 'none'/g) || []).length, 1)
  assert.match(lightbox, /className="lightbox-stage"[\s\S]{0,400}touchAction: 'none'/)
  assert.doesNotMatch(lightbox, /allowPinchZoom/, 'the dialog never lets the page itself zoom (it would stay zoomed after closing)')
  // The page around it: images and the strip never block the browser's pinch-zoom.
  for (const f of ['components/MDX/Figure.tsx', 'components/imageScoller/imageScroller.tsx', 'components/Article/ArticleBody.tsx', 'styles/globals.css', 'pages/_document.tsx']) {
    const src = read(f)
    assert.doesNotMatch(src, /touch-?[aA]ction:\s*['"]?none/, f)
    assert.doesNotMatch(src, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?![.\d])/, f)
  }
  // The engine listens for pointers (one map of active pointers drives the pinch) and never for touch events.
  const engine = code('components/Common/lightboxEngine.ts')
  assert.match(engine, /private pointers = new Map<number, Pointer>\(\)/)
  assert.doesNotMatch(engine, /addEventListener\('touch/)
  assert.match(engine, /addEventListener\('wheel', this\.onWheel, \{ passive: false \}\)/)
})

test('the viewer stays out of first-load JavaScript and the morph needs no shared-layout machinery', () => {
  for (const f of ['components/Article/ArticleBody.tsx', 'components/imageScoller/imageScroller.tsx']) {
    const src = code(f)
    assert.match(src, /from '\.\.\/Common\/LazyLightbox'/, f)
    assert.doesNotMatch(src, /^import (?!type )[^\n]*from '\.\.\/Common\/Lightbox'/m, `${f} imports the viewer lazily only (types aside)`)
    assert.doesNotMatch(src, /layoutId|LayoutGroup|layoutScroll/, `${f}: the morph is the viewer's own`)
    assert.match(src, /originOf=\{originOf\}/, f)
  }
  assert.match(read('components/Common/LazyLightbox.tsx'), /dynamic\(loadLightbox, \{ ssr: false/)
  // Nothing but the viewer imports its engine.
  const importers = ['components', 'pages', 'lib']
    .flatMap((dir) => fs.readdirSync(path.join(ROOT, dir), { recursive: true }).map((f) => path.join(dir, String(f))))
    .filter((f) => /\.(t|j)sx?$/.test(f) && /from '[^']*\/lightboxEngine'/.test(read(f)))
    .map((f) => f.split(path.sep).join('/'))
  assert.deepEqual(importers, ['components/Common/Lightbox.tsx'])
  assert.doesNotMatch(code('components/Common/Lightbox.tsx'), /import \{[^}]*\bmotion\b[^}]*\} from 'framer-motion'/)
})

test('article images name their frame and source so the viewer can grow out of the one pressed', () => {
  const figure = code('components/MDX/Figure.tsx')
  assert.match(figure, /data-zoom-src=\{src\}/)
  assert.match(figure, /data-zoom-frame=/)
  assert.match(figure, /zoom\.open\(src, e\.currentTarget\)/)
  const body = code('components/Article/ArticleBody.tsx')
  assert.match(body, /querySelector<HTMLElement>\('\[data-zoom-frame\]'\)/)
})

test('the viewer speaks the article language: zoom labels and keyboard help come from the dictionary', () => {
  const src = code('components/Common/Lightbox.tsx')
  for (const k of ['zoomIn', 'zoomOut', 'zoomLevel', 'viewerKeys', 'closeImageViewer', 'previousImage', 'nextImage']) assert.match(src, new RegExp(`t\\.${k}\\b`), k)
  for (const phrase of ['Zoom in', 'Zoom out', 'Escape: close']) assert.ok(!src.includes(phrase), phrase)
})
