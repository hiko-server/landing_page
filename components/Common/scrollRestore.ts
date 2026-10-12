import { useEffect, useLayoutEffect, useRef } from 'react'
import { pageKeyOf } from '../../lib/viewTransition'

/**
 * Back / Forward scroll restoration when route changes are animated by
 * framer-motion (browsers without the View Transitions API).
 *
 * With `experimental.scrollRestoration` (next.config.js) Next saves each
 * history entry's scroll position in sessionStorage and, on popstate,
 * scrolls to it in the same React commit that renders the new route. In
 * view-transition browsers that commit contains the new page (the hold in
 * components/Chrome/RouteTransitions.tsx only delays it), so Next's own
 * restore lands correctly. The framer-motion fallback in _app renders with
 * AnimatePresence mode="wait": during that commit the OLD page is still on
 * screen fading out, so Next's scroll is clamped to the old page's height and
 * the restored page then mounts at the wrong position. This module re-applies
 * the saved position once the new page has actually mounted, before it
 * paints.
 */

/** Key prefix Next 14's router uses for saved positions (shared/lib/router/router.js). */
export const NEXT_SCROLL_KEY_PREFIX = '__next_scroll_'

export type ScrollPosition = { x: number; y: number }

/** Saved position for a history entry key, or null when absent / malformed. */
export function readSavedScroll(storage: Pick<Storage, 'getItem'> | null | undefined, historyKey: unknown): ScrollPosition | null {
  if (!storage || typeof historyKey !== 'string' || !historyKey) return null
  try {
    const raw = storage.getItem(NEXT_SCROLL_KEY_PREFIX + historyKey)
    if (!raw) return null
    const v = JSON.parse(raw) as { x?: unknown; y?: unknown }
    const x = Number(v?.x)
    const y = Number(v?.y)
    return Number.isFinite(x) && Number.isFinite(y) ? { x: Math.max(0, x), y: Math.max(0, y) } : null
  } catch {
    return null
  }
}

type NextHistoryState = { __N?: boolean; as?: unknown; key?: unknown }

/**
 * Where a popstate should scroll once its page mounts, or null when nothing
 * needs restoring: not a Next history entry, the same page (no remount, Next
 * handles it), or no saved position.
 */
export function restoreTargetFor(
  state: unknown,
  currentPageKey: string,
  storage: Pick<Storage, 'getItem'> | null | undefined,
): { pageKey: string; position: ScrollPosition } | null {
  const s = state as NextHistoryState | null
  if (!s || !s.__N || typeof s.as !== 'string') return null
  const pageKey = pageKeyOf(s.as)
  if (pageKey === currentPageKey) return null
  const position = readSavedScroll(storage, s.key)
  return position ? { pageKey, position } : null
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

let pending: { pageKey: string; position: ScrollPosition } | null = null

const sessionStore = (): Storage | null => {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** Records the target of each Back / Forward navigation while `enabled`. */
export function useDeferredScrollRestore(enabled: boolean, currentPageKey: string): void {
  const current = useRef(currentPageKey)
  useEffect(() => {
    current.current = currentPageKey
  }, [currentPageKey])

  useEffect(() => {
    if (!enabled) return
    const onPopState = (event: PopStateEvent) => {
      pending = restoreTargetFor(event.state, current.current, sessionStore())
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      pending = null
    }
  }, [enabled])
}

/**
 * Render inside the per-page keyed wrapper: on mount it applies the pending
 * Back / Forward position for this page (layout effect, so before paint) and
 * clears any stale one.
 */
export function RestoreScrollOnMount({ pageKey }: { pageKey: string }) {
  // The wrapper is keyed per page, so this runs once per page mount.
  useIsomorphicLayoutEffect(() => {
    const target = pending
    pending = null
    if (target && target.pageKey === pageKey) window.scrollTo(target.position.x, target.position.y)
  }, [pageKey])
  return null
}
