import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Box, Flex, Text } from '@chakra-ui/react'
import { computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom'
import { MONO } from '../shell/ui'

/**
 * A small WAI-ARIA menu for the visual editor's blocks (the callout's type,
 * the block handle's actions). Built here rather than on Chakra's Menu: it
 * lives inside TipTap node views, which render through their own portals,
 * and needs to open, position and close the same way every time.
 *
 *   - trigger: a button with aria-haspopup / aria-expanded / aria-controls;
 *     click, Enter, Space or ↓ opens it (focus goes to the checked or first
 *     item);
 *   - list: role="menu", items "menuitem" or "menuitemradio" (aria-checked),
 *     ↑ ↓ Home End move, Enter / Space choose, Esc closes and returns focus
 *     to the trigger, Tab or a click outside closes;
 *   - positioned with Floating UI (flip, shift) in a body portal; fades in
 *     over 120 ms, instantly under reduced motion.
 */

export type PopMenuItem =
  | { kind: 'item' | 'radio'; key: string; label: string; icon?: React.ReactNode; checked?: boolean; disabled?: boolean; danger?: boolean; hint?: string; onSelect: () => void }
  | { kind: 'divider'; key: string }

type TriggerProps = {
  ref: (el: HTMLElement | null) => void
  'aria-haspopup': 'menu'
  'aria-expanded': boolean
  'aria-controls': string | undefined
  onClick: (e: React.MouseEvent) => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

type Props = {
  /** Accessible name of the menu. */
  label: string
  items: PopMenuItem[]
  placement?: Placement
  /** Render the trigger with these props spread on it. */
  trigger: (props: TriggerProps, open: boolean) => React.ReactElement
  onOpenChange?: (open: boolean) => void
  /** Where focus goes after a choice (default: back to the trigger). */
  restoreFocus?: () => void
  /** Extra styles of the list (e.g. CSS variables its icons use). */
  listSx?: Record<string, unknown>
}

const MENU_CSS = {
  '@keyframes popMenuIn': { from: { opacity: 0, transform: 'scale(0.97)' }, to: { opacity: 1, transform: 'none' } },
  animation: 'popMenuIn 120ms cubic-bezier(0.22, 1, 0.36, 1)',
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
}

export default function PopMenu({ label, items, placement = 'bottom-start', trigger, onOpenChange, restoreFocus, listSx }: Props) {
  const uid = useId().replace(/:/g, '')
  const menuId = `popmenu-${uid}`
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const triggerRef = useRef<HTMLElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const choices = items.map((it, i) => ({ it, i })).filter((x) => x.it.kind !== 'divider' && !(x.it as { disabled?: boolean }).disabled)

  const setOpenState = useCallback(
    (next: boolean) => {
      setOpen(next)
      onOpenChange?.(next)
    },
    [onOpenChange],
  )

  const close = useCallback(
    (focusTrigger: boolean) => {
      setOpenState(false)
      if (focusTrigger) requestAnimationFrame(() => triggerRef.current?.focus())
    },
    [setOpenState],
  )

  const openMenu = () => {
    const checked = choices.find((x) => x.it.kind === 'radio' && x.it.checked)
    setActive((checked ?? choices[0])?.i ?? -1)
    setOpenState(true)
  }

  // Position next to the trigger, and keep it there while open.
  const place = useCallback(() => {
    const ref = triggerRef.current
    const el = listRef.current
    if (!ref || !el) return
    void computePosition(ref, el, { strategy: 'fixed', placement, middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })] }).then(({ x, y }) => {
      el.style.left = `${x}px`
      el.style.top = `${y}px`
    })
  }, [placement])
  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])
  useEffect(() => {
    if (!open) return
    const onMove = () => place()
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (listRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      close(false)
    }
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [open, place, close])

  // The active item has focus.
  useEffect(() => {
    if (!open || active < 0) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    el?.focus()
  }, [open, active])

  const choose = (index: number) => {
    const it = items[index]
    if (!it || it.kind === 'divider' || it.disabled) return
    close(!restoreFocus)
    it.onSelect()
    if (restoreFocus) requestAnimationFrame(restoreFocus)
  }

  const onListKey = (e: React.KeyboardEvent) => {
    const pos = choices.findIndex((x) => x.i === active)
    const go = (n: number) => {
      e.preventDefault()
      if (!choices.length) return
      setActive(choices[(n + choices.length) % choices.length].i)
    }
    if (e.key === 'ArrowDown') go(pos + 1)
    else if (e.key === 'ArrowUp') go(pos - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(choices.length - 1)
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(active)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    } else if (e.key === 'Tab') close(false)
  }

  const triggerProps: TriggerProps = {
    ref: (el: HTMLElement | null) => {
      triggerRef.current = el
    },
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: (e) => {
      e.preventDefault()
      if (open) close(false)
      else openMenu()
    },
    onKeyDown: (e) => {
      if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        openMenu()
      }
    },
  }

  return (
    <>
      {trigger(triggerProps, open)}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <Box
              ref={listRef}
              id={menuId}
              role="menu"
              aria-label={label}
              onKeyDown={onListKey}
              position="fixed"
              top={0}
              left={0}
              zIndex={1500}
              minW="200px"
              maxW="calc(100vw - 16px)"
              p={1}
              bg="page.bg-elevated"
              border="1px solid"
              borderColor="page.border-strong"
              borderRadius="lg"
              boxShadow="0 12px 32px rgba(0,0,0,0.18)"
              sx={listSx ? { ...MENU_CSS, ...listSx } : MENU_CSS}
            >
              {items.map((it, i) =>
                it.kind === 'divider' ? (
                  <Box key={it.key} role="separator" my={1} h="1px" bg="page.border" />
                ) : (
                  <Flex
                    key={it.key}
                    data-index={i}
                    role={it.kind === 'radio' ? 'menuitemradio' : 'menuitem'}
                    aria-checked={it.kind === 'radio' ? !!it.checked : undefined}
                    aria-disabled={it.disabled || undefined}
                    tabIndex={-1}
                    onClick={() => choose(i)}
                    onMouseEnter={() => !it.disabled && setActive(i)}
                    align="center"
                    gap={2}
                    px={2.5}
                    py={1.5}
                    borderRadius="md"
                    fontSize="13px"
                    cursor={it.disabled ? 'default' : 'pointer'}
                    color={it.disabled ? 'page.fg-subtle' : it.danger ? 'status.error' : 'page.fg'}
                    bg={active === i ? 'page.bg-overlay' : 'transparent'}
                    outline="none"
                    _focusVisible={{ boxShadow: 'inset 0 0 0 2px var(--accent-ring)' }}
                    sx={{ '@media (forced-colors: active)': { '&:focus': { outline: '2px solid Highlight', outlineOffset: '-2px' } } }}
                  >
                    <Box as="span" w="16px" display="inline-flex" justifyContent="center" flexShrink={0} aria-hidden>
                      {it.icon ?? (it.kind === 'radio' && it.checked ? '✓' : null)}
                    </Box>
                    <Text as="span" flex="1">
                      {it.label}
                    </Text>
                    {it.kind === 'radio' && it.checked && it.icon ? (
                      <Text as="span" aria-hidden color="accent.text" fontSize="12px">
                        ✓
                      </Text>
                    ) : null}
                    {it.hint ? (
                      <Text as="span" aria-hidden fontFamily={MONO} fontSize="11px" color="page.fg-secondary">
                        {it.hint}
                      </Text>
                    ) : null}
                  </Flex>
                ),
              )}
            </Box>,
            document.body,
          )
        : null}
    </>
  )
}
