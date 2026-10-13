/**
 * Scroll reveals for the home and about sections and their row staggers —
 * one path, however the visitor arrived (direct load, a client-side
 * navigation, Back with a restored scroll position).
 *
 * Everything renders visible: the server HTML, the first client frame and
 * the view-transition snapshot of a route change all show the content that
 * is on screen. Only after that first frame, and only for a node that lies
 * entirely below the viewport (nobody can see it change), does the node
 * become "pending" (hidden, ready to rise); it is "shown" once it scrolls
 * into the reveal zone. A node in view, partly in view or above the
 * viewport stays "static" and never animates. Without IntersectionObserver
 * or under prefers-reduced-motion nothing is ever hidden.
 *
 * Framework-free so it is unit-tested; components use useScrollReveal.
 */

export type RevealPhase = 'static' | 'pending' | 'shown'

/** A pending node starts its reveal once its top passes 90% of the viewport height. */
export const REVEAL_ROOT_MARGIN = '0px 0px -10% 0px'

/** True when a node lies entirely below the viewport (it may start hidden: nobody can see it change). */
export function isBelowFold(rectTop: number, viewportHeight: number): boolean {
  return Number.isFinite(rectTop) && viewportHeight > 0 && rectTop >= viewportHeight
}

/** framer-motion variant label for a stagger container in `phase`. */
export function revealVariant(phase: RevealPhase): 'hidden' | 'show' {
  return phase === 'pending' ? 'hidden' : 'show'
}

type EntryLike = { isIntersecting: boolean; boundingClientRect: { top: number } }
type ObserverLike = { observe(target: unknown): void; disconnect(): void }
export type ObserverCtor = new (
  callback: (entries: EntryLike[]) => void,
  init: { rootMargin: string; threshold: number },
) => ObserverLike

export type RevealEnv = {
  IntersectionObserver?: ObserverCtor
  /** The layout viewport's height when an observation arrives (window.innerHeight). */
  viewportHeight: () => number
  reducedMotion: boolean
}

/**
 * Watches one node and reports its phase: 'pending' or 'static' on the first
 * observation, then 'shown' when a pending node enters the reveal zone.
 * Returns the cleanup.
 */
export function observeReveal(target: unknown, onPhase: (phase: RevealPhase) => void, env: RevealEnv): () => void {
  const Observer = env.IntersectionObserver
  if (env.reducedMotion || typeof Observer !== 'function') return () => undefined
  let decided = false
  let pending = false
  let done = false
  const observer = new Observer(
    (entries) => {
      for (const entry of entries) {
        if (done) return
        if (!decided) {
          decided = true
          pending = !entry.isIntersecting && isBelowFold(entry.boundingClientRect.top, env.viewportHeight())
          onPhase(pending ? 'pending' : 'static')
          if (!pending) {
            done = true
            observer.disconnect()
          }
          continue
        }
        if (pending && entry.isIntersecting) {
          done = true
          onPhase('shown')
          observer.disconnect()
        }
      }
    },
    { rootMargin: REVEAL_ROOT_MARGIN, threshold: 0 },
  )
  observer.observe(target)
  return () => {
    done = true
    observer.disconnect()
  }
}
