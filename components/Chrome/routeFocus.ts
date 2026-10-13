import { useEffect, useRef } from 'react'
import type { Router } from 'next/router'
import { pageKeyOf } from '../../lib/viewTransition'

/**
 * Focus after a client-side page change (WCAG 2.4.3 / 2.4.11).
 *
 * The header is persistent, so after a navigation started from it (or from
 * the drawer, the ⌘K palette, Back / Forward) keyboard focus would stay in
 * the header and the next Tab would walk the nav again. Once the new page
 * has rendered, focus moves to the start of its content — <main id="main">
 * (tabIndex -1, no ring), or the element the URL's #fragment names — with
 * preventScroll, so Next's scroll restoration and hash scrolling are left
 * alone. Next's route announcer still announces the new title.
 *
 * Only page changes count: a hash or query change on the same page (?tab=…,
 * #section) never moves focus. Focus also stays where it is when the new
 * page already put it inside its content (an autofocus field), and while a
 * dialog is still open — a menu that is closing because of the navigation
 * is waited for (its focus return is disabled for such closes,
 * components/Header/Header.tsx).
 */

export const MAIN_ID = 'main'

/** Longest wait (in frames, about one second) for a closing dialog to leave. */
const MAX_WAIT_FRAMES = 60

/** True when a completed route change shows another page, not the same page with a new hash or query. */
export function isPageChange(previousPageKey: string | null, nextAs: string): boolean {
  return previousPageKey !== null && pageKeyOf(nextAs) !== previousPageKey
}

/** The decoded #fragment of an asPath ('' when none). */
export function fragmentOf(as: string): string {
  const i = as.indexOf('#')
  if (i < 0) return ''
  const raw = as.slice(i + 1)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

type FocusableLike = {
  focus(options?: { preventScroll?: boolean }): void
  contains(other: unknown): boolean
  hasAttribute(name: string): boolean
  setAttribute(name: string, value: string): void
}

type FocusDocument = {
  activeElement: unknown
  body: unknown
  getElementById(id: string): FocusableLike | null
  querySelector(selector: string): unknown
}

/** A modal dialog that is still on screen owns focus. */
export const OPEN_DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]'

export type FocusVerdict = 'focus' | 'wait' | 'skip'

/**
 * What to do right now: move focus, wait for a dialog to close, or leave
 * focus alone. `focusedAtStart` is what had focus when the navigation
 * started: still holding it (the old page's link, while the fallback
 * animation keeps the old page mounted) is not the new page's own choice.
 */
export function focusVerdict(doc: FocusDocument, focusedAtStart: unknown = null): FocusVerdict {
  const main = doc.getElementById(MAIN_ID)
  if (!main) return 'skip'
  if (doc.querySelector(OPEN_DIALOG_SELECTOR)) return 'wait'
  const active = doc.activeElement
  if (active && active !== doc.body && active !== main && active !== focusedAtStart && main.contains(active)) return 'skip'
  return 'focus'
}

/**
 * Focus the start of the new page: the #fragment's element when it is part
 * of the page content (made focusable like an in-page jump), else <main>.
 * Returns the element focused, or null.
 */
export function focusPageStart(doc: FocusDocument, as: string): FocusableLike | null {
  const main = doc.getElementById(MAIN_ID)
  if (!main) return null
  const id = fragmentOf(as)
  const target = id ? doc.getElementById(id) : null
  const el = target && target !== main && main.contains(target) ? target : main
  if (el !== main && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
  return el
}

/** Moves focus into the new page after every client-side page change (see above). */
export function useFocusMainOnPageChange(events: Router['events'], pageKey: string): void {
  const initialKey = useRef(pageKey)
  useEffect(() => {
    let onScreen = initialKey.current
    let frame = 0
    let focusedAtStart: Element | null = null
    const onStart = () => {
      focusedAtStart = document.activeElement
    }
    const onComplete = (as: string) => {
      const changed = isPageChange(onScreen, as)
      onScreen = pageKeyOf(as)
      if (!changed) return
      cancelAnimationFrame(frame)
      let waited = 0
      const attempt = () => {
        frame = 0
        const verdict = focusVerdict(document, focusedAtStart)
        if (verdict === 'wait' && waited++ < MAX_WAIT_FRAMES) {
          frame = requestAnimationFrame(attempt)
          return
        }
        if (verdict === 'focus') focusPageStart(document, as)
      }
      attempt()
    }
    events.on('routeChangeStart', onStart)
    events.on('routeChangeComplete', onComplete)
    return () => {
      events.off('routeChangeStart', onStart)
      events.off('routeChangeComplete', onComplete)
      cancelAnimationFrame(frame)
    }
  }, [events])
}
