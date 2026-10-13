import React, { useEffect, useRef, useState } from 'react'

/**
 * Height disclosure without measuring: a one-cell grid whose row animates
 * between 0fr and 1fr (240ms, site easing). The inner wrapper clips the
 * content while the row is moving and stops clipping once it is fully open,
 * so focus rings inside the panel are never cut off.
 *
 * - The content is always in the DOM (so `aria-controls` can point at it and
 *   server-rendered text stays indexable); while closed the panel is `inert`,
 *   which removes it from the tab order and the accessibility tree.
 * - The grid rules are the `.collapse` block in styles/globals.css; the
 *   global reduced-motion rule makes the transition instant for visitors who
 *   ask for it.
 *
 *   <button aria-expanded={open} aria-controls={id} onClick={…}>More</button>
 *   <Collapse open={open} id={id}>…</Collapse>
 */
export function Collapse({ open, id, children }: { open: boolean; id?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  // True once an open panel has finished growing (or was open from the start).
  const [settled, setSettled] = useState(open)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open) el.removeAttribute('inert')
    else {
      el.setAttribute('inert', '')
      setSettled(false)
    }
  }, [open])

  return (
    <div
      ref={ref}
      id={id}
      className="collapse"
      data-open={open ? 'true' : 'false'}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && e.propertyName === 'grid-template-rows' && open) setSettled(true)
      }}
    >
      <div style={open && settled ? { overflow: 'visible' } : undefined}>{children}</div>
    </div>
  )
}

export default Collapse
