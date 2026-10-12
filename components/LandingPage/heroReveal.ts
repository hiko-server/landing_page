import { keyframes } from '@emotion/react'

/**
 * Hero entrance: a short staggered rise (6px + fade) on the site easing.
 *
 * CSS keyframes rather than framer-motion so the server-rendered HTML
 * animates on first paint — no JS gate keeping the headline invisible until
 * hydration (which would delay LCP). Reduced motion turns it off entirely.
 */
const rise = keyframes`
  from { opacity: 0; transform: translate3d(0, 6px, 0); }
  to   { opacity: 1; transform: none; }
`

/** Gentle settle for the portrait — transform only, so the LCP image is never transparent. */
const settle = keyframes`
  from { transform: translate3d(0, 8px, 0) scale(0.985); }
  to   { transform: none; }
`

const STEP_MS = 70

export function revealSx(step: number) {
  return {
    animation: `${rise} 640ms cubic-bezier(0.22, 1, 0.36, 1) both`,
    animationDelay: `${step * STEP_MS}ms`,
    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
  }
}

export function settleSx(step: number) {
  return {
    animation: `${settle} 820ms cubic-bezier(0.22, 1, 0.36, 1) both`,
    animationDelay: `${step * STEP_MS}ms`,
    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
  }
}
