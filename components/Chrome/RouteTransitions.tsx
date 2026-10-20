import { useEffect, useLayoutEffect, useState } from 'react'
import type { Router } from 'next/router'
import {
  HistoryIndex,
  TransitionGate,
  beginViewTransition,
  isRouteTransitionNavigation,
  liftDismissibleLayers,
  popRecordOf,
  prefersReducedMotion,
  resolveDirection,
  supportsViewTransitions,
  takePendingDirection,
  transitionSettled,
  uaAnimatedPop,
  type PopRecord,
} from '../../lib/viewTransition'
import type { MorphOrigins } from '../../lib/viewTransitionMorph'

/**
 * View transitions for client-side route changes (contract F). See
 * lib/viewTransition.ts for the mechanism; this file wires it to Next's router.
 *
 * Direction: every transition gets a type — 'next' / 'prev' when a sequence
 * link set one (setPendingDirection), 'forward' for an ordinary push, and for
 * Back / Forward 'back' or 'forward' from the order of the two history
 * entries (HistoryIndex, keyed by Next's own history.state.key). globals.css
 * turns the type into a short directional slide; without a type the page
 * cross-fades. A Back / Forward the browser already animated itself (an
 * edge swipe: PopStateEvent.hasUAVisualTransition) gets no second animation.
 *
 * Open overlays (the mobile menu, the ⌘K palette) are lifted out of the
 * page snapshot so they fade out in place instead of sliding over the
 * incoming page (liftDismissibleLayers).
 *
 * Shared elements: when a card for the destination is on screen, its title
 * (and cover) morph into the detail page's; going back, the page's title
 * flies back into the card it came from (planMorph). The parts are named
 * only for that one transition — the source before the old snapshot, the
 * target once React has committed the new page — so a name is never on two
 * elements, and the transition gets the extra type 'morph'. Nothing morphs
 * out from under an open overlay. Under reduced motion no transition runs.
 * The morph code (lib/viewTransitionMorph.ts) is its own chunk, fetched when
 * the browser is idle or at the first press; until it is there, navigations
 * transition without a morph.
 */

const gate = new TransitionGate()

/** The gate re-opens on its own if the transition's update callback has not run by then. */
const HOLD_LIMIT_MS = 400
/** Longest the browser keeps rendering paused while React commits the new page. */
const COMMIT_WAIT_MS = 1000

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * True while a route transition holds the incoming page (the old snapshot is
 * being captured). Other view transitions — the theme reveal — must not start
 * then, or they would skip the route transition mid-way.
 */
export function isRouteTransitionHolding(): boolean {
  return gate.holding
}

let historyIndex: HistoryIndex | null = null

type Morph = typeof import('../../lib/viewTransitionMorph')

/** The morph module once loaded, with where each detail page opened by a morph flies back to. */
let morph: { lib: Morph; origins: MorphOrigins } | null = null
let morphRequested = false

function loadMorph(): void {
  if (morphRequested) return
  morphRequested = true
  import('../../lib/viewTransitionMorph').then(
    (lib) => {
      morph = { lib, origins: new lib.MorphOrigins() }
    },
    () => {
      morphRequested = false
    },
  )
}

function getHistoryIndex(): HistoryIndex {
  if (!historyIndex) {
    let storage: Storage | null = null
    try {
      storage = window.sessionStorage
    } catch {
      storage = null
    }
    historyIndex = new HistoryIndex(storage)
  }
  return historyIndex
}

/** Next's key for the history entry currently in the address bar. */
function currentHistoryKey(): unknown {
  return (window.history.state as { key?: unknown } | null)?.key
}

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
    const order = getHistoryIndex()
    order.enter(currentHistoryKey())
    let safety: ReturnType<typeof setTimeout> | undefined
    const open = () => {
      clearTimeout(safety)
      gate.release()
    }
    // Next's own popstate listener was added first, and its route change
    // awaits the route before beforeHistoryChange, so this has always run by
    // then for a Back / Forward.
    let lastPop: PopRecord | null = null
    const onPopState = (event: PopStateEvent) => {
      lastPop = popRecordOf(event)
    }
    // What the visitor last clicked (or pressed Enter on): when two cards on
    // a page stand for the same destination, that one morphs.
    let activated: EventTarget | null = null
    const onClick = (event: MouseEvent) => {
      activated = event.target
    }
    // The morph chunk: when the browser is idle, or at the first press.
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    const idle = w.requestIdleCallback ? w.requestIdleCallback(loadMorph, { timeout: 4000 }) : null
    const idleTimer = idle === null ? window.setTimeout(loadMorph, 1500) : 0
    // Fires after the next page's code + data have loaded, right before Next
    // renders it (and before it writes the new history entry) — so holding
    // the render costs one frame, never a fetch.
    const onBeforeHistoryChange = (as: string) => {
      // Always consume the pending direction and the popstate record so they
      // can never leak into a later, unrelated navigation.
      const pendingDirection = takePendingDirection()
      const pop = lastPop
      lastPop = null
      const clicked = activated
      activated = null
      if (gate.holding || prefersReducedMotion()) return
      // On Back / Forward the browser has already moved to the target entry;
      // on a push the address bar still shows the entry being left.
      const key = currentHistoryKey()
      const isPop = typeof key === 'string' && key !== order.current
      if (!isRouteTransitionNavigation(window.location.href, as, isPop, gate.committedPageKey)) return
      if (uaAnimatedPop(pop, isPop, key)) return
      const type = resolveDirection(pendingDirection, isPop, order.currentIndex, isPop ? order.indexOf(key) : null)
      const layers = liftDismissibleLayers(document)
      // A card hidden behind an open overlay (a palette result, a drawer
      // link) does not fly: the overlay fades out over a plain transition.
      const viewport = { width: window.innerWidth, height: window.innerHeight }
      const active =
        morph && !layers.count ? morph.lib.startMorph(document, gate.committedPageKey, as, viewport, morph.origins, clicked) : null
      const types = [type, active ? 'morph' : null].filter((t): t is string => !!t)
      gate.hold()
      safety = setTimeout(open, HOLD_LIMIT_MS)
      const vt = beginViewTransition(
        document,
        async () => {
          layers.hideFromNewState()
          active?.snapshotTaken()
          open()
          await gate.waitForCommit(COMMIT_WAIT_MS)
          await active?.nameTarget()
        },
        types.length ? types : undefined,
      )
      if (!vt) {
        open()
        active?.done()
      }
      void transitionSettled(vt).then(() => {
        layers.restore()
        active?.done()
      })
    }
    const onComplete = () => {
      order.enter(currentHistoryKey())
      gate.markCommitted()
    }
    const onError = () => {
      open()
      order.enter(currentHistoryKey())
    }
    // In-page anchors push their own history entries (no route events).
    const onHashChange = () => order.enter(currentHistoryKey())
    window.addEventListener('popstate', onPopState)
    document.addEventListener('click', onClick, true)
    document.addEventListener('pointerdown', loadMorph, { capture: true, once: true, passive: true })
    events.on('beforeHistoryChange', onBeforeHistoryChange)
    events.on('routeChangeComplete', onComplete)
    events.on('routeChangeError', onError)
    events.on('hashChangeComplete', onHashChange)
    return () => {
      window.removeEventListener('popstate', onPopState)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('pointerdown', loadMorph, true)
      if (idle !== null) w.cancelIdleCallback?.(idle)
      window.clearTimeout(idleTimer)
      events.off('beforeHistoryChange', onBeforeHistoryChange)
      events.off('routeChangeComplete', onComplete)
      events.off('routeChangeError', onError)
      events.off('hashChangeComplete', onHashChange)
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
