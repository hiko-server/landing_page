import type { ReactNode } from 'react'
import { LazyMotion, MotionConfig } from 'framer-motion'
import { loadMotionFeatures } from '../../lib/motionFeatures'

/**
 * framer-motion for the whole app (G5): every component renders through the
 * lightweight `m` element and the animation features — the engine,
 * gestures, drag and layout animations — arrive in a chunk of their own,
 * requested while the page hydrates (lib/motionFeatures.ts). Every
 * animation honours prefers-reduced-motion (`reducedMotion="user"`: no
 * movement, opacity changes only).
 */
export default function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadMotionFeatures}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}
