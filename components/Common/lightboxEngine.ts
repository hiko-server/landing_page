import {
  IDENTITY,
  MAX_SCALE,
  MIN_SCALE,
  NO_CLIP,
  PINCH_CLOSE_SCALE,
  SLIDE_GAP,
  DOUBLE_TAP_MS,
  DOUBLE_TAP_SLOP,
  backdropOpacity,
  canZoomIn,
  clampView,
  clipPathOf,
  dismissProgress,
  dismissScale,
  distance,
  fittedRect,
  intersect,
  isZoomed,
  lerpPose,
  lockAxis,
  midpoint,
  morphPose,
  nativeScale,
  pageDecision,
  panBounds,
  panWithOverflow,
  pinchCloseProgress,
  pinchRawScale,
  pinchView,
  resist,
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
  wrapIndex,
  zoomInScale,
  zoomTo,
  type Base,
  type Box,
  type MorphPose,
  type PinchStart,
  type Point,
  type Rect,
  type ViewTransform,
} from '../../lib/lightboxGestures'
import {
  MORPH_SPRING,
  PAGE_SPRING,
  SETTLE_SPRING,
  VelocityTracker,
  springSettled,
  stepMomentum,
  stepSpring,
  type SpringConfig,
  type SpringState,
} from '../../lib/lightboxPhysics'

/**
 * The image viewer's gesture and motion engine (C3), driven by Pointer
 * Events and one requestAnimationFrame loop. It writes transforms straight
 * to the DOM — no React render per frame, transform and opacity only — and
 * leaves the maths to lib/lightboxGestures.ts and lib/lightboxPhysics.ts.
 *
 *   stage (touch-action: none: every touch gesture on the image is ours)
 *   └ track            translateX: the strip of images while swiping
 *     └ slide × ≤ 3     previous, current, next (positioned by the engine)
 *       └ layer         translate + scale: zoom / pan, drag to close, morph
 *         └ frame       the picture (clip-path while it morphs)
 *
 * Gestures: one finger (or the mouse) drags — sideways it pages with a
 * spring, up or down it follows the finger and closes past a threshold or a
 * flick; when zoomed it pans with momentum and runs into the next image at
 * an edge. Two fingers pinch (1–4×, rubber band past both ends; pinching a
 * fitted image small closes it). A double tap or a click zooms at that
 * point — as far as the source has pixels for (one file pixel per CSS
 * pixel, PhotoSwipe's 1:1); an image already shown at its full size offers
 * no such zoom (a click on it closes, like a click beside it), while pinch,
 * the wheel and + / − still magnify on purpose. The wheel zooms at the pointer (trackpad pinch included); a
 * sideways trackpad swipe pages. Safari's trackpad pinch arrives as gesture
 * events.
 *
 * Open and close morph between the page's tile and the viewer: the layer
 * starts (or ends) exactly over the tile, cut to the part of the image the
 * tile shows, with its corner radius. Under reduced motion every animation
 * ends at once: gestures still work, nothing glides.
 */

export type SlideElements = { slide: HTMLElement; layer: HTMLElement; frame: HTMLElement }

/** Where an image sits in the page: the whole picture as drawn, the part its tile shows, the tile's corner radius. */
export type OriginSnapshot = { drawn: Rect; shown: Rect; radius: number }

export type EngineHost = {
  stage(): HTMLElement | null
  track(): HTMLElement | null
  overlay(): HTMLElement | null
  /** The dialog: receives the --lb-ui / --lb-caption opacities of the controls and the caption. */
  root(): HTMLElement | null
}

export type EngineCallbacks = {
  /** Show the image `delta` steps away; the engine slides it in once the index has changed (setIndex). */
  step(delta: 1 | -1): void
  /** A gesture asks to close (drag down, pinch small, a tap beside the image). */
  requestClose(): void
  /** The close animation has finished: unmount now. */
  closed(): void
  /** The zoom changed: `settled` once it rests (the zoom button, the high-resolution source, announcements). */
  zoomChange(scale: number, settled: boolean): void
  /** Whether the image on screen has more pixels than it is shown with (a click, a double tap and the zoom button zoom it). */
  zoomableChange?(zoomable: boolean): void
}

/** The viewer frame's own corner radius (px). */
export const FRAME_RADIUS = 8
/** A tile less visible than this cannot be flown back into: the image fades instead. */
const MIN_ORIGIN_VISIBILITY = 0.25
/** Wheel events further apart than this (ms) start a new wheel gesture. */
const WHEEL_GESTURE_GAP = 180
/** Sideways trackpad travel (px) that pages once per gesture. */
const WHEEL_PAGE_PX = 60
/** Longest a close may wait for animation frames (a background tab) before it simply ends. */
const CLOSE_FALLBACK_MS = 900

type Pointer = { x: number; y: number; type: string }

type Gesture =
  | { kind: 'press'; id: number; start: Point; startTrack: number; startView: ViewTransform; startDrag: Point; type: string }
  | { kind: 'swipe'; id: number; start: Point; startTrack: number }
  | { kind: 'dismiss'; id: number; start: Point; startDrag: Point }
  | { kind: 'pan'; id: number; start: Point; startView: ViewTransform; startTrack: number }
  | { kind: 'pinch'; ids: [number, number]; start: PinchStart; fitted: boolean; focal: Point }
  | { kind: 'ignore' }

type SpringAnim = { state: SpringState; target: number; config: SpringConfig }
type ZoomAnim = { from: ViewTransform; to: ViewTransform; p: SpringState }
type MomentumAnim = { x: SpringState; y: SpringState; xDone: boolean; yDone: boolean }
type MorphAnim = {
  kind: 'open' | 'close'
  from: MorphPose
  to: MorphPose
  p: SpringState
  overlay: [number, number]
  ui: [number, number]
  /** Fades the image too (no tile to morph from or into). */
  fade: boolean
  done?: () => void
}

