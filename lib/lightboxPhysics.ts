/**
 * Motion physics of the image viewer (components/Common/lightboxEngine.ts,
 * C3): a damped spring, iOS-style momentum that bounces off rubber-banded
 * bounds, and a pointer velocity tracker. Pure, frame-rate independent and
 * free of DOM APIs, so every curve is unit-tested (tests/lightbox-gestures).
 *
 * Units: positions are CSS px (or unitless for a scale / a progress), time
 * is in seconds for the integrators and in milliseconds for the tracker
 * (pointer event time stamps).
 */

export type SpringConfig = { stiffness: number; damping: number; mass?: number }
export type SpringState = { value: number; velocity: number }

/** Paging between images and snapping the strip back: critically damped, no overshoot (ζ ≈ 0.97). */
export const PAGE_SPRING: SpringConfig = { stiffness: 380, damping: 38 }
/** A drag that did not close, a zoom that settles: quick, a hint of give (ζ ≈ 0.89). */
export const SETTLE_SPRING: SpringConfig = { stiffness: 320, damping: 32 }
/** The image growing out of / flying back into its tile (the 300/30 spring of the old shared layout). */
export const MORPH_SPRING: SpringConfig = { stiffness: 300, damping: 30 }
/** Momentum that ran past an edge of a zoomed image: the bounce back. */
export const BOUNCE_SPRING: SpringConfig = { stiffness: 240, damping: 30 }

/** Longest integration step: keeps the stiffest spring above stable at any frame rate. */
const MAX_STEP = 1 / 240
/** A frame gap longer than this (a background tab) is treated as this long. */
const MAX_FRAME = 0.064

/** Advances a spring towards `target` by `dt` seconds (semi-implicit Euler, sub-stepped). */
export function stepSpring(state: SpringState, target: number, config: SpringConfig, dt: number): SpringState {
  const mass = config.mass ?? 1
  let { value, velocity } = state
  let remaining = Math.min(Math.max(dt, 0), MAX_FRAME)
  while (remaining > 1e-9) {
    const h = Math.min(MAX_STEP, remaining)
    const force = -config.stiffness * (value - target) - config.damping * velocity
    velocity += (force / mass) * h
    value += velocity * h
    remaining -= h
  }
  return { value, velocity }
}

/**
 * True once a spring is visually at rest: within `precision` of the target
 * and slower than ten `precision`s per second. Use 0.5 for px, 0.001 for a
 * scale or a progress.
 */
export function springSettled(state: SpringState, target: number, precision: number): boolean {
  return Math.abs(state.value - target) <= precision && Math.abs(state.velocity) <= precision * 10
}

/**
 * How long momentum takes to fade (the time constant of the exponential
 * decay, in seconds): close to UIScrollView's normal deceleration.
 */
export const MOMENTUM_TIME_CONSTANT = 0.325

/** Momentum below this speed (px/s) has stopped. */
export const MOMENTUM_REST_SPEED = 12

/** Free momentum: velocity decays exponentially, position follows its exact integral. */
export function stepDecay(state: SpringState, dt: number, timeConstant = MOMENTUM_TIME_CONSTANT): SpringState {
  const step = Math.min(Math.max(dt, 0), MAX_FRAME)
  const k = Math.exp(-step / timeConstant)
  return { value: state.value + state.velocity * timeConstant * (1 - k), velocity: state.velocity * k }
}

export type Bounds = { min: number; max: number }

/**
 * One frame of momentum inside `bounds`: free decay while inside; once past
 * an edge, a spring pulls it back to that edge (overshoot, then return —
 * the iOS bounce). Returns the new state and whether it has come to rest.
 */
export function stepMomentum(state: SpringState, bounds: Bounds, dt: number): { state: SpringState; done: boolean } {
  const lo = Math.min(bounds.min, bounds.max)
  const hi = Math.max(bounds.min, bounds.max)
  if (state.value < lo || state.value > hi) {
    const edge = state.value < lo ? lo : hi
    const next = stepSpring(state, edge, BOUNCE_SPRING, dt)
    if (springSettled(next, edge, 0.5)) return { state: { value: edge, velocity: 0 }, done: true }
    return { state: next, done: false }
  }
  const next = stepDecay(state, dt)
  if (Math.abs(next.velocity) < MOMENTUM_REST_SPEED && next.value >= lo && next.value <= hi) {
    return { state: { value: next.value, velocity: 0 }, done: true }
  }
  return { state: next, done: false }
}

/** Where momentum released at `velocity` would come to rest without bounds (for tests and previews). */
export function momentumRestingPoint(value: number, velocity: number, timeConstant = MOMENTUM_TIME_CONSTANT): number {
  return value + velocity * timeConstant
}

type Sample = { t: number; x: number; y: number }

/** Samples older than this (ms) before the latest one no longer count. */
const VELOCITY_WINDOW_MS = 100
/** A pointer held still this long (ms) before lifting has no velocity. */
const VELOCITY_STALE_MS = 60

/**
 * Release velocity of a pointer, in px/s: the slope over the last ~100 ms of
 * movement (least squares, so one jittery sample does not decide a flick),
 * zero when the pointer rested before lifting.
 */
export class VelocityTracker {
  private samples: Sample[] = []

  reset(t: number, x: number, y: number): void {
    this.samples = [{ t, x, y }]
  }

  add(t: number, x: number, y: number): void {
    const last = this.samples[this.samples.length - 1]
    if (last && t < last.t) this.samples = []
    if (last && t === last.t) this.samples.pop()
    this.samples.push({ t, x, y })
    const cutoff = t - VELOCITY_WINDOW_MS * 2
    while (this.samples.length > 2 && this.samples[0].t < cutoff) this.samples.shift()
  }

  velocity(now?: number): { x: number; y: number } {
    const last = this.samples[this.samples.length - 1]
    if (!last || this.samples.length < 2) return { x: 0, y: 0 }
    if (now !== undefined && now - last.t > VELOCITY_STALE_MS) return { x: 0, y: 0 }
    const recent = this.samples.filter((s) => s.t >= last.t - VELOCITY_WINDOW_MS)
    if (recent.length < 2) return { x: 0, y: 0 }
    const n = recent.length
    const meanT = recent.reduce((a, s) => a + s.t, 0) / n
    const meanX = recent.reduce((a, s) => a + s.x, 0) / n
    const meanY = recent.reduce((a, s) => a + s.y, 0) / n
    let stt = 0
    let stx = 0
    let sty = 0
    for (const s of recent) {
      const dt = s.t - meanT
      stt += dt * dt
      stx += dt * (s.x - meanX)
      sty += dt * (s.y - meanY)
    }
    if (stt < 1e-6) return { x: 0, y: 0 }
    return { x: (stx / stt) * 1000, y: (sty / stt) * 1000 }
  }
}
