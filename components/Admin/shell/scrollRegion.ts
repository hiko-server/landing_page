import { useEffect, useState } from 'react'

/**
 * A table (or any box) wider than its container scrolls sideways — on a
 * phone, the admin's analytics and storage tables do. A keyboard can only
 * scroll a region it can focus (WCAG 2.1.1; axe scrollable-region-focusable),
 * so while the box overflows it becomes a named, focusable region (Tab to it,
 * then ← / →), with a visible focus ring. When everything fits it is a plain
 * box again and adds no tab stop.
 */

/** True when content is wider than the box (a 1px rounding slack). */
export function overflowsX(scrollWidth: number, clientWidth: number): boolean {
  return clientWidth > 0 && scrollWidth - clientWidth > 1
}

export type ScrollRegionProps = { tabIndex?: 0; role?: 'region'; 'aria-label'?: string }

/** The attributes of a scroll box: a focusable, labelled region only while it overflows. */
export function scrollRegionProps(overflowing: boolean, label: string): ScrollRegionProps {
  return overflowing ? { tabIndex: 0, role: 'region', 'aria-label': label } : {}
}

/** Focus ring of a scroll region (just outside its rounded border). */
export const SCROLL_REGION_FOCUS = { outline: '2px solid', outlineColor: 'accent.500', outlineOffset: '2px' } as const

/**
 * Watches a scroll box and returns a callback ref for it plus its region
 * attributes (see the module comment). A callback ref, so a box that mounts
 * later (a table shown once there are rows) is watched too.
 */
export function useScrollRegion(label: string): [(el: HTMLElement | null) => void, ScrollRegionProps] {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [overflowing, setOverflowing] = useState(false)
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') {
      setOverflowing(false)
      return
    }
    const check = () => setOverflowing(overflowsX(el.scrollWidth, el.clientWidth))
    const observer = new ResizeObserver(check)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    check()
    return () => observer.disconnect()
  }, [el])
  return [setEl, scrollRegionProps(overflowing, label)]
}
