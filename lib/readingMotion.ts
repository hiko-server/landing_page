/**
 * Reading micro-motion, framework-free (unit-tested): whether the sticky
 * header is tucked away while reading a long article on a small screen
 * (components/Article/useAutoHideHeader.ts; globals.css decides the screens
 * and the exceptions).
 */

/** Never hidden this close to the top of the page (px): the header belongs to the page's opening. */
export const AUTOHIDE_MIN_Y = 160

/** Travel (px) in one direction before the header changes state, so a tremor never toggles it. */
export const AUTOHIDE_DELTA = 8

/** A page counts as long — worth hiding the header for — at this many viewport heights. */
export const AUTOHIDE_LONG_PAGE = 3

export type AutoHideState = {
  hidden: boolean
  /** The scroll position the next change is measured from: the furthest point in the current direction. */
  anchorY: number
}

/**
 * The header's next state for scroll position `y`: hidden after scrolling
 * down AUTOHIDE_DELTA past the anchor, shown again after scrolling up as
 * much, and always shown near the top or on a page that is not long.
 */
export function nextAutoHide(state: AutoHideState, y: number, long: boolean): AutoHideState {
  if (!long || y < AUTOHIDE_MIN_Y) return state.hidden || state.anchorY !== y ? { hidden: false, anchorY: y } : state
  const dy = y - state.anchorY
  if (state.hidden) {
    if (dy < -AUTOHIDE_DELTA) return { hidden: false, anchorY: y }
    return dy > 0 ? { hidden: true, anchorY: y } : state
  }
  if (dy > AUTOHIDE_DELTA) return { hidden: true, anchorY: y }
  return dy < 0 ? { hidden: false, anchorY: y } : state
}

/** True when the document is long enough for the header to hide while reading. */
export function isLongPage(scrollHeight: number, viewportHeight: number): boolean {
  return viewportHeight > 0 && scrollHeight >= viewportHeight * AUTOHIDE_LONG_PAGE
}
