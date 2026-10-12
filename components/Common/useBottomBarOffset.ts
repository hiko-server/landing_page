import { useEffect, type RefObject } from 'react'

/** CSS custom property floating controls read to clear a sticky bottom bar. */
export const BOTTOM_BAR_VAR = '--bottom-bar-h'

/**
 * Publishes the rendered height of a page's sticky bottom bar as
 * `--bottom-bar-h` on <html>, so fixed controls (the scroll-to-top button)
 * can sit above it instead of covering its buttons. The height is measured
 * (ResizeObserver), so it includes the bar's safe-area padding and follows
 * font-size / zoom changes. While the bar is not displayed (e.g. ≥ md, where
 * it is display:none) or after the page unmounts, the property is removed
 * and the controls return to their normal position.
 */
export function useBottomBarOffset(ref: RefObject<HTMLElement>): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const apply = () => {
      const h = Math.ceil(el.getBoundingClientRect().height)
      if (h > 0) root.style.setProperty(BOTTOM_BAR_VAR, `${h}px`)
      else root.style.removeProperty(BOTTOM_BAR_VAR)
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty(BOTTOM_BAR_VAR)
    }
  }, [ref])
}
