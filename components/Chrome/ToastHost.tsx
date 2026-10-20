import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { Portal, chakra, toastStore } from '@chakra-ui/react'
import { AnimatePresence, m, useIsPresent, type Variants } from 'framer-motion'
import { motionTransition } from '../../theme/tokens'
import { subscribeToToasts, toastListStyle, toastStackStyle, type ToastPlacement } from './toastWatch'

/**
 * The toast host, in a chunk of its own (AppChakraProvider loads it once the
 * page is idle, or when the first toast is raised).
 *
 * It renders Chakra's toast store (`useToast()` / `toastStore.notify`) the
 * way Chakra's ToastProvider does — one polite live region per placement,
 * newest toast first at the top / last at the bottom, auto-dismiss after the
 * toast's duration with the timer paused while a pointer rests on it, the
 * toast's own close button, `requestClose`, `onCloseComplete` — but each
 * toast is an `m.div` animated with the LazyMotion features (G5), where
 * Chakra's own provider uses the full `motion` element: importing it would
 * put all of framer-motion back into the shared bundle (its module also
 * holds the toast-options context every `useToast` reads).
 *
 * Enter: fade and a short slide from the toast's edge; exit: fade and shrink;
 * the stack reflows with a layout animation. MotionConfig in pages/_app
 * drops the movement under prefers-reduced-motion.
 */

type StoredToast = {
  id: string | number
  message: ReactNode | ((props: { id: string | number; onClose: () => void }) => ReactNode)
  position: ToastPlacement
  duration?: number | null
  onCloseComplete?: () => void
  onRequestRemove: () => void
  requestClose?: boolean
  containerStyle?: Record<string, unknown>
}

type StoreState = Record<ToastPlacement, StoredToast[]>

const ENTER = motionTransition('slow')
const EXIT = motionTransition('fast')

const variants: Variants = {
  initial: (custom: { position: ToastPlacement }) => {
    const { position } = custom
    const axis = position === 'top' || position === 'bottom' ? 'y' : 'x'
    let factor = position === 'top-right' || position === 'bottom-right' ? 1 : -1
    if (position === 'bottom') factor = 1
    return { opacity: 0, [axis]: factor * 24 }
  },
  animate: { opacity: 1, x: 0, y: 0, scale: 1, transition: ENTER },
  exit: { opacity: 0, scale: 0.85, transition: EXIT },
}

const Toast = memo(function Toast(props: StoredToast) {
  const { id, message, onCloseComplete, onRequestRemove, requestClose = false, position, duration = 5000, containerStyle } = props
  const [delay, setDelay] = useState<number | null>(duration)
  const isPresent = useIsPresent()
  const mounted = useRef(false)

  // Removed from the store and its exit animation finished.
  useEffect(() => {
    if (mounted.current && !isPresent) onCloseComplete?.()
  }, [isPresent, onCloseComplete])
  useEffect(() => {
    if (mounted.current) setDelay(duration)
  }, [duration])
  useEffect(() => {
    mounted.current = true
  }, [])

  const close = () => {
    if (isPresent) onRequestRemove()
  }
  useEffect(() => {
    if (isPresent && requestClose) onRequestRemove()
  }, [isPresent, requestClose, onRequestRemove])
  // Auto-dismiss; paused (null) while hovered, a `null` duration never dismisses.
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (delay === null || delay === undefined) return
    const timer = window.setTimeout(() => closeRef.current(), delay)
    return () => window.clearTimeout(timer)
  }, [delay])

  const inner = useMemo(() => ({ pointerEvents: 'auto' as const, maxWidth: 560, minWidth: 300, margin: '0.5rem', ...containerStyle }), [containerStyle])
  const stack = useMemo(() => toastStackStyle(position) as CSSProperties, [position])

  return (
    <m.div
      layout
      className="chakra-toast"
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      custom={{ position }}
      onHoverStart={() => setDelay(null)}
      onHoverEnd={() => setDelay(duration)}
      style={stack}
    >
      <chakra.div role="status" aria-atomic="true" className="chakra-toast__inner" __css={inner}>
        {typeof message === 'function' ? message({ id, onClose: close }) : message}
      </chakra.div>
    </m.div>
  )
})

export default function ToastHost() {
  const state = useSyncExternalStore(
    subscribeToToasts,
    () => toastStore.getState() as unknown as StoreState,
    () => toastStore.getState() as unknown as StoreState,
  )
  return (
    <Portal>
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
              <Toast key={toast.id} {...toast} />
            ))}
          </AnimatePresence>
        </div>
      ))}
    </Portal>
  )
}
