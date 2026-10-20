import type { FeatureBundle } from 'framer-motion'

/**
 * framer-motion's animation features, loaded on demand (G5).
 *
 * Every component renders through the lightweight `m` element inside
 * <LazyMotion features={loadMotionFeatures}> (components/Chrome/MotionProvider.tsx,
 * around the whole app), so the shared bundle carries only the renderer
 * core. The features themselves — the
 * animation engine, gestures, drag (the lightbox's swipe-to-close) and
 * layout animations (the header's active-link underline, the photo strip's
 * shared-element zoom) — are `domMax` in a chunk of their own
 * (./motionFeatureBundle.ts).
 *
 * The request starts as soon as the app's bundle runs in the browser, in
 * parallel with hydration, so the features are normally in place by the
 * time LazyMotion asks for them. Until they arrive an `m` element renders
 * its `initial` state exactly like `motion` does on the server; once they
 * load, LazyMotion re-renders and pending enter animations run. One failed
 * request (a flaky connection) is retried once.
 *
 * Public code must not import `motion` from framer-motion (lint enforces
 * it): a `motion` element carries every feature with it and would put the
 * whole library back into the page's first-load JavaScript.
 */

let pending: Promise<FeatureBundle> | null = null

const importFeatures = () => import('./motionFeatureBundle').then((mod) => mod.default)

export function loadMotionFeatures(): Promise<FeatureBundle> {
  pending ??= importFeatures().catch(() => importFeatures())
  return pending
}

if (typeof window !== 'undefined') {
  loadMotionFeatures().catch(() => {
    // LazyMotion asks again on mount and reports a second failure itself.
    pending = null
  })
}
