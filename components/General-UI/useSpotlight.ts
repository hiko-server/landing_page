import { useEffect, type RefObject } from 'react'

/**
 * Cursor-lit card borders.
 *
 * One passive `pointermove` listener on the container (not one per card),
 * throttled to one write per animation frame. It finds the card under the
 * pointer (`[data-spotlight]`) and writes the pointer position, relative to
 * that card, into its `--mx` / `--my` custom properties. The `.spotlight`
 * class in styles/globals.css paints a radial accent gradient at that point
 * on a 1px masked ring, so React never re-renders on pointer movement.
 *
 * The listener is attached only on devices with a fine, hovering pointer
 * and when the visitor has not asked for reduced motion; it follows changes
 * to either media query and is removed on unmount.
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null)
 *   useSpotlight(ref)
 *   <div ref={ref}>
 *     <article className="spotlight" data-spotlight>…</article>
 *   </div>
 */

export type Point = { x: number; y: number }

/** Pointer position relative to a box's top-left corner, rounded to whole px. */
export function relativePoint(rect: { left: number; top: number }, clientX: number, clientY: number): Point {
  return { x: Math.round(clientX - rect.left), y: Math.round(clientY - rect.top) }
}

const FINE_POINTER = '(hover: hover) and (pointer: fine)'
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

function attach(root: HTMLElement): () => void {
  let frame = 0
  let target: EventTarget | null = null
  let x = 0
  let y = 0

  const paint = () => {
    frame = 0
    if (!(target instanceof Element)) return
    const card = target.closest<HTMLElement>('[data-spotlight]')
    if (!card || !root.contains(card)) return
    const p = relativePoint(card.getBoundingClientRect(), x, y)
    card.style.setProperty('--mx', `${p.x}px`)
    card.style.setProperty('--my', `${p.y}px`)
  }

  const onMove = (e: PointerEvent) => {
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
    target = e.target
    x = e.clientX
    y = e.clientY
    if (!frame) frame = requestAnimationFrame(paint)
  }

  root.addEventListener('pointermove', onMove, { passive: true })
  return () => {
    root.removeEventListener('pointermove', onMove)
    if (frame) cancelAnimationFrame(frame)
  }
}

export function useSpotlight(ref: RefObject<HTMLElement>): void {
  useEffect(() => {
    const root = ref.current
    if (!root || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const fine = window.matchMedia(FINE_POINTER)
    const reduce = window.matchMedia(REDUCED_MOTION)
    let detach: (() => void) | null = null

    const sync = () => {
      const wanted = fine.matches && !reduce.matches
      if (wanted && !detach) detach = attach(root)
      else if (!wanted && detach) {
        detach()
        detach = null
      }
    }

    sync()
    fine.addEventListener('change', sync)
    reduce.addEventListener('change', sync)
    return () => {
      fine.removeEventListener('change', sync)
      reduce.removeEventListener('change', sync)
      if (detach) detach()
    }
  }, [ref])
}

export default useSpotlight