type WheelGesture = { mode: 'zoom' | 'pan' | 'page'; last: number; acc: number; paged: boolean; target: ViewTransform | null }

const restPose = (): MorphPose => ({ x: 0, y: 0, scale: 1, clip: { ...NO_CLIP }, radius: FRAME_RADIUS })

const toRect = (r: DOMRect | { left: number; top: number; width: number; height: number }): Rect => ({
  left: r.left,
  top: r.top,
  width: r.width,
  height: r.height,
})

/**
 * Reads where an image sits in the page: `el` is the box that clips it (a
 * tile, a figure frame) with the <img> inside. `ratio` (width / height)
 * helps when the image has not loaded yet. Null when the box is not laid out.
 */
export function snapshotOrigin(el: HTMLElement | null | undefined, ratio?: number | null): OriginSnapshot | null {
  if (!el || !el.isConnected) return null
  const box = el.getBoundingClientRect()
  if (box.width < 2 || box.height < 2) return null
  const img = el.querySelector('img')
  const imgBox = img ? img.getBoundingClientRect() : box
  let fit: 'cover' | 'contain' | 'fill' = 'fill'
  let natural: number | null = null
  if (img) {
    const f = getComputedStyle(img).objectFit
    fit = f === 'cover' ? 'cover' : f === 'contain' || f === 'scale-down' ? 'contain' : 'fill'
    if (img.naturalWidth > 0 && img.naturalHeight > 0) natural = img.naturalWidth / img.naturalHeight
  }
  const r = ratio && ratio > 0 ? ratio : natural
  const drawn = fit !== 'fill' && r ? fittedRect(toRect(imgBox), r, fit) : toRect(imgBox)
  const shown = intersect(toRect(box), toRect(imgBox))
  if (shown.width < 1 || shown.height < 1) return null
  const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
  return { drawn, shown, radius }
}

/** True when enough of an origin is on screen to fly into. */
export function originVisible(origin: OriginSnapshot | null, viewport: { width: number; height: number }): origin is OriginSnapshot {
  return !!origin && visibleFraction(origin.shown, viewport) >= MIN_ORIGIN_VISIBILITY
}

export class LightboxEngine {
  private readonly host: EngineHost
  private readonly cb: EngineCallbacks
  private attached: HTMLElement | null = null
  private resizeObserver: ResizeObserver | null = null

  private index = 0
  private count = 0
  private reduced = false
  private slides = new Map<number, SlideElements>()
  /** The widest file each image's source offers (px; lightboxGestures sourcePixelWidth). */
  private sourceWidths = new Map<number, number>()
  private zoomableNotified: boolean | null = null

  private width = 0
  private height = 0
  private viewBox: Box = { left: 0, top: 0, right: 0, bottom: 0 }
  private base: Base = { cx: 0, cy: 0, width: 0, height: 0 }

  private trackX = 0
  private side: -1 | 1 = 1
  private view: ViewTransform = { ...IDENTITY }
  private drag: Point = { x: 0, y: 0 }
  /** Zoomed slides on their way out: reset once the strip comes to rest. */
  private outgoing = new Map<number, ViewTransform>()

  private overlay = 1
  private ui = 1
  private layerOpacity = 1
  private closing = false
  /** The close has ended: the last pose is held until the dialog unmounts. */
  private frozen = false

  private trackAnim: SpringAnim | null = null
  private dragAnim: { x: SpringAnim; y: SpringAnim } | null = null
  private zoomAnim: ZoomAnim | null = null
  private momentum: MomentumAnim | null = null
  private morph: MorphAnim | null = null

  private raf = 0
  private lastFrame = 0
  private closeTimer: ReturnType<typeof setTimeout> | null = null
  private pending: { expect: number; shift: number; velocity: number } | null = null

  private pointers = new Map<number, Pointer>()
  private gesture: Gesture | null = null
  private tracker = new VelocityTracker()
  private lastTap: { t: number; x: number; y: number; type: string } | null = null
  private wheel: WheelGesture | null = null
  private safariPinch: { scale: number } | null = null
  private zoomedNotified = false
  private active = false

