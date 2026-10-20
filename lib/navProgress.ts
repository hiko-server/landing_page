/**
 * Slow-navigation feedback: a route change that is still loading after
 * NAV_PROGRESS_DELAY_MS shows the progress bar (and marks the link that was
 * followed); one still loading after NAV_PROGRESS_ANNOUNCE_MS is also
 * announced to screen readers. A fast navigation never shows anything, so
 * the bar never flickers. Framework-free so it is unit-tested;
 * components/Chrome/NavProgress.tsx drives it from Next's router events.
 */

/** A navigation faster than this shows no feedback at all (perceived as instant). */
export const NAV_PROGRESS_DELAY_MS = 150

/** Only a navigation this slow is announced ("Loading…"), so quick ones stay quiet for screen readers. */
export const NAV_PROGRESS_ANNOUNCE_MS = 1000

export type NavProgressView = {
  /** The navigation is slow: show the bar. */
  show(): void
  /** The navigation is very slow: tell assistive technology. */
  announce(): void
  /** The navigation finished (or failed): hide everything that was shown. */
  hide(): void
}

type Timers = {
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

const browserTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export type NavProgress = {
  /** A route change started (a newer one replaces the timers of the last). */
  start(): void
  /** The route is about to render, completed or failed. */
  finish(): void
  /** Whether the bar is on screen. */
  readonly visible: boolean
}

export function createNavProgress(
  view: NavProgressView,
  timers: Timers = browserTimers,
  delay = NAV_PROGRESS_DELAY_MS,
  announceAfter = NAV_PROGRESS_ANNOUNCE_MS,
): NavProgress {
  let showTimer: unknown = null
  let announceTimer: unknown = null
  let visible = false
  let announced = false
  const cancel = () => {
    if (showTimer !== null) timers.clear(showTimer)
    if (announceTimer !== null) timers.clear(announceTimer)
    showTimer = null
    announceTimer = null
  }
  return {
    start() {
      cancel()
      if (!visible) {
        showTimer = timers.set(() => {
          showTimer = null
          visible = true
          view.show()
        }, delay)
      }
      if (!announced) {
        announceTimer = timers.set(() => {
          announceTimer = null
          announced = true
          view.announce()
        }, announceAfter)
      }
    },
    finish() {
      cancel()
      if (!visible && !announced) return
      visible = false
      announced = false
      view.hide()
    },
    get visible() {
      return visible
    },
  }
}

/** A click this old no longer names the link a navigation came from (it was a keyboard shortcut, Back, …). */
export const PENDING_LINK_TTL_MS = 1000

/** The link a navigation that starts now was started from: the last clicked link, if that click was recent. */
export function pendingLinkOf<T>(clicked: T | null, clickedAt: number, now: number): T | null {
  return clicked && now - clickedAt <= PENDING_LINK_TTL_MS ? clicked : null
}
