/**
 * Typewriter scrolling for the admin editor (H3): while it is on, every
 * keystroke and caret move scrolls the nearest scrolling container (the
 * MDX textarea itself once its text overflows, else the nearest scrolling
 * ancestor, else the page) so the caret line sits at the same height —
 * just under the middle. Always an instant scroll: a smooth one on every
 * keystroke is motion the writer did not ask for.
 */

/** Height of the caret line, as a share of the visible area. */
export const TYPEWRITER_RATIO = 0.45

/** Smaller moves are ignored, so the text does not jitter. */
export const TYPEWRITER_SLACK_PX = 4

/** How far to scroll so a caret at `caretTop` lands at `ratio` of a view starting at `viewTop` (pure). */
export function centerDelta(caretTop: number, viewTop: number, viewHeight: number, ratio = TYPEWRITER_RATIO): number {
  const delta = caretTop - (viewTop + viewHeight * ratio)
  return Math.abs(delta) < TYPEWRITER_SLACK_PX ? 0 : Math.round(delta)
}

/** Nearest ancestor that scrolls vertically, or null for the page. */
export function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node && node !== document.body; node = node.parentElement) {
    const { overflowY } = window.getComputedStyle(node)
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
  }
  return null
}

/**
 * Scroll so the caret (viewport coordinates) sits at the typewriter line.
 * `self`: `from` scrolls its own content (a textarea) — use it when it overflows.
 */
export function scrollCaretToCenter(caret: { top: number }, from: HTMLElement, opts: { self?: boolean } = {}): void {
  const parent = opts.self && from.scrollHeight > from.clientHeight ? from : scrollParentOf(from)
  if (parent) {
    const box = parent.getBoundingClientRect()
    const delta = centerDelta(caret.top, box.top, parent.clientHeight)
    if (delta) parent.scrollTop += delta
    return
  }
  const delta = centerDelta(caret.top, 0, window.innerHeight)
  if (delta) window.scrollBy({ top: delta, behavior: 'auto' })
}