  constructor(host: EngineHost, callbacks: EngineCallbacks) {
    this.host = host
    this.cb = callbacks
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /** Listens on the stage (call once the dialog is in the DOM). */
  attach(): void {
    const stage = this.host.stage()
    if (!stage || this.attached === stage) return
    this.detach()
    this.attached = stage
    stage.addEventListener('pointerdown', this.onPointerDown)
    stage.addEventListener('pointermove', this.onPointerMove)
    stage.addEventListener('pointerup', this.onPointerUp)
    stage.addEventListener('pointercancel', this.onPointerCancel)
    stage.addEventListener('lostpointercapture', this.onLostCapture)
    stage.addEventListener('wheel', this.onWheel, { passive: false })
    stage.addEventListener('dragstart', this.preventDefault)
    // Safari (macOS trackpad pinch; iOS sends them alongside pointer events).
    stage.addEventListener('gesturestart', this.onGestureStart as EventListener)
    stage.addEventListener('gesturechange', this.onGestureChange as EventListener)
    stage.addEventListener('gestureend', this.onGestureEnd as EventListener)
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.onResize())
      this.resizeObserver.observe(stage)
    }
    this.closing = false
    this.measure()
  }

  detach(): void {
    const stage = this.attached
    if (stage) {
      stage.removeEventListener('pointerdown', this.onPointerDown)
      stage.removeEventListener('pointermove', this.onPointerMove)
      stage.removeEventListener('pointerup', this.onPointerUp)
      stage.removeEventListener('pointercancel', this.onPointerCancel)
      stage.removeEventListener('lostpointercapture', this.onLostCapture)
      stage.removeEventListener('wheel', this.onWheel)
      stage.removeEventListener('dragstart', this.preventDefault)
      stage.removeEventListener('gesturestart', this.onGestureStart as EventListener)
      stage.removeEventListener('gesturechange', this.onGestureChange as EventListener)
      stage.removeEventListener('gestureend', this.onGestureEnd as EventListener)
    }
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.attached = null
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.lastFrame = 0
    if (this.closeTimer) clearTimeout(this.closeTimer)
    this.closeTimer = null
    this.pointers.clear()
    this.gesture = null
    this.trackAnim = this.dragAnim = this.zoomAnim = this.momentum = this.morph = null
    this.pending = null
    this.trackX = 0
    this.view = { ...IDENTITY }
    this.drag = { x: 0, y: 0 }
    this.outgoing.clear()
    this.overlay = 1
    this.ui = 1
    this.layerOpacity = 1
    this.wheel = null
    this.safariPinch = null
    this.lastTap = null
    this.zoomedNotified = false
    this.zoomableNotified = null
    this.active = false
    this.closing = false
    this.frozen = false
    if (this.wheelTimer) clearTimeout(this.wheelTimer)
    this.wheelTimer = null
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced
  }

  setCount(count: number): void {
    this.count = count
  }

  registerSlide(index: number, els: SlideElements | null): void {
    if (els) this.slides.set(index, els)
    else this.slides.delete(index)
    this.render()
  }

  /** How many pixels wide image `index`'s largest file is (0: unknown); a one-shot zoom stops there. */
  setSourceWidth(index: number, width: number): void {
    if ((this.sourceWidths.get(index) ?? 0) === width) return
    if (width > 0) this.sourceWidths.set(index, width)
    else this.sourceWidths.delete(index)
    if (index !== this.index || !this.attached) return
    this.measure()
    this.render()
  }

  /**
   * The index after React committed it. When it is the step this engine
   * asked for, the strip keeps its visual position and springs to rest
   * (continuing the swipe's velocity); any other change simply shows it.
   */
  setIndex(index: number): void {
    if (index === this.index) {
      this.render()
      return
    }
    const previous = this.index
    if (isZoomed(this.view) || this.drag.x || this.drag.y) {
      this.outgoing.set(previous, { x: this.view.x + this.drag.x, y: this.view.y + this.drag.y, scale: this.view.scale })
    }
    this.index = index
    this.view = { ...IDENTITY }
    this.drag = { x: 0, y: 0 }
    this.zoomAnim = this.momentum = this.dragAnim = null
    this.gesture = this.gesture && this.gesture.kind !== 'ignore' ? { kind: 'ignore' } : this.gesture
    this.notifyZoom(true)
    const pending = this.pending
    this.pending = null
    if (pending && pending.expect === index && !this.reduced) {
      const unit = this.width + SLIDE_GAP
      this.trackX = Math.max(-unit, Math.min(unit, this.trackX + pending.shift))
      this.side = this.trackX > 0 ? -1 : 1
      this.animateTrack(pending.velocity)
    } else {
      this.trackX = 0
      this.trackAnim = null
      this.outgoing.clear()
    }
    this.measure()
    this.render()
  }

  isZoomed(): boolean {
    return isZoomed(this.view)
  }

  isClosing(): boolean {
    return this.closing
  }

  /**
   * Opens from `origin` (the tile, when it is on screen): the image grows
   * out of it while the backdrop and the controls fade in. Without an origin
   * the image fades and settles in place.
   */
  open(origin: OriginSnapshot | null): void {
    this.closing = false
    this.frozen = false
    this.measure()
    if (this.reduced) {
      this.overlay = 1
      this.ui = 1
      this.layerOpacity = 1
      this.morph = null
      this.render()
      return
    }
    const rest = restPose()
    const target = this.baseRect()
    const viewport = { width: this.width, height: this.height }
    const from: MorphPose = originVisible(origin, viewport) && target.width > 0 ? morphPose(target, origin.drawn, origin.shown, origin.radius) : { ...rest, y: 12, scale: 0.96 }
    const fade = !(originVisible(origin, viewport) && target.width > 0)
    this.morph = { kind: 'open', from, to: rest, p: { value: 0, velocity: 0 }, overlay: [0, 1], ui: [0, 1], fade }
    this.setActive(true)
    this.render()
    this.schedule()
  }

  /**
   * Closes into `origin` (the tile of the image on screen, when visible):
   * from wherever the image is — dragged, pinched, zoomed — it flies back
   * into the tile while the backdrop fades. Without one it fades (carried on
   * in the direction of a drag). `closed` fires at the end.
   */
  close(origin: OriginSnapshot | null): void {
    if (this.closing) return
    this.closing = true
    this.gesture = null
    for (const id of this.pointers.keys()) this.releaseCapture(id)
    this.pointers.clear()
    if (this.reduced || !this.attached) {
      this.finishClose()
      return
    }
    this.measure()
    const progress = Math.max(dismissProgress(this.drag.y, this.height), this.view.scale < 1 ? pinchCloseProgress(this.view.scale) : 0)
    const current = this.morph ? lerpPose(this.morph.from, this.morph.to, this.morph.p.value) : null
    const from: MorphPose = current
      ? { ...current }
      : {
          x: this.view.x + this.drag.x + this.trackX,
          y: this.view.y + this.drag.y,
          scale: this.view.scale * dismissScale(dismissProgress(this.drag.y, this.height)),
          clip: { ...NO_CLIP },
          radius: FRAME_RADIUS,
        }
    const overlayFrom = this.morph ? this.overlay : backdropOpacity(progress)
    const uiFrom = this.morph ? this.ui : 1 - progress
    const viewport = { width: this.width, height: this.height }
    let to: MorphPose
    let fade = false
    if (originVisible(origin, viewport)) {
      to = morphPose(this.baseRect(), origin.drawn, origin.shown, origin.radius)
    } else {
      fade = true
      const dir = Math.sign(this.drag.y)
      to = dir ? { ...from, y: from.y + dir * this.height * 0.5, scale: from.scale * 0.9 } : { ...from, scale: from.scale * 0.92 }
    }
    this.trackX = 0
    this.trackAnim = this.dragAnim = this.zoomAnim = this.momentum = null
    this.view = { ...IDENTITY }
    this.drag = { x: 0, y: 0 }
    this.morph = { kind: 'close', from, to, p: { value: 0, velocity: 0 }, overlay: [overlayFrom, 0], ui: [uiFrom, 0], fade, done: () => this.finishClose() }
    this.setActive(true)
    this.render()
    this.schedule()
    this.closeTimer = setTimeout(() => this.finishClose(), CLOSE_FALLBACK_MS)
  }

  /** Previous / next from a key or a button: slides like a swipe (instantly under reduced motion). */
  page(delta: 1 | -1): void {
    if (this.closing || this.count < 2) return
    this.finishOpen()
    if (this.reduced) {
      this.cb.step(delta)
      return
    }
    this.requestStep(delta, 0)
  }

  /** The zoom button: zoom in on the centre of the image (as far as its source allows), or back out. */
  toggleZoom(): void {
    if (this.closing) return
    this.finishOpen()
    this.measure()
    if (isZoomed(this.view)) {
      this.animateZoom({ ...IDENTITY })
      return
    }
    const native = this.nativeScale()
    if (!canZoomIn(native)) return
    const focal = { x: this.base.cx + this.view.x, y: this.base.cy + this.view.y }
    this.animateZoom(clampView(zoomTo(this.view, zoomInScale(this.base, this.viewBox, native), focal, this.base, this.viewBox), this.base, this.viewBox))
  }

  /** `+` / `−`: one zoom step around the middle of the stage. */
  zoomStep(direction: 1 | -1): void {
    if (this.closing) return
    this.finishOpen()
    this.measure()
    const from = this.zoomAnim ? this.zoomAnim.to : this.view
    this.animateZoom(stepZoom(from, direction, this.stageCenter(), this.base, this.viewBox))
  }

  /** `0`: back to fitted. */
  resetZoom(): void {
    if (this.closing) return
    this.animateZoom({ ...IDENTITY })
  }

  /** Arrow keys on a zoomed image: pan by a sixth of the stage. */
  panBy(dx: number, dy: number): void {
    if (this.closing || !isZoomed(this.view)) return
    this.measure()
    const from = this.zoomAnim ? this.zoomAnim.to : this.view
    this.animateZoom(clampView({ ...from, x: from.x + dx * this.width, y: from.y + dy * this.height }, this.base, this.viewBox))
  }

  // ── Geometry ─────────────────────────────────────────────────────────────

  private measure(): void {
    const stage = this.host.stage()
    if (!stage) return
    const r = stage.getBoundingClientRect()
    this.width = r.width
    this.height = r.height
    this.viewBox = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    const els = this.slides.get(this.index)
    if (!els) return
    const w = els.layer.offsetWidth
    const h = els.layer.offsetHeight
    this.base = { cx: r.left + els.layer.offsetLeft + w / 2, cy: r.top + els.layer.offsetTop + h / 2, width: w, height: h }
    const zoomable = canZoomIn(this.nativeScale())
    if (zoomable !== this.zoomableNotified) {
      this.zoomableNotified = zoomable
      this.cb.zoomableChange?.(zoomable)
    }
  }

  /** The zoom at which the image on screen shows its source 1:1 (Infinity when its width is unknown). */
  private nativeScale(): number {
    return nativeScale(this.sourceWidths.get(this.index) ?? 0, this.base)
  }

  private baseRect(): Rect {
    const b = this.base
    return { left: b.cx - b.width / 2, top: b.cy - b.height / 2, width: b.width, height: b.height }
  }

  private stageCenter(): Point {
    return { x: (this.viewBox.left + this.viewBox.right) / 2, y: (this.viewBox.top + this.viewBox.bottom) / 2 }
  }

  /** Whether a point is on the image as drawn now. */
  private onImage(p: Point): boolean {
    const b = this.base
    const s = this.view.scale
    const cx = b.cx + this.view.x + this.drag.x
    const cy = b.cy + this.view.y + this.drag.y
    return Math.abs(p.x - cx) <= (b.width * s) / 2 && Math.abs(p.y - cy) <= (b.height * s) / 2
  }

  /** The stage changed size (rotation, a resized window): everything is re-fitted and kept in bounds. */
  private onResize(): void {
    const { width, height } = this
    this.measure()
    if (width === this.width && height === this.height) return
    if (this.zoomAnim) this.zoomAnim.to = clampView(this.zoomAnim.to, this.base, this.viewBox)
    else if (!this.gesture && !this.morph) {
      this.momentum = null
      this.view = isZoomed(this.view) ? clampView(this.view, this.base, this.viewBox) : { ...IDENTITY }
    }
    this.render()
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  private render(): void {
    if (this.frozen || !this.attached) return
    const track = this.host.track()
    if (track) track.style.transform = `translate3d(${Math.round(this.trackX * 100) / 100}px, 0, 0)`
    const unit = this.width + SLIDE_GAP
    const morphPoseNow = this.morph ? lerpPose(this.morph.from, this.morph.to, this.morph.p.value) : null
    for (const [i, els] of this.slides) {
      const offset = slideOffset(i, this.index, this.count, this.side)
      els.slide.style.transform = `translate3d(${offset * unit}px, 0, 0)`
      els.layer.style.willChange = this.active && i === this.index ? 'transform' : ''
      if (i === this.index) {
        if (morphPoseNow) {
          els.layer.style.transform = transformOf(morphPoseNow.x, morphPoseNow.y, morphPoseNow.scale)
          els.frame.style.clipPath = clipPathOf(morphPoseNow)
          els.layer.style.opacity = this.morph!.fade ? String(this.morphFade()) : ''
        } else {
          const s = this.view.scale * dismissScale(dismissProgress(this.drag.y, this.height))
          els.layer.style.transform = transformOf(this.view.x + this.drag.x, this.view.y + this.drag.y, s)
          els.frame.style.clipPath = ''
          els.layer.style.opacity = this.layerOpacity === 1 ? '' : String(this.layerOpacity)
        }
      } else {
        const t = this.outgoing.get(i)
        els.layer.style.transform = t ? transformOf(t.x, t.y, t.scale) : ''
        els.frame.style.clipPath = ''
        els.layer.style.opacity = ''
      }
    }
    const overlay = this.host.overlay()
    if (overlay) overlay.style.opacity = String(Math.round(this.currentOverlay() * 1000) / 1000)
    const root = this.host.root()
    if (root) {
      const ui = Math.round(this.currentUi() * 1000) / 1000
      root.style.setProperty('--lb-ui', String(ui))
      root.style.setProperty('--lb-caption', String(isZoomed(this.view) ? 0 : ui))
    }
    const stage = this.host.stage()
    if (stage) {
      stage.dataset.zoomed = isZoomed(this.view) ? 'true' : 'false'
      stage.dataset.zoomable = canZoomIn(this.nativeScale()) ? 'true' : 'false'
    }
  }

  private morphFade(): number {
    const m = this.morph
    if (!m) return 1
    const p = Math.min(1, Math.max(0, m.p.value))
    return m.kind === 'open' ? p : 1 - p
  }

  private currentOverlay(): number {
    const m = this.morph
    if (m) return Math.min(1, Math.max(0, m.overlay[0] + (m.overlay[1] - m.overlay[0]) * Math.min(1, m.p.value)))
    const progress = Math.max(dismissProgress(this.drag.y, this.height), pinchCloseProgress(this.view.scale))
    return backdropOpacity(progress)
  }

  private currentUi(): number {
    const m = this.morph
    if (m) {
      // The controls follow the second half of an open, the first half of a close.
      const p = Math.min(1, Math.max(0, m.p.value))
      const q = m.kind === 'open' ? Math.max(0, (p - 0.4) / 0.6) : Math.min(1, p / 0.5)
      return m.ui[0] + (m.ui[1] - m.ui[0]) * q
    }
    const progress = Math.max(dismissProgress(this.drag.y, this.height), pinchCloseProgress(this.view.scale))
    return 1 - progress
  }

  /** While something moves, the moving layers are promoted (and dropped again at rest, so a zoomed image re-rasterizes sharp). */
  private setActive(on: boolean): void {
    if (this.active === on) return
    this.active = on
    const track = this.host.track()
    if (track) track.style.willChange = on ? 'transform' : ''
    const els = this.slides.get(this.index)
    if (els) els.layer.style.willChange = on ? 'transform' : ''
    const stage = this.host.stage()
    if (stage) stage.dataset.motion = on ? 'active' : 'idle'
    // (render() keeps the promotion on whichever image is current.)
  }

  private schedule(): void {
    if (!this.raf) this.raf = requestAnimationFrame(this.tick)
  }

  // ── Animation loop ───────────────────────────────────────────────────────

  private readonly tick = (now: number): void => {
    this.raf = 0
    const dt = this.lastFrame ? Math.min(0.064, Math.max(0, (now - this.lastFrame) / 1000)) : 1 / 60
    this.lastFrame = now

    if (this.trackAnim) {
      const a = this.trackAnim
      a.state = stepSpring(a.state, a.target, a.config, dt)
      this.trackX = a.state.value
      if (this.trackX > 0.5) this.side = -1
      else if (this.trackX < -0.5) this.side = 1
      if (springSettled(a.state, a.target, 0.5)) {
        this.trackX = a.target
        this.trackAnim = null
        if (a.target === 0) this.outgoing.clear()
      }
    }
    if (this.dragAnim) {
      const { x, y } = this.dragAnim
      x.state = stepSpring(x.state, 0, x.config, dt)
      y.state = stepSpring(y.state, 0, y.config, dt)
      this.drag = { x: x.state.value, y: y.state.value }
      if (springSettled(x.state, 0, 0.5) && springSettled(y.state, 0, 0.5)) {
        this.drag = { x: 0, y: 0 }
        this.dragAnim = null
      }
    }
    if (this.zoomAnim) {
      const z = this.zoomAnim
      z.p = stepSpring(z.p, 1, SETTLE_SPRING, dt)
      const p = z.p.value
      this.view = { x: z.from.x + (z.to.x - z.from.x) * p, y: z.from.y + (z.to.y - z.from.y) * p, scale: z.from.scale + (z.to.scale - z.from.scale) * p }
      if (springSettled(z.p, 1, 0.001)) {
        this.view = { ...z.to }
        this.zoomAnim = null
        this.notifyZoom(true)
      } else this.notifyZoom(false)
    }
    if (this.momentum) {
      const m = this.momentum
      const b = panBounds(this.base, this.view.scale, this.viewBox)
      if (!m.xDone) {
        const r = stepMomentum(m.x, { min: b.minX, max: b.maxX }, dt)
        m.x = r.state
        m.xDone = r.done
      }
      if (!m.yDone) {
        const r = stepMomentum(m.y, { min: b.minY, max: b.maxY }, dt)
        m.y = r.state
        m.yDone = r.done
      }
      this.view = { ...this.view, x: m.x.value, y: m.y.value }
      if (m.xDone && m.yDone) this.momentum = null
    }
    if (this.morph) {
      const m = this.morph
      m.p = stepSpring(m.p, 1, MORPH_SPRING, dt)
      if (springSettled(m.p, 1, 0.002)) {
        m.p = { value: 1, velocity: 0 }
        if (m.kind === 'close') {
          m.done?.()
          return
        }
        this.morph = null
        this.overlay = 1
        this.ui = 1
        this.layerOpacity = 1
      }
    }

    this.render()
    if (this.trackAnim || this.dragAnim || this.zoomAnim || this.momentum || this.morph) {
      this.schedule()
    } else {
      this.lastFrame = 0
      if (!this.pointers.size) this.setActive(false)
    }
  }

  private finishOpen(): void {
    if (!this.morph || this.morph.kind !== 'open') return
    this.morph = null
    this.overlay = 1
    this.ui = 1
    this.layerOpacity = 1
    this.render()
  }

  private finishClose(): void {
    if (this.closeTimer) clearTimeout(this.closeTimer)
    this.closeTimer = null
    if (!this.closing || this.frozen) return
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    const m = this.morph
    if (m) {
      m.p = { value: 1, velocity: 0 }
      this.render()
    } else {
      // Reduced motion: nothing flies; the dialog simply goes.
      this.overlay = 0
    }
    // The last pose stays on screen, untouched, until the dialog unmounts
    // (a moment later): no resize or unregistering slide may repaint it.
    this.frozen = true
    this.morph = null
    this.cb.closed()
  }

  private animateTrack(velocity: number): void {
    if (this.reduced) {
      this.trackX = 0
      this.trackAnim = null
      this.outgoing.clear()
      this.render()
      return
    }
    this.trackAnim = { state: { value: this.trackX, velocity }, target: 0, config: PAGE_SPRING }
    this.setActive(true)
    this.schedule()
  }

  private animateDragBack(v: Point): void {
    if (this.reduced) {
      this.drag = { x: 0, y: 0 }
      this.render()
      return
    }
    this.dragAnim = {
      x: { state: { value: this.drag.x, velocity: v.x }, target: 0, config: SETTLE_SPRING },
      y: { state: { value: this.drag.y, velocity: v.y }, target: 0, config: SETTLE_SPRING },
    }
    this.setActive(true)
    this.schedule()
  }

  private animateZoom(to: ViewTransform): void {
    this.momentum = null
    if (this.reduced) {
      this.zoomAnim = null
      this.view = { ...to }
      this.render()
      this.notifyZoom(true)
      return
    }
    this.zoomAnim = { from: { ...this.view }, to, p: { value: 0, velocity: 0 } }
    this.setActive(true)
    this.schedule()
  }

  private startMomentum(v: Point): void {
    if (this.reduced) {
      this.view = clampView(this.view, this.base, this.viewBox)
      this.render()
      this.notifyZoom(true)
      return
    }
    this.momentum = { x: { value: this.view.x, velocity: v.x }, y: { value: this.view.y, velocity: v.y }, xDone: false, yDone: false }
    this.setActive(true)
    this.schedule()
  }

  private notifyZoom(settled: boolean): void {
    const zoomed = isZoomed(this.view)
    if (settled || zoomed !== this.zoomedNotified) {
      this.zoomedNotified = zoomed
      this.cb.zoomChange(this.view.scale, settled)
    }
  }

  private requestStep(delta: 1 | -1, velocity: number): void {
    this.pending = { expect: wrapIndex(this.index, delta, this.count), shift: delta * (this.width + SLIDE_GAP), velocity }
    this.cb.step(delta)
    // A parent that did not take the step: the strip goes back.
    if (this.pending) {
      const expected = this.pending.expect
      setTimeout(() => {
        if (this.pending && this.pending.expect === expected) {
          this.pending = null
          this.animateTrack(0)
        }
      }, 120)
    }
  }

  private releaseTrack(vx: number): void {
    const delta = this.count > 1 ? pageDecision(this.trackX, vx, this.width) : 0
    if (delta) this.requestStep(delta, vx)
    else this.animateTrack(vx)
  }

  // ── Pointer input ────────────────────────────────────────────────────────

  private readonly preventDefault = (e: Event): void => {
    e.preventDefault()
  }

  private releaseCapture(id: number): void {
    const stage = this.attached
    try {
      if (stage?.hasPointerCapture?.(id)) stage.releasePointerCapture(id)
    } catch {
      // Already released.
    }
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.closing) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (!this.slides.get(this.index)) return
    this.finishOpen()
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType })
    try {
      this.attached?.setPointerCapture(e.pointerId)
    } catch {
      // A pointer that is already gone.
    }
    if (this.pointers.size === 1) {
      // Catch whatever glides: the finger holds it where it is. A zoom
      // animation runs on until the press turns into a drag (the second
      // click of a double click must not stop the zoom of the first).
      this.momentum = null
      this.dragAnim = null
      this.trackAnim = null
      this.measure()
      this.tracker.reset(e.timeStamp, e.clientX, e.clientY)
      this.gesture = {
        kind: 'press',
        id: e.pointerId,
        start: { x: e.clientX, y: e.clientY },
        startTrack: this.trackX,
        startView: { ...this.view },
        startDrag: { ...this.drag },
        type: e.pointerType,
      }
      this.setActive(true)
    } else if (this.pointers.size === 2 && e.pointerType !== 'mouse') {
      this.startPinch(e.timeStamp)
    }
  }

  private startPinch(t: number): void {
    const ids = Array.from(this.pointers.keys()).slice(0, 2) as [number, number]
    const a = this.pointers.get(ids[0])!
    const b = this.pointers.get(ids[1])!
    // A swipe or a drag in progress gives way: the strip and the drag spring back meanwhile.
    if (this.trackX) this.animateTrack(0)
    if (this.drag.x || this.drag.y) this.animateDragBack({ x: 0, y: 0 })
    this.zoomAnim = null
    this.momentum = null
    this.measure()
    const focal = midpoint(a, b)
    this.tracker.reset(t, focal.x, focal.y)
    this.gesture = { kind: 'pinch', ids, start: { view: { ...this.view }, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } }, fitted: !isZoomed(this.view), focal }
    this.attached?.setAttribute('data-drag', 'true')
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId)
    if (!p || this.closing) return
    p.x = e.clientX
    p.y = e.clientY
    const g = this.gesture
    if (!g || g.kind === 'ignore') return

    if (g.kind === 'pinch') {
      const a = this.pointers.get(g.ids[0])
      const b = this.pointers.get(g.ids[1])
      if (!a || !b) return
      g.focal = midpoint(a, b)
      this.tracker.add(e.timeStamp, g.focal.x, g.focal.y)
      this.view = pinchView(g.start, a, b, this.base, this.viewBox)
      this.notifyZoom(false)
      this.schedule()
      return
    }
    if (e.pointerId !== g.id) return
    this.tracker.add(e.timeStamp, e.clientX, e.clientY)
    let dx = e.clientX - g.start.x
    let dy = e.clientY - g.start.y

    let current: Gesture = g
    if (g.kind === 'press') {
      const axis = lockAxis(dx, dy)
      if (!axis) return
      if (this.zoomAnim) {
        // The drag takes over a zoom that was still gliding, from where it is.
        this.zoomAnim = null
        g.startView = { ...this.view }
        g.start = { x: e.clientX, y: e.clientY }
        dx = 0
        dy = 0
        this.notifyZoom(true)
      }
      if (isZoomed(this.view)) current = { kind: 'pan', id: g.id, start: g.start, startView: g.startView, startTrack: g.startTrack }
      else if (axis === 'x') current = { kind: 'swipe', id: g.id, start: g.start, startTrack: g.startTrack }
      else current = { kind: 'dismiss', id: g.id, start: g.start, startDrag: g.startDrag }
      if (current.kind === 'dismiss' && this.trackX) this.animateTrack(0)
      this.gesture = current
      this.attached?.setAttribute('data-drag', 'true')
    }

    if (current.kind === 'swipe') {
      const raw = current.startTrack + dx
      this.trackX = this.count > 1 ? raw : Math.sign(raw) * rubberband(Math.abs(raw), this.width)
      if (this.trackX > 0.5) this.side = -1
      else if (this.trackX < -0.5) this.side = 1
    } else if (current.kind === 'dismiss') {
      this.drag = { x: current.startDrag.x + dx, y: current.startDrag.y + dy }
    } else if (current.kind === 'pan') {
      const b = panBounds(this.base, this.view.scale, this.viewBox)
      const { x, overflow } = panWithOverflow(current.startView.x + current.startTrack + dx, b.minX, b.maxX)
      this.trackX = this.count > 1 ? overflow : Math.sign(overflow) * rubberband(Math.abs(overflow), this.width)
      if (this.trackX > 0.5) this.side = -1
      else if (this.trackX < -0.5) this.side = 1
      this.view = { ...this.view, x, y: resist(current.startView.y + dy, b.minY, b.maxY, this.height) }
    }
    this.schedule()
  }

  private readonly onPointerUp = (e: PointerEvent): void => this.endPointer(e, false)
  private readonly onPointerCancel = (e: PointerEvent): void => this.endPointer(e, true)
  private readonly onLostCapture = (e: PointerEvent): void => {
    if (this.pointers.has(e.pointerId)) this.endPointer(e, true)
  }

  private endPointer(e: PointerEvent, cancelled: boolean): void {
    if (!this.pointers.delete(e.pointerId)) return
    this.releaseCapture(e.pointerId)
    const g = this.gesture
    if (!this.pointers.size) this.attached?.removeAttribute('data-drag')
    if (!g || this.closing) return

    if (g.kind === 'pinch') {
      if (!g.ids.includes(e.pointerId)) return
      const remainingId = g.ids.find((id) => id !== e.pointerId)
      const remaining = remainingId !== undefined ? this.pointers.get(remainingId) : undefined
      const a = this.pointers.get(g.ids[0]) ?? (e.pointerId === g.ids[0] ? { x: e.clientX, y: e.clientY } : null)
      const b = this.pointers.get(g.ids[1]) ?? (e.pointerId === g.ids[1] ? { x: e.clientX, y: e.clientY } : null)
      const raw = a && b ? pinchRawScale(g.start, a, b) : this.view.scale
      if (!cancelled && g.fitted && raw < PINCH_CLOSE_SCALE) {
        this.gesture = remaining ? { kind: 'ignore' } : null
        this.cb.requestClose()
        return
      }
      if (remaining && remainingId !== undefined && this.view.scale > 1.01 && this.view.scale <= MAX_SCALE) {
        // Keep panning with the finger still down.
        this.tracker.reset(e.timeStamp, remaining.x, remaining.y)
        this.gesture = { kind: 'pan', id: remainingId, start: { x: remaining.x, y: remaining.y }, startView: { ...this.view }, startTrack: this.trackX }
        return
      }
      this.gesture = remaining ? { kind: 'ignore' } : null
      this.animateZoom(settleView(this.view, g.focal, this.base, this.viewBox))
      return
    }
    if (g.kind === 'ignore') {
      if (!this.pointers.size) this.gesture = null
      return
    }
    if (e.pointerId !== g.id) return
    this.gesture = this.pointers.size ? { kind: 'ignore' } : null
    const v = cancelled ? { x: 0, y: 0 } : this.tracker.velocity(e.timeStamp)

    switch (g.kind) {
      case 'press':
        // A tap on something caught mid-glide: let it finish settling.
        if (this.trackX) this.animateTrack(0)
        if (this.drag.x || this.drag.y) this.animateDragBack({ x: 0, y: 0 })
        if (!this.zoomAnim) {
          const settled = clampView(this.view, this.base, this.viewBox)
          if (isZoomed(this.view) && (settled.x !== this.view.x || settled.y !== this.view.y)) this.animateZoom(settled)
        }
        if (!cancelled) this.tap(e, g.type)
        break
      case 'swipe':
        this.releaseTrack(v.x)
        break
      case 'dismiss':
        if (!cancelled && shouldDismiss(this.drag.y, v.y)) this.cb.requestClose()
        else this.animateDragBack(v)
        break
      case 'pan':
        if (this.trackX) {
          this.releaseTrack(v.x)
          this.startMomentum({ x: 0, y: v.y })
        } else this.startMomentum(v)
        break
    }
    if (!this.trackAnim && !this.dragAnim && !this.zoomAnim && !this.momentum && !this.morph && !this.pointers.size) this.setActive(false)
  }

  /**
   * A tap. Mouse: a click on the image zooms in at that point (or back out);
   * the second click of a double click is the same action, so it is not
   * counted twice; a click beside the image closes (zooms out when zoomed),
   * and so does a click on an image already shown at its full size.
   * Touch and pen: a double tap zooms at that point (nothing on an image at
   * its full size); a single tap beside a fitted image closes.
   */
  private tap(e: PointerEvent, type: string): void {
    const p = { x: e.clientX, y: e.clientY }
    const prev = this.lastTap
    const double = !!prev && prev.type === type && e.timeStamp - prev.t < DOUBLE_TAP_MS && distance(prev, p) < DOUBLE_TAP_SLOP
    const hit = this.onImage(p)
    const native = this.nativeScale()
    const zoomable = isZoomed(this.view) || canZoomIn(native)
    if (type === 'mouse') {
      if (double) {
        this.lastTap = null
        return
      }
      this.lastTap = { t: e.timeStamp, x: p.x, y: p.y, type }
      if (hit && zoomable) this.animateZoom(toggleZoom(this.view, p, this.base, this.viewBox, native))
      else if (isZoomed(this.view)) this.animateZoom({ ...IDENTITY })
      else this.cb.requestClose()
      return
    }
    if (double) {
      this.lastTap = null
      if (zoomable) this.animateZoom(toggleZoom(this.view, p, this.base, this.viewBox, native))
      return
    }
    this.lastTap = { t: e.timeStamp, x: p.x, y: p.y, type }
    if (!hit && !isZoomed(this.view)) this.cb.requestClose()
  }

  // ── Wheel and trackpad ───────────────────────────────────────────────────

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    if (this.closing || this.gesture || this.safariPinch) return
    this.finishOpen()
    this.measure()
    const now = e.timeStamp
    const pinch = e.ctrlKey || e.metaKey
    if (!this.wheel || now - this.wheel.last > WHEEL_GESTURE_GAP) {
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY)
      this.wheel = { mode: pinch ? 'zoom' : sideways ? (isZoomed(this.view) ? 'pan' : 'page') : 'zoom', last: now, acc: 0, paged: false, target: null }
    }
    const w = this.wheel
    w.last = now
    if (w.mode === 'page') {
      w.acc += wheelPixels(e.deltaX, e.deltaMode, this.width)
      if (!w.paged && Math.abs(w.acc) > WHEEL_PAGE_PX) {
        w.paged = true
        this.page(w.acc > 0 ? 1 : -1)
      }
      return
    }
    if (w.mode === 'pan') {
      if (!isZoomed(this.view)) return
      const t = { ...this.view, x: this.view.x - wheelPixels(e.deltaX, e.deltaMode, this.width), y: this.view.y - wheelPixels(e.deltaY, e.deltaMode, this.height) }
      this.zoomAnim = null
      this.momentum = null
      this.view = clampView(t, this.base, this.viewBox)
      this.schedule()
      return
    }
    const focal = { x: e.clientX, y: e.clientY }
    const factor = wheelZoomFactor(e.deltaY, e.deltaMode, pinch)
    // A mouse wheel moves in notches: glide to each one. A trackpad streams small steps: follow them directly.
    const notched = e.deltaMode !== 0 || (!pinch && Math.abs(e.deltaY) >= 50)
    if (notched && !this.reduced) {
      const from = this.zoomAnim ? this.zoomAnim.to : this.view
      const to = zoomTo(from, from.scale * factor, focal, this.base, this.viewBox)
      if (to.scale === from.scale && !this.zoomAnim) return
      this.zoomAnim = { from: { ...this.view }, to, p: { value: 0, velocity: 0 } }
      this.setActive(true)
      this.schedule()
      return
    }
    this.zoomAnim = null
    this.momentum = null
    this.view = zoomTo(this.view, this.view.scale * factor, focal, this.base, this.viewBox)
    this.notifyZoom(false)
    this.schedule()
    this.settleWheelSoon()
  }

  private wheelTimer: ReturnType<typeof setTimeout> | null = null

  private settleWheelSoon(): void {
    if (this.wheelTimer) clearTimeout(this.wheelTimer)
    this.wheelTimer = setTimeout(() => {
      this.wheelTimer = null
      if (this.attached) this.notifyZoom(true)
    }, WHEEL_GESTURE_GAP)
  }

  private readonly onGestureStart = (e: Event & { scale?: number }): void => {
    e.preventDefault()
    // iOS: two fingers are already handled as pointers.
    if (this.closing || this.pointers.size) return
    this.finishOpen()
    this.measure()
    this.safariPinch = { scale: this.view.scale }
  }

  private readonly onGestureChange = (e: Event & { scale?: number; clientX?: number; clientY?: number }): void => {
    e.preventDefault()
    if (!this.safariPinch || this.pointers.size || typeof e.scale !== 'number') return
    const focal = typeof e.clientX === 'number' && typeof e.clientY === 'number' ? { x: e.clientX, y: e.clientY } : this.stageCenter()
    this.zoomAnim = null
    this.momentum = null
    this.view = zoomTo(this.view, Math.max(MIN_SCALE, this.safariPinch.scale * e.scale), focal, this.base, this.viewBox)
    this.notifyZoom(false)
    this.schedule()
  }

  private readonly onGestureEnd = (e: Event): void => {
    e.preventDefault()
    if (!this.safariPinch) return
    this.safariPinch = null
    this.notifyZoom(true)
  }
}
