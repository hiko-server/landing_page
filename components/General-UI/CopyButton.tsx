import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Box } from '@chakra-ui/react'
import { copyText } from '../MDX/clipboard'

/**
 * Icon button that copies `value` to the clipboard.
 *
 *   - The copy and check glyphs sit in one grid cell and crossfade
 *     (opacity + scale .8 → 1 + blur 2px → 0, 150 ms), so the button never
 *     changes size; it returns to the copy glyph after 1.6 s.
 *   - The result is announced through a polite role="status" region
 *     (`srLabel` on success, 'Copy failed' otherwise). A failed copy also
 *     shows that text next to the button for sighted users.
 *   - No tooltip library (no Popper in the bundle): the accessible name is
 *     `label`, and the native title repeats it for mouse users.
 *
 * Transitions are transform / opacity / filter only; the global
 * prefers-reduced-motion rule makes them instant.
 */

type State = 'idle' | 'copied' | 'failed'

const RESET_MS = 1600
const ease = 'var(--ease-out-quart, cubic-bezier(0.22, 1, 0.36, 1))'

const layer = (shown: boolean) =>
  ({
    gridArea: '1 / 1',
    display: 'block',
    opacity: shown ? 1 : 0,
    transform: shown ? 'scale(1)' : 'scale(0.8)',
    filter: shown ? 'blur(0)' : 'blur(2px)',
    transition: `opacity 150ms ${ease}, transform 150ms ${ease}, filter 150ms ${ease}`,
  }) as const

function CopyGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  )
}

function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

function FailGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d="M7 7l10 10M17 7L7 17" />
    </svg>
  )
}

export default function CopyButton({
  value,
  label = 'Copy',
  srLabel = 'Copied',
}: {
  /** The text placed on the clipboard. */
  value: string
  /** Accessible name of the button, e.g. "Copy email address". */
  label?: string
  /** Announced after a successful copy, e.g. "Email copied". */
  srLabel?: string
}) {
  const [state, setState] = useState<State>('idle')
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    []
  )

  const onClick = useCallback(async () => {
    const ok = await copyText(value)
    setState(ok ? 'copied' : 'failed')
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      setState('idle')
    }, RESET_MS)
  }, [value])

  return (
    <Box as="span" position="relative" display="inline-flex" flexShrink={0}>
      <Box
        as="button"
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        display="inline-grid"
        placeItems="center"
        w="32px"
        h="32px"
        borderRadius="6px"
        color={
          state === 'copied' ? 'accent.text' : state === 'failed' ? 'red.600' : 'page.fg-secondary'
        }
        _dark={state === 'failed' ? { color: 'red.300' } : undefined}
        bg="transparent"
        cursor="pointer"
        transition={`color 150ms ${ease}, background-color 150ms ${ease}`}
        _hover={{ color: state === 'idle' ? 'page.fg' : undefined, bg: 'page.hover' }}
        _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
      >
        <Box as="span" display="grid" placeItems="center">
          <Box as="span" sx={layer(state === 'idle')}>
            <CopyGlyph />
          </Box>
          <Box as="span" sx={layer(state === 'copied')}>
            <CheckGlyph />
          </Box>
          <Box as="span" sx={layer(state === 'failed')}>
            <FailGlyph />
          </Box>
        </Box>
      </Box>
      {state === 'failed' ? (
        <Box
          as="span"
          aria-hidden
          position="absolute"
          right="calc(100% + 6px)"
          top="50%"
          transform="translateY(-50%)"
          whiteSpace="nowrap"
          px={2}
          py={1}
          borderRadius="6px"
          border="1px solid"
          borderColor="page.border"
          bg="page.bg-elevated"
          color="page.fg"
          fontSize="12px"
          lineHeight="1.3"
          pointerEvents="none"
        >
          Copy failed
        </Box>
      ) : null}
      <span role="status" className="sr-only">
        {state === 'copied' ? srLabel : state === 'failed' ? 'Copy failed' : ''}
      </span>
    </Box>
  )
}
