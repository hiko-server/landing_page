import { useCallback, useEffect, useState } from 'react'
import { observeReveal, type ObserverCtor, type RevealPhase } from '../../lib/reveal'
import { prefersReducedMotion } from '../../lib/viewTransition'

/**
 * Scroll-reveal phase of one element (lib/reveal.ts): attach `ref` to the
 * element; `phase` is 'static' (visible, no animation) until the first
 * observation after mount, 'pending' while it waits below the fold and
 * 'shown' once it scrolled into view. A callback ref, so an element that
 * appears later (data loaded) or is replaced is observed afresh.
 */
export function useScrollReveal<T extends Element = HTMLElement>(): { ref: (el: T | null) => void; phase: RevealPhase } {
  const [node, setNode] = useState<T | null>(null)
  const [phase, setPhase] = useState<RevealPhase>('static')
  const ref = useCallback((el: T | null) => setNode(el), [])

  useEffect(() => {
    if (!node) return
    return observeReveal(node, setPhase, {
      IntersectionObserver: typeof IntersectionObserver === 'undefined' ? undefined : (IntersectionObserver as unknown as ObserverCtor),
      viewportHeight: () => window.innerHeight,
      reducedMotion: prefersReducedMotion(),
    })
  }, [node])

  return { ref, phase }
}
