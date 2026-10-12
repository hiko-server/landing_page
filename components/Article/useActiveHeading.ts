import { useEffect, useState } from 'react'

/** Distance from the viewport top at which a heading becomes "current" (sticky header + air). */
export const HEADING_OFFSET = 96

/**
 * Id of the section the reader is in: the last heading whose top has passed
 * HEADING_OFFSET. Re-evaluated only when a heading (or the article end
 * sentinel) crosses that line, via IntersectionObserver — no per-frame
 * scroll handler. At the end of the article the last heading wins even if
 * its section is too short to reach the line.
 */
export function useActiveHeading(ids: readonly string[], endId = 'article-end'): string | null {
  const [active, setActive] = useState<string | null>(null)
  const key = ids.join('\n')

  useEffect(() => {
    const els = key
      .split('\n')
      .map((id) => (id ? document.getElementById(id) : null))
      .filter((el): el is HTMLElement => !!el)
    if (!els.length || typeof IntersectionObserver === 'undefined') return
    const end = document.getElementById(endId)

    let frame = 0
    const compute = () => {
      frame = 0
      let current: string | null = null
      for (const el of els) {
        if (el.getBoundingClientRect().top - HEADING_OFFSET <= 1) current = el.id
        else break
      }
      const last = els[els.length - 1]
      if (end && end.getBoundingClientRect().top <= window.innerHeight && last.getBoundingClientRect().top < window.innerHeight) {
        current = last.id
      }
      setActive(current)
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(compute)
    }

    const io = new IntersectionObserver(schedule, {
      rootMargin: `-${HEADING_OFFSET}px 0px 0px 0px`,
      threshold: [0, 1],
    })
    els.forEach((el) => io.observe(el))
    if (end) io.observe(end)
    window.addEventListener('hashchange', schedule)
    compute()
    return () => {
      io.disconnect()
      window.removeEventListener('hashchange', schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [key, endId])

  return active
}

/** Scroll to an in-page section, honouring reduced motion, and move focus there. */
export function jumpToSection(id: string): void {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
  // Keep the fragment shareable without adding a history entry per jump.
  window.history.replaceState(window.history.state, '', `#${encodeURIComponent(id)}`)
}
