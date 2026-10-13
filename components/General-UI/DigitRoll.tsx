import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Box, Text, type SystemStyleObject } from '@chakra-ui/react'
import { useInView, useReducedMotion } from 'framer-motion'

/**
 * The 0–9 strip of one digit column, as generated content: the digits are
 * painted by CSS, so the DOM text (copy, reader mode, crawlers) is only the
 * real value in the sr-only span next to it.
 */
const stripSx = {
  '&::before': {
    content: '"0\\A 1\\A 2\\A 3\\A 4\\A 5\\A 6\\A 7\\A 8\\A 9"',
    whiteSpace: 'pre',
  },
}

/**
 * Without JavaScript the columns would stay at 0: show the final digits.
 * An author `!important` declaration beats the non-important inline --d.
 * Render it once per widget, inside <noscript>.
 */
export const DIGIT_ROLL_NO_SCRIPT_CSS = '.stat-roll .digit>span{--d:var(--f)!important}'

type DigitStyle = React.CSSProperties & { '--d': number; '--f': number; '--i': number }

// useLayoutEffect on the client (runs before paint), a no-op on the server.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * A number that rolls into place: each digit is a `.digit` column whose
 * inner strip translates to the digit (globals.css: 900 ms, 60 ms stagger
 * per column).
 *
 * The server renders the FINAL digits, so crawlers, link previews, slow
 * hydrations and visitors who already see the number never read "00". Only
 * a number that is still below the fold when the page hydrates is reset to 0
 * (before paint, while off-screen) and rolls up as it scrolls into view.
 * Reduced motion never animates. `sx` sets the type (size, weight, colour).
 */
export default function DigitRoll({ value, sx }: { value: number; sx?: SystemStyleObject }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.3 })
  const reduce = useReducedMotion()
  const [rolled, setRolled] = useState(true)
  const armed = useRef(false)
  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el || reduce || armed.current) return
    armed.current = true
    if (el.getBoundingClientRect().top > window.innerHeight) setRolled(false)
  }, [reduce])
  useEffect(() => {
    if (inView || reduce) setRolled(true)
  }, [inView, reduce])

  const text = Math.max(0, Math.floor(value)).toLocaleString('en-US')
  let digitIndex = 0
  return (
    <Text as="span" ref={ref} className="stat-roll tnum" display="inline-flex" sx={{ fontVariantNumeric: 'tabular-nums', ...sx }}>
      <span aria-hidden style={{ display: 'inline-flex' }}>
        {Array.from(text).map((ch, i) => {
          if (ch < '0' || ch > '9') return <span key={i}>{ch}</span>
          const d = Number(ch)
          const style: DigitStyle = { '--d': rolled ? d : 0, '--f': d, '--i': digitIndex++ }
          return (
            <span key={i} className="digit">
              <Box as="span" style={style} sx={stripSx} />
            </span>
          )
        })}
      </span>
      <span className="sr-only">{text}</span>
    </Text>
  )
}
