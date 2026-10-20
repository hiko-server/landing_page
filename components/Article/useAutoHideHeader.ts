import { useEffect } from 'react'
import { isLongPage, nextAutoHide, type AutoHideState } from '../../lib/readingMotion'

/** Attribute on <html> while the header is tucked away (globals.css `.site-header-sticky`). */
export const HEADER_HIDDEN_ATTR = 'data-header-hidden'

/**
 * Long articles: reading down tucks the sticky header away, the first scroll
 * up brings it back (lib/readingMotion.ts nextAutoHide). Only the state is
 * decided here, once per frame from a passive listener; globals.css applies
 * it on small screens only and never while a dialog or the article outline
 * is open, a slow navigation is loading or focus is in the header. The
 * attribute goes with the article.
 */
export function useAutoHideHeader(): void {
  useEffect(() => {
    const root = document.documentElement
    let state: AutoHideState = { hidden: false, anchorY: window.scrollY }
    let frame = 0
    const apply = () => {
      frame = 0
      const next = nextAutoHide(state, window.scrollY, isLongPage(root.scrollHeight, window.innerHeight))
      if (next.hidden !== state.hidden) {
        if (next.hidden) root.setAttribute(HEADER_HIDDEN_ATTR, '')
        else root.removeAttribute(HEADER_HIDDEN_ATTR)
      }
      state = next
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(apply)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
      root.removeAttribute(HEADER_HIDDEN_ATTR)
    }
  }, [])
}
