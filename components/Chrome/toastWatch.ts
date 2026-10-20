import { toastStore } from '@chakra-ui/react'

/**
 * Chakra's toast store, as the on-demand toast host sees it
 * (./AppChakraProvider.tsx, ./ToastHost.tsx).
 *
 * Chakra's store resets itself to "no toasts" whenever ANY listener
 * unsubscribes (toast.store.mjs), which would drop a toast raised just
 * before the host mounts (or re-subscribes, as React's Strict Mode does in
 * development). So this module subscribes to the store ONCE per page, never
 * unsubscribes, and fans changes out to its own listeners, which come and
 * go freely.
 */

export type ToastPlacement = 'top' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom' | 'bottom-right'

type ToastState = Record<string, unknown>

/** True when any placement of a store state holds a toast. */
export function stateHasToasts(state: ToastState | null | undefined): boolean {
  return !!state && Object.values(state).some((list) => Array.isArray(list) && list.length > 0)
}

export function hasPendingToasts(): boolean {
  return stateHasToasts(toastStore.getState() as ToastState)
}

const listeners = new Set<() => void>()
let subscribed = false

function ensureSubscribed() {
  if (subscribed) return
  subscribed = true
  toastStore.subscribe(() => {
    for (const listener of Array.from(listeners)) listener()
  })
}

/** Listen to store changes; the returned function stops listening WITHOUT clearing the store. */
export function subscribeToToasts(listener: () => void): () => void {
  ensureSubscribed()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Run `onFirstToast` once, as soon as a toast is raised (immediately if one is showing). */
export function watchToasts(onFirstToast: () => void): () => void {
  if (hasPendingToasts()) {
    onFirstToast()
    return () => undefined
  }
  const stop = subscribeToToasts(() => {
    if (!hasPendingToasts()) return
    stop()
    onFirstToast()
  })
  return stop
}

/** The fixed live region of one placement (Chakra's getToastListStyle, safe-area aware). */
export function toastListStyle(position: ToastPlacement): Record<string, string | undefined> {
  const centred = position === 'top' || position === 'bottom'
  return {
    position: 'fixed',
    zIndex: 'var(--toast-z-index, 5500)',
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    margin: centred ? '0 auto' : undefined,
    top: position.includes('top') ? 'env(safe-area-inset-top, 0px)' : undefined,
    bottom: position.includes('bottom') ? 'env(safe-area-inset-bottom, 0px)' : undefined,
    right: !position.includes('left') ? 'env(safe-area-inset-right, 0px)' : undefined,
    left: !position.includes('right') ? 'env(safe-area-inset-left, 0px)' : undefined,
  }
}

/** One toast's wrapper: aligned to its placement's edge (Chakra's getToastStyle). */
export function toastStackStyle(position: ToastPlacement): Record<string, string> {
  const alignItems = position.includes('right') ? 'flex-end' : position.includes('left') ? 'flex-start' : 'center'
  return { display: 'flex', flexDirection: 'column', alignItems }
}
