/**
 * One timing policy for every toast on the site and in the admin (pure —
 * unit tested; applied by components/Common/UnifiedToast, which _app gives
 * Chakra's toast manager):
 *
 *   success   at least 4 s        info      at least 5 s
 *   warning   at least 8 s        error     stays until dismissed
 *   loading   stays until updated or closed
 *   custom    (no status: a custom render, e.g. an Undo toast) as requested, 6 s by default
 *
 * A caller may ask for longer, never for less than the minimum of its status
 * (a 2-second success could not be read); `null` keeps any toast open. The
 * timer pauses while the pointer is over the toast, while keyboard focus is
 * inside it and while the page is hidden (WCAG 2.2.1 Timing Adjustable), and
 * resumes with the time that was left.
 */

export type NotifyStatus = 'success' | 'error' | 'warning' | 'info' | 'loading' | 'default' | undefined

export const MIN_TOAST_MS: Record<'success' | 'info' | 'warning', number> = {
  success: 4000,
  info: 5000,
  warning: 8000,
}

export const CUSTOM_TOAST_MS = 6000

/** How long a toast stays (ms), or null to stay until dismissed. */
export function toastDuration(status: NotifyStatus, requested: number | null | undefined): number | null {
  if (status === 'error' || status === 'loading') return null
  if (requested === null) return null
  const ask = typeof requested === 'number' && Number.isFinite(requested) && requested > 0 ? requested : undefined
  if (status === 'success' || status === 'info' || status === 'warning') return Math.max(ask ?? 0, MIN_TOAST_MS[status])
  return ask ?? CUSTOM_TOAST_MS
}

/** Errors interrupt (role="alert"); everything else is a polite status. */
export function toastRole(status: NotifyStatus): 'alert' | 'status' {
  return status === 'error' ? 'alert' : 'status'
}

/**
 * Remaining time of a pausable timer: `pause()` remembers what was left,
 * `resume()` returns it (never below `floor`, so a toast about to vanish
 * still gives a moment after the pointer leaves).
 */
export function createPausableClock(total: number, now: () => number = Date.now, floor = 1500) {
  let remaining = total
  let startedAt: number | null = now()
  return {
    pause(): number {
      if (startedAt !== null) {
        remaining = Math.max(0, remaining - (now() - startedAt))
        startedAt = null
      }
      return remaining
    },
    resume(): number {
      if (startedAt === null) {
        remaining = Math.max(floor, remaining)
        startedAt = now()
      }
      return remaining
    },
    get paused() {
      return startedAt === null
    },
  }
}
