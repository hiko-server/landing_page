/**
 * Move focus into the page as a modal dialog closes (client-safe, no React).
 *
 * A dialog's focus trap (Chakra's Modal, the ⌘K palette) is released only
 * as the dialog unmounts, just after its exit: focus moved into the page in
 * that window is pulled back into the dialog for a frame or two — and then
 * lost to <body> when the dialog goes. So the focus is retried once a frame
 * until it stays (components/Search/citation.ts — a cited quote's block;
 * components/Contact/ContactPro.tsx — the message a question was handed to).
 */

export type FocusTarget = {
  focus(options?: { preventScroll?: boolean }): void
  readonly isConnected?: boolean
}

export type FocusEnv = {
  /** The next frame (window.requestAnimationFrame). */
  frame(cb: () => void): unknown
  /** The focused element (document.activeElement). */
  active(): unknown
}

export type FocusUntilOptions = {
  /** Frames to keep trying (the trap lets go within two or three). */
  attempts?: number
  preventScroll?: boolean
  /** Runs before each try (e.g. give a block its tabindex again — a blur may have taken it). */
  prepare?: () => void
  /** Called once: true when focus stayed on the target, false when it gave up (or the target left the page). */
  onSettled?: (stuck: boolean) => void
}

const browserEnv = (): FocusEnv => ({
  frame: (cb) => window.requestAnimationFrame(cb),
  active: () => document.activeElement,
})

/** Focus `el` now and again each frame until it keeps the focus (or `attempts` frames have passed). */
export function focusUntilItSticks(el: FocusTarget | null | undefined, options: FocusUntilOptions = {}, env: FocusEnv = browserEnv()): void {
  const { attempts = 8, preventScroll = false, prepare, onSettled } = options
  const attempt = (left: number) => {
    if (!el || el.isConnected === false) {
      onSettled?.(false)
      return
    }
    prepare?.()
    el.focus({ preventScroll })
    env.frame(() => {
      if (env.active() === el) onSettled?.(true)
      else if (left > 1) attempt(left - 1)
      else onSettled?.(false)
    })
  }
  attempt(Math.max(1, attempts))
}
