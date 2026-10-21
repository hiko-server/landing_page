import { useCallback, useEffect, useState } from 'react'
import { observeReveal, type ObserverCtor, type RevealPhase } from '../../lib/reveal'
import { loadMotionFeatures } from '../../lib/motionFeatures'
import { prefersReducedMotion } from '../../lib/viewTransition'

export type ScrollRevealOptions = {
  /**
   * The phase drives framer-motion variants (a row stagger: `m.*` with
   * `initial={false}` and `animate={revealVariant(phase)}`): decide it only
   * once LazyMotion's features are in place and have rendered. An `m`
   * element that gets its features in the same update as its change to
   * 'hidden' takes that change as its blocked initial animation — framer
   * records the variant without applying it — so on a cold first visit
   * (features still loading when the first observation arrives) the rows
   * would never hide and never rise. Waiting is invisible: only a node that
   * is still wholly below the viewport at the decision is hidden.
   */
  afterMotionFeatures?: boolean
}

/** Two frames: the LazyMotion re-render that the features' arrival schedules has committed by then. */
function afterTwoFrames(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

/**
 * Scroll-reveal phase of one element (lib/reveal.ts): attach `ref` to the
 * element; `phase` is 'static' (visible, no animation) until the first
 * observation after mount, 'pending' while it waits below the fold and
 * 'shown' once it scrolled into view. A callback ref, so an element that
 * appears later (data loaded) or is replaced is observed afresh.
 */
export function useScrollReveal<T extends Element = HTMLElement>(
  options: ScrollRevealOptions = {},
): { ref: (el: T | null) => void; phase: RevealPhase } {
  const [node, setNode] = useState<T | null>(null)
  const [phase, setPhase] = useState<RevealPhase>('static')
  const ref = useCallback((el: T | null) => setNode(el), [])
  const { afterMotionFeatures = false } = options

  useEffect(() => {
    if (!node) return
    const observe = () =>
      observeReveal(node, setPhase, {
        IntersectionObserver: typeof IntersectionObserver === 'undefined' ? undefined : (IntersectionObserver as unknown as ObserverCtor),
        viewportHeight: () => window.innerHeight,
        reducedMotion: prefersReducedMotion(),
      })
    if (!afterMotionFeatures) return observe()
    let stop: (() => void) | null = null
    let cancelled = false
    loadMotionFeatures()
      .then(afterTwoFrames)
      .then(() => {
        if (!cancelled) stop = observe()
      })
      // Without the features nothing animates: the rows stay visible ('static').
      .catch(() => undefined)
    return () => {
      cancelled = true
      stop?.()
    }
  }, [node, afterMotionFeatures])

  return { ref, phase }
}
