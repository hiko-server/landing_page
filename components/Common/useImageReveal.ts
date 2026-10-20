import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { DURATIONS } from '../../theme/tokens'
import { placeholderStyle, revealOnLoad, revealOnMount, type RevealState } from '../../lib/lqip'

/**
 * Blur-up for one image (C8). The server renders the blurred placeholder as
 * the background of the image's box, so it shows from the first paint with
 * no JavaScript and no layout shift (the box is already sized). After
 * hydration:
 *
 *   - an image the browser already has (cached, or it loaded before
 *     hydration) simply stays: no fade, the placeholder goes;
 *   - one still loading waits invisible over the placeholder and fades in
 *     once it has loaded (`data-lqip`: styles/globals.css; instant under
 *     prefers-reduced-motion), then the placeholder goes, so a transparent
 *     image never shows it through;
 *   - with `fade: false` (images in the first viewport, likely the LCP) the
 *     image paints over the placeholder as it arrives, never hidden;
 *   - a failed load drops the placeholder and shows the alt text.
 *
 * Returns the ref and attribute for the <img> and the style for its box.
 */
export function useImageReveal(
  placeholder: string | undefined | null,
  opts: { fade?: boolean; width?: number | null; height?: number | null; fit?: 'cover' | 'fill'; position?: string } = {},
): { ref: React.RefObject<HTMLImageElement>; imgProps: { 'data-lqip'?: RevealState }; boxStyle: CSSProperties } {
  const fade = opts.fade !== false
  const ref = useRef<HTMLImageElement>(null)
  const [state, setState] = useState<RevealState>('idle')
  const enabled = !!placeholder

  useEffect(() => {
    if (!enabled) return
    const img = ref.current
    if (!img) return
    const first = revealOnMount(img.complete, fade)
    setState(first)
    if (first === 'shown') return
    const done = () => setState((s) => revealOnLoad(s, fade))
    img.addEventListener('load', done)
    img.addEventListener('error', done)
    return () => {
      img.removeEventListener('load', done)
      img.removeEventListener('error', done)
    }
  }, [enabled, fade])

  // After the fade, the placeholder is no longer needed behind the image.
  useEffect(() => {
    if (state !== 'reveal') return
    const timer = window.setTimeout(() => setState('shown'), DURATIONS.base + 50)
    return () => window.clearTimeout(timer)
  }, [state])

  if (!enabled) return { ref, imgProps: {}, boxStyle: {} }
  return {
    ref,
    imgProps: { 'data-lqip': state },
    boxStyle: state === 'shown' ? {} : (placeholderStyle(placeholder, opts) as CSSProperties),
  }
}
