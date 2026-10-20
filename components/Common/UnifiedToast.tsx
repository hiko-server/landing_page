import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { chakra, type ToastOptions } from '@chakra-ui/react'
import { m, useIsPresent, type Variants } from 'framer-motion'
import { createPausableClock, toastDuration, toastRole } from '../../lib/notify'
import { motionTransition } from '../../theme/tokens'

/**
 * The element of every toast (ChakraProvider toastOptions.component, set in
 * pages/_app): Chakra's own toast frame with one timing policy (lib/notify)
 * — errors stay until dismissed, successes and notes stay long enough to
 * read — and a timer that pauses while the pointer is over the toast, while
 * focus is inside it and while the page is hidden, then resumes with the
 * time that was left. Errors are announced as alerts, the rest politely.
 * Motion follows MotionConfig (reduced motion: no slide).
 */

const variants: Variants = {
  initial: (props: { position: string }) => {
    const { position } = props
    const dir = ['top', 'bottom'].includes(position) ? 'y' : 'x'
    let factor = ['top-right', 'bottom-right'].includes(position) ? 1 : -1
    if (position === 'bottom') factor = 1
    return { opacity: 0, [dir]: factor * 24 }
  },
  animate: { opacity: 1, y: 0, x: 0, scale: 1, transition: motionTransition('base') },
  exit: { opacity: 0, scale: 0.95, transition: motionTransition('fast') },
}

function alignFor(position: string) {
  const alignItems = position.includes('right') ? 'flex-end' : position.includes('left') ? 'flex-start' : 'center'
  return { display: 'flex', flexDirection: 'column' as const, alignItems }
}

type Props = ToastOptions & { motionVariants?: Variants }

function UnifiedToastImpl(props: Props) {
  const { id, message, onCloseComplete, onRequestRemove, requestClose = false, position = 'bottom', status, containerStyle, motionVariants = variants } = props
  const duration = toastDuration(status, props.duration)
  const isPresent = useIsPresent()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pausedBy = useRef(new Set<string>())
  const clock = useRef<ReturnType<typeof createPausableClock> | null>(null)

  const close = useCallback(() => {
    if (isPresent) onRequestRemove()
  }, [isPresent, onRequestRemove])
  const closeRef = useRef(close)
  closeRef.current = close

  const schedule = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => closeRef.current(), ms)
  }, [])

  // (Re)start whenever the duration changes (a toast.update can change status).
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (duration === null) {
      clock.current = null
      return
    }
    clock.current = createPausableClock(duration)
    if (pausedBy.current.size) clock.current.pause()
    else schedule(duration)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [duration, schedule])

  const pause = useCallback((reason: string) => {
    pausedBy.current.add(reason)
    if (!clock.current || clock.current.paused) return
    clock.current.pause()
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])
  const resume = useCallback(
    (reason: string) => {
      pausedBy.current.delete(reason)
      if (pausedBy.current.size || !clock.current || !clock.current.paused) return
      schedule(clock.current.resume())
    },
    [schedule],
  )

  useEffect(() => {
    const onVisibility = () => (document.visibilityState === 'hidden' ? pause('hidden') : resume('hidden'))
    if (document.visibilityState === 'hidden') pause('hidden')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [pause, resume])

  useEffect(() => {
    if (!isPresent) onCloseComplete?.()
  }, [isPresent, onCloseComplete])

  useEffect(() => {
    if (isPresent && requestClose) onRequestRemove()
  }, [isPresent, requestClose, onRequestRemove])

  const containerStyles = useMemo(
    () => ({ pointerEvents: 'auto' as const, maxWidth: 560, minWidth: 300, margin: '0.5rem', ...containerStyle }),
    [containerStyle],
  )

  return (
    <m.div
      layout
      className="chakra-toast"
      variants={motionVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      onHoverStart={() => pause('hover')}
      onHoverEnd={() => resume('hover')}
      onFocus={() => pause('focus')}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) resume('focus')
      }}
      custom={{ position }}
      style={alignFor(position)}
      data-toast-status={status || 'default'}
      data-toast-persistent={duration === null ? '' : undefined}
    >
      <chakra.div role={toastRole(status)} aria-atomic="true" className="chakra-toast__inner" __css={containerStyles}>
        {typeof message === 'function' ? message({ id, onClose: close }) : message}
      </chakra.div>
    </m.div>
  )
}

const UnifiedToast = memo(UnifiedToastImpl)
UnifiedToast.displayName = 'UnifiedToast'
export default UnifiedToast
