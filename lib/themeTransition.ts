import { flushSync } from 'react-dom'
import { isRouteTransitionHolding } from '../components/Chrome/RouteTransitions'
import { prefersReducedMotion, revealGeometry, supportsViewTransitions } from './viewTransition'
import { DURATIONS, EASE_STANDARD_CSS } from '../theme/tokens'

/**
 * Theme change with a circular reveal: the new colour mode grows out of the
 * toggle button (or the theme menu's trigger) as a clip-path circle over a
 * still snapshot of the old one (View Transitions API). Chakra's
 * setColorMode writes data-theme and the colour-mode class synchronously,
 * and flushSync commits the React side in the same update callback, so the
 * "new" snapshot is the fully re-themed page.
 *
 * Falls back to the instant toggle without the API (Firefox), under
 * prefers-reduced-motion, while a route transition is capturing its snapshot,
 * and on any error. Clicks while a reveal is running are ignored.
 */

// The slow token duration on the standard ease (theme/tokens.ts).
const REVEAL_MS = DURATIONS.slow
const REVEAL_EASING = EASE_STANDARD_CSS

let inFlight = false

type ThemeViewTransition = { ready: Promise<unknown>; finished: Promise<unknown> }
type ThemeTransitionDocument = Document & { startViewTransition: (update: () => void) => ThemeViewTransition }

/**
 * Run `update` (a colour-mode change: a toggle, or applying a System / Light /
 * Dark preference) behind the circular reveal from `originEl` (the viewport
 * centre when null).
 */
export function revealThemeChange(update: () => void, originEl: HTMLElement | null): void {
  const toggle = update
  if (inFlight) return
  if (typeof document === 'undefined' || !supportsViewTransitions() || prefersReducedMotion() || isRouteTransitionHolding()) {
    toggle()
    return
  }
  const root = document.documentElement
  let toggled = false
  const runToggle = () => {
    if (toggled) return
    toggled = true
    toggle()
  }
  try {
    const { x, y, r } = revealGeometry(originEl ? originEl.getBoundingClientRect() : null, {
      width: window.innerWidth,
      height: window.innerHeight,
    })
    inFlight = true
    root.classList.add('theme-vt')
    const vt = (document as ThemeTransitionDocument).startViewTransition(() => {
      flushSync(runToggle)
    })
    vt.ready
      .then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: REVEAL_MS, easing: REVEAL_EASING, pseudoElement: '::view-transition-new(root)' },
        )
      })
      // A skipped transition (hidden tab, a newer transition) rejects `ready`;
      // its update callback still runs, so the theme has changed anyway.
      .catch(() => undefined)
    vt.finished
      .catch(() => undefined)
      .finally(() => {
        root.classList.remove('theme-vt')
        inFlight = false
        // If the browser never ran the update callback, still switch.
        runToggle()
      })
  } catch {
    root.classList.remove('theme-vt')
    inFlight = false
    runToggle()
  }
}

/** The toggle's name for the same reveal (the header and the mobile drawer call it with Chakra's toggleColorMode). */
export const toggleThemeWithTransition = revealThemeChange
