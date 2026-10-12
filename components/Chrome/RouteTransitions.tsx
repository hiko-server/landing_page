import { useEffect, useLayoutEffect, useState } from 'react'
import type { Router } from 'next/router'
import {
  TransitionGate,
  isCrossPageNavigation,
  prefersReducedMotion,
  startViewTransitionSafely,
  supportsViewTransitions,
} from '../../lib/viewTransition'

/**
 * View transitions for client-side route changes (contract F). See
 * lib/viewTransition.ts for the mechanism; this file wires it to Next's router.
 */

const gate = new TransitionGate()

/** The gate re-opens on its own if the transition's update callback has not run by then. */
const HOLD_LIMIT_MS = 400
/** Longest the browser keeps rendering paused while React commits the new page. */
const COMMIT_WAIT_MS = 1000

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Registers the router listeners and returns whether this browser can run
 * view transitions (decided once; false during SSR). When it returns true the
 * caller must render <RouteTransitionGate> for the page and must not run its
 * own page enter/exit animation.
 */
export function useRouteViewTransitions(events: Router['events'], pageKey: string): boolean {
  const [enabled] = useState(() => supportsViewTransitions())

  // Tell the gate which page is on screen (runs in the same commit as the page).
  useIsomorphicLayoutEffect(() => {
    gate.commit(pageKey)
  }, [pageKey])

  useEffect(() => {
    if (!enabled) return
    let safety: ReturnType<typeof setTimeout> | undefined
    const open = () => {
      clearTimeout(safety)
      gate.release()
    }
    // Fires after the next page's code + data have loaded, right before Next
    // renders it — so holding the render costs one frame, never a fetch.
    const onBeforeHistoryChange = (as: string) => {
      if (gate.holding || prefersReducedMotion() || !isCrossPageNavigation(window.location.href, as)) return
      gate.hold()
      safety = setTimeout(open, HOLD_LIMIT_MS)
      const started = startViewTransitionSafely(document, async () => {
        open()
        await gate.waitForCommit(COMMIT_WAIT_MS)
      })
      if (!started) open()
    }
    const onComplete = () => gate.markCommitted()
    events.on('beforeHistoryChange', onBeforeHistoryChange)
    events.on('routeChangeComplete', onComplete)
    events.on('routeChangeError', open)
    return () => {
      events.off('beforeHistoryChange', onBeforeHistoryChange)
      events.off('routeChangeComplete', onComplete)
      events.off('routeChangeError', open)
      open()
    }
  }, [enabled, events])

  return enabled
}

/**
 * Suspends the incoming page's render while the browser captures the old
 * snapshot. Next renders route changes in a React transition and _app has no
 * Suspense boundary above this, so React keeps the current page on screen
 * until the gate opens instead of showing a fallback.
 */
export function RouteTransitionGate({ pageKey }: { pageKey: string }) {
  const pending = gate.pendingFor(pageKey)
  if (pending) throw pending
  return null
}
