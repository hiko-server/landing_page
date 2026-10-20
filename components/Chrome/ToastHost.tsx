import { useEffect, useRef, useSyncExternalStore, type CSSProperties, type MutableRefObject } from 'react'
import { Portal, toastStore, type ToastOptions } from '@chakra-ui/react'
import { AnimatePresence, LazyMotion, MotionConfig } from 'framer-motion'
import UnifiedToast from '../Common/UnifiedToast'
import { loadMotionFeatures } from '../../lib/motionFeatures'
import { subscribeToToasts, toastListStyle, TOAST_STACK_VAR, type ToastPlacement } from './toastWatch'

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
 *
 * The host sits beside the page in AppChakraProvider, outside the app's
 * MotionProvider, so it brings its own LazyMotion (the same feature chunk,
 * lib/motionFeatures — already loaded by then) and MotionConfig: without
 * them an `m` element never gets the animation engine and every toast stayed
 * in its `initial` state — opacity 0, invisible — and reduced motion was not
 * honoured.
 *
 * The bottom placements sit above a page's sticky bottom bar
 * (./toastWatch.ts toastListStyle), and their height is published as
 * --toast-stack-h while a toast is shown there, so the scroll-to-top button
 * in the same corner of a narrow screen moves up instead of being covered.
 */

type StoreState = Record<ToastPlacement, ToastOptions[]>

const getState = () => toastStore.getState() as unknown as StoreState

const BOTTOM_PLACEMENTS: readonly ToastPlacement[] = ['bottom', 'bottom-left', 'bottom-right']

/** Keeps --toast-stack-h on <html> at the height of the tallest bottom placement (removed while none shows a toast). */
function usePublishBottomStack(regions: MutableRefObject<Map<ToastPlacement, HTMLElement>>) {
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const root = document.documentElement
    const apply = () => {
      let h = 0
      for (const position of BOTTOM_PLACEMENTS) h = Math.max(h, Math.ceil(regions.current.get(position)?.getBoundingClientRect().height ?? 0))
      if (h > 0) root.style.setProperty(TOAST_STACK_VAR, `${h}px`)
      else root.style.removeProperty(TOAST_STACK_VAR)
    }
    const observer = new ResizeObserver(apply)
    for (const position of BOTTOM_PLACEMENTS) {
      const el = regions.current.get(position)
      if (el) observer.observe(el)
    }
    apply()
    return () => {
      observer.disconnect()
      root.style.removeProperty(TOAST_STACK_VAR)
    }
  }, [regions])
}

/** The live regions with their toasts (the host's content, without the portal). */
export function ToastRegions() {
  const state = useSyncExternalStore(subscribeToToasts, getState, getState)
  const regions = useRef(new Map<ToastPlacement, HTMLElement>())
  usePublishBottomStack(regions)
  return (
    <>
      {(Object.keys(state) as ToastPlacement[]).map((position) => (
        <div
          key={position}
          ref={(el) => {
            if (el) regions.current.set(position, el)
            else regions.current.delete(position)
          }}
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
    <LazyMotion features={loadMotionFeatures}>
      <MotionConfig reducedMotion="user">
        <Portal>
          <ToastRegions />
        </Portal>
      </MotionConfig>
    </LazyMotion>
  )
}
