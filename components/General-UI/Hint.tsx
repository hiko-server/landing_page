import React, { cloneElement, createContext, useContext, useEffect, useId, useMemo, useRef } from 'react'
import { Box } from '@chakra-ui/react'
import { keyframes } from '@emotion/react'

/**
 * Lightweight tooltip: pure CSS show/hide on hover and keyboard focus, no
 * positioning engine (so no Popper in the page bundle).
 *
 *   <HintGroup>
 *     <Hint label="GitHub"><a …/></Hint>
 *     <Hint label="LinkedIn"><a …/></Hint>
 *   </HintGroup>
 *
 * - The child is cloned with `aria-describedby` pointing at the bubble
 *   (role="tooltip"); the bubble text is always in the DOM, so the
 *   description is available whether or not it is showing.
 * - It appears after 300 ms; inside a HintGroup, a hint opened within 400 ms
 *   of another one closing appears immediately.
 * - Escape dismisses it until the pointer / focus leaves (WCAG 1.4.13); the
 *   bubble is hoverable (an invisible bridge spans the gap to it).
 * - A bubble that would cross the viewport edge is shifted back inside, and
 *   long labels wrap (max 280px).
 * - While hidden it is `display: none`, so it never widens the page.
 * - Base look (surface, border, type, placement, forced colours) comes from
 *   the `.hint` rules in styles/globals.css; this file adds the behaviour.
 *   Reduced motion: the global rule makes the fade instant.
 */

type Placement = 'top' | 'left'

type GroupApi = {
  /** Called when a hint in the group closes. */
  closed: () => void
  /** Whether a hint in the group closed less than INSTANT_MS ago. */
  isInstant: () => boolean
}

const INSTANT_MS = 400
const SHOW_DELAY_MS = 300
const EDGE_PX = 8

const HintGroupContext = createContext<GroupApi | null>(null)

export function HintGroup({ children }: { children: React.ReactNode }) {
  const lastClosed = useRef(0)
  const api = useMemo<GroupApi>(
    () => ({
      closed: () => {
        lastClosed.current = Date.now()
      },
      isInstant: () => Date.now() - lastClosed.current < INSTANT_MS,
    }),
    [],
  )
  return <HintGroupContext.Provider value={api}>{children}</HintGroupContext.Provider>
}

const hintIn = keyframes`
  from { opacity: 0; transform: translateY(2px) scale(0.96); }
  to   { opacity: 1; transform: none; }
`

// No :has() here: one unsupported selector would void the whole rule.
const OPEN = '&:hover > .hint, & > :focus-visible ~ .hint'

const wrapSx = {
  '& > .hint': {
    display: 'none',
    width: 'max-content',
    maxWidth: 'min(280px, calc(100vw - 32px))',
    whiteSpace: 'normal',
    letterSpacing: 0,
    textTransform: 'none',
    textAlign: 'left',
    boxShadow: '0 6px 20px rgba(0,0,0,0.14)',
    // Bridge over the gap between the trigger and the bubble.
    '&::before': { content: '""', position: 'absolute', inset: '-8px' },
  },
  '& > .hint--top': { translate: 'calc(-50% + var(--hint-dx, 0px)) 0' },
  [OPEN]: {
    display: 'block',
    pointerEvents: 'auto',
    // An animation (not a transition) so it also runs out of display: none;
    // its delay is fixed per open, so it can never restart mid-way.
    animation: `${hintIn} 120ms var(--ease-out-quart) both`,
    animationDelay: `${SHOW_DELAY_MS}ms`,
  },
  '&[data-instant]:hover > .hint, &[data-instant] > :focus-visible ~ .hint': { animationDelay: '0ms' },
  '&[data-dismissed] > .hint': { display: 'none' },
} as const

export function Hint({
  label,
  placement = 'top',
  children,
}: {
  label: React.ReactNode
  placement?: Placement
  children: React.ReactElement
}) {
  const id = useId()
  const group = useContext(HintGroupContext)
  const wrapRef = useRef<HTMLSpanElement | null>(null)
  const tipRef = useRef<HTMLSpanElement | null>(null)
  const frame = useRef(0)

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const open = () => {
    const wrap = wrapRef.current
    if (!wrap) return
    wrap.removeAttribute('data-dismissed')
    wrap.toggleAttribute('data-instant', Boolean(group?.isInstant()))
    if (placement !== 'top') return
    // Keep the bubble inside the viewport (it is centred on the trigger).
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const tip = tipRef.current
      if (!tip) return
      tip.style.setProperty('--hint-dx', '0px')
      const r = tip.getBoundingClientRect()
      if (!r.width) return
      const vw = document.documentElement.clientWidth
      const dx = r.right > vw - EDGE_PX ? vw - EDGE_PX - r.right : r.left < EDGE_PX ? EDGE_PX - r.left : 0
      tip.style.setProperty('--hint-dx', `${Math.round(dx)}px`)
    })
  }

  const close = () => {
    wrapRef.current?.removeAttribute('data-dismissed')
    group?.closed()
  }

  const child = children as React.ReactElement<{ 'aria-describedby'?: string }>
  const describedBy = [child.props['aria-describedby'], id].filter(Boolean).join(' ')

  return (
    <Box
      as="span"
      ref={wrapRef}
      className="hint-wrap"
      sx={wrapSx}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={(e: React.FocusEvent<HTMLSpanElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close()
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLSpanElement>) => {
        if (e.key === 'Escape') wrapRef.current?.setAttribute('data-dismissed', '')
      }}
    >
      {cloneElement(child, { 'aria-describedby': describedBy })}
      <span ref={tipRef} id={id} role="tooltip" className={`hint hint--${placement}`}>
        {label}
      </span>
    </Box>
  )
}

export default Hint
