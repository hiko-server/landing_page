import { useSyncExternalStore, type CSSProperties } from 'react'
import { Portal, toastStore, type ToastOptions } from '@chakra-ui/react'
import { AnimatePresence } from 'framer-motion'
import UnifiedToast from '../Common/UnifiedToast'
import { subscribeToToasts, toastListStyle, type ToastPlacement } from './toastWatch'

/**
 * The toast host, in a chunk of its own (AppChakraProvider loads it once the
 * page is idle, or when the first toast is raised).
 *
 * It renders Chakra's toast store (`useToast()` / `toastStore.notify`) the
 * way Chakra's ToastProvider does — one polite live region per placement,
 * newest toast first at the top / last at the bottom — and each toast is the
 * site's one toast frame, components/Common/UnifiedToast: the timing policy
 * of lib/notify (errors and loading toasts stay until dismissed, successes
 * and notes long enough to read, the timer paused on hover, focus and a
 * hidden tab), errors announced as alerts, `requestClose` and
 * `onCloseComplete`, animated with the LazyMotion features (G5) — Chakra's
 * own provider uses the full `motion` element, and importing it would put
 * all of framer-motion back into the shared bundle (its module also holds
 * the toast-options context every `useToast` reads).
 *
 * The frame is part of this chunk, not a chunk of its own: a toast raised
 * before the host has loaded appears once, already in its final frame and
 * with its whole duration (it waits in the store meanwhile, see
 * ./toastWatch.ts), never in a stand-in frame first.
 */

type StoreState = Record<ToastPlacement, ToastOptions[]>

const getState = () => toastStore.getState() as unknown as StoreState

/** The live regions with their toasts (the host's content, without the portal). */
export function ToastRegions() {
  const state = useSyncExternalStore(subscribeToToasts, getState, getState)
  return (
    <>
      {(Object.keys(state) as ToastPlacement[]).map((position) => (
        <div
          key={position}
          role="region"
          aria-live="polite"
          aria-label={`Notifications-${position}`}
          id={`chakra-toast-manager-${position}`}
          style={toastListStyle(position) as CSSProperties}
        >
          <AnimatePresence initial={false}>
            {state[position].map((toast) => (
              <UnifiedToast key={toast.id} {...toast} />
            ))}
          </AnimatePresence>
        </div>
      ))}
    </>
  )
}

export default function ToastHost() {
  return (
    <Portal>
      <ToastRegions />
    </Portal>
  )
}
