/**
 * The mobile menu as a physical sheet (components/Header/MobileDrawer.tsx):
 * it follows a horizontal drag, closes when released far enough or flicked,
 * springs back otherwise, and the scrim lightens as it leaves. Pure numbers
 * only (unit-tested in tests/chrome-identity.test.ts).
 *
 * The gesture is plain pointer events with CSS transitions, not
 * framer-motion's drag: importing framer's animation primitives into this
 * lazy chunk would split framer's modules out of the shared bundle and grow
 * every page's JavaScript, for a gesture that needs a few lines of maths.
 */

/** Released past this share of the panel width → close. */
export const CLOSE_DISTANCE_RATIO = 0.35

/** Released moving right faster than this (px/s) → close, however short the drag. */
export const CLOSE_VELOCITY = 500

/** Movement (px) before a press becomes a drag (or a scroll, when mostly vertical). */
export const DRAG_SLOP = 8

/** Resistance when the sheet is pulled the wrong way (left, into the screen). */
export const OVERDRAG_ELASTIC = 0.04

type Bezier = [number, number, number, number]

/** iOS-sheet curve for opening, closing and settling. */
export const SHEET_EASE: Bezier = [0.32, 0.72, 0, 1]
export const SHEET_EASE_CSS = `cubic-bezier(${SHEET_EASE.join(', ')})`
export const SHEET_OPEN_S = 0.4
export const SHEET_CLOSE_S = 0.28
export const SCRIM_OPEN_S = 0.3
export const SCRIM_CLOSE_S = 0.24
/** A sheet released short of the threshold settles back in this long. */
export const SNAP_BACK_MS = 320

/** Link entrance: 24 ms apart, a 6 px rise. */
export const LINK_STAGGER_MS = 24
export const LINK_RISE_PX = 6
export const LINK_ENTER_MS = 320
/** Re-opening within this many ms of the last close skips the entrance (it would only slow a quick second look). */
export const RESTAGGER_AFTER_MS = 2000

/** Only the last this-many ms of movement count toward the release velocity. */
export const VELOCITY_WINDOW_MS = 100

export type DragSample = { t: number; x: number }

/** Offset of the sheet for a finger `dx` px from where it went down. */
export function dragOffset(dx: number): number {
  if (!Number.isFinite(dx)) return 0
  return dx >= 0 ? dx : dx * OVERDRAG_ELASTIC
}

/** Decides a pending press: 'drag' (mostly horizontal), 'scroll' (mostly vertical) or null (not moved enough yet). */
export function classifyMove(dx: number, dy: number): 'drag' | 'scroll' | null {
  if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return null
  return Math.abs(dx) > Math.abs(dy) ? 'drag' : 'scroll'
}

/** Appends a sample and drops the ones older than the velocity window. */
export function pushSample(samples: DragSample[], sample: DragSample): DragSample[] {
  const kept = samples.filter((s) => sample.t - s.t <= VELOCITY_WINDOW_MS)
  kept.push(sample)
  return kept
}

/**
 * Horizontal velocity (px/s) at release, from the samples of the last
 * VELOCITY_WINDOW_MS. A finger that stopped before lifting has no velocity.
 */
export function releaseVelocity(samples: readonly DragSample[], releasedAt: number): number {
  const recent = samples.filter((s) => releasedAt - s.t <= VELOCITY_WINDOW_MS)
  if (recent.length < 2) return 0
  const first = recent[0]
  const last = recent[recent.length - 1]
  const dt = last.t - first.t
  return dt > 0 ? ((last.x - first.x) / dt) * 1000 : 0
}

/**
 * Close on release? Only a drag to the right counts: past the distance
 * threshold, or a flick faster than CLOSE_VELOCITY.
 */
export function shouldCloseOnRelease(offsetX: number, velocityX: number, width: number): boolean {
  if (!(offsetX > 0)) return false
  if (velocityX > CLOSE_VELOCITY) return true
  return width > 0 && offsetX > width * CLOSE_DISTANCE_RATIO
}

/** How long the rest of a closing slide takes: a flick carries its speed, never slower than a normal close. */
export function closeDurationMs(remainingPx: number, velocityX: number): number {
  const normal = SHEET_CLOSE_S * 1000
  if (!(velocityX > 0) || !(remainingPx > 0)) return normal
  return Math.round(Math.min(normal, Math.max(120, (remainingPx / velocityX) * 1000 * 1.6)))
}

/** Scrim strength (1 = fully dimmed) for the sheet's current offset. */
export function scrimProgress(x: number, width: number): number {
  if (!(width > 0) || !Number.isFinite(x)) return 1
  return Math.min(1, Math.max(0, 1 - x / width))
}

/** Whether the links run their entrance this time the menu opens. */
export function shouldStaggerLinks(lastClosedAt: number | null, now: number, reducedMotion: boolean): boolean {
  if (reducedMotion) return false
  return lastClosedAt === null || now - lastClosedAt > RESTAGGER_AFTER_MS
}

/** True when the visitor asks for reduced motion (false where it cannot be known). */
export function prefersReducedMotion(win: { matchMedia?: (q: string) => { matches: boolean } } | undefined): boolean {
  try {
    return !!win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

type Transition = { duration: number; ease?: Bezier }

/** Variants for Chakra's Slide (the sheet) — instant under reduced motion. */
export function sheetVariants(reducedMotion: boolean): {
  enter: { x: number | string; transition: Transition }
  exit: { x: number | string; transition: Transition }
} {
  return {
    enter: { x: 0, transition: reducedMotion ? { duration: 0 } : { duration: SHEET_OPEN_S, ease: SHEET_EASE } },
    exit: { x: '100%', transition: reducedMotion ? { duration: 0 } : { duration: SHEET_CLOSE_S, ease: SHEET_EASE } },
  }
}

/** Variants for the scrim's fade — instant under reduced motion. */
export function scrimVariants(reducedMotion: boolean): {
  enter: { opacity: number; transition: Transition }
  exit: { opacity: number; transition: Transition }
} {
  return {
    enter: { opacity: 1, transition: reducedMotion ? { duration: 0 } : { duration: SCRIM_OPEN_S, ease: SHEET_EASE } },
    exit: { opacity: 0, transition: reducedMotion ? { duration: 0 } : { duration: SCRIM_CLOSE_S, ease: SHEET_EASE } },
  }
}
