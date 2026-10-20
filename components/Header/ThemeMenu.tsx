import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { Box, Text, chakra } from '@chakra-ui/react'
import { keyframes } from '@emotion/react'
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from '../Icons/ui/theme'
import { useThemePreference } from '../Chrome/useThemePreference'
import { systemPrefersDark, type ThemePreference } from '../../lib/themePreference'
import { THEME_OPTIONS, menuKeyTarget, type MenuFocus } from './themeMenuKeys'
import { useChromeUi } from '../Chrome/chromeLang'
import { MENU_UI } from '../../lib/uiStrings/menu'
import { fillUi } from '../../lib/uiStrings'

/**
 * The header's theme menu: System / Light / Dark as a WAI-ARIA menu of
 * radio items (its own chunk, loaded on demand by ThemeControl).
 *
 *   - Opens on the checked item (click, Enter, Space, long-press), the first
 *     (ArrowDown) or the last (ArrowUp); ArrowUp / ArrowDown wrap, Home /
 *     End jump, S / L / D pick by first letter, Enter / Space choose.
 *   - Choosing closes the menu, returns focus to the trigger and applies the
 *     preference — behind the circular reveal from the trigger when the mode
 *     on screen changes. Escape closes and returns focus; Tab and a click
 *     outside close it where focus already is.
 *   - System shows which mode the device asks for right now.
 */

const enter = keyframes`
  from { opacity: 0; transform: translateY(-4px) scale(0.98); }
  to { opacity: 1; transform: none; }
`

const ICONS: Record<ThemePreference, typeof SunIcon> = { system: MonitorIcon, light: SunIcon, dark: MoonIcon }

export type ThemeMenuProps = {
  id: string
  /** The menu button: focus returns there, the reveal grows from it. */
  triggerRef: RefObject<HTMLButtonElement | null>
  /** Which item takes focus when the menu opens. */
  initialFocus: MenuFocus
  /** `restoreFocus`: move focus back to the trigger (Escape, a choice). */
  onClose: (restoreFocus: boolean) => void
}

export default function ThemeMenu({ id, triggerRef, initialFocus, onClose }: ThemeMenuProps) {
  const { preference, choose } = useThemePreference()
  // The chrome's words (F3); a letter jumps by the first letter of the labels on screen.
  const { t, lang } = useChromeUi()
  const m = MENU_UI[lang]
  const labels = THEME_OPTIONS.map((o) => m[o.value])
  const menuRef = useRef<HTMLDivElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])
  const checkedIndex = Math.max(0, THEME_OPTIONS.findIndex((o) => o.value === preference))
  const systemMode = systemPrefersDark() ? 'dark' : 'light'

  // Focus the requested item once, when the menu opens.
  useEffect(() => {
    const index = initialFocus === 'first' ? 0 : initialFocus === 'last' ? THEME_OPTIONS.length - 1 : checkedIndex
    items.current[index]?.focus()
    // Only on open: later preference changes must not move focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A press outside the menu and its trigger closes it (focus stays where it went).
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target || menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      onClose(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [onClose, triggerRef])

  const select = (value: ThemePreference) => {
    // Close first, synchronously: the reveal's "old" snapshot must not hold the menu.
    flushSync(() => onClose(true))
    choose(value, triggerRef.current)
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose(true)
      return
    }
    if (e.key === 'Tab') {
      onClose(false)
      return
    }
    const current = items.current.findIndex((el) => el === document.activeElement)
    const next = menuKeyTarget(e.key, current, THEME_OPTIONS.length, labels)
    if (next !== null) {
      e.preventDefault()
      items.current[next]?.focus()
    }
  }

  return (
    <Box
      ref={menuRef}
      id={id}
      role="menu"
      aria-label={t.theme}
      aria-orientation="vertical"
      onKeyDown={onKeyDown}
      position="absolute"
      top="calc(100% + 8px)"
      right={0}
      zIndex={30}
      minW="13rem"
      p={1}
      bg="page.bg"
      border="1px solid"
      borderColor="page.border-strong"
      borderRadius="card"
      boxShadow="elevation.md"
      transformOrigin="top right"
      animation={`${enter} var(--duration-fast) var(--ease-standard)`}
    >
      {THEME_OPTIONS.map((option, i) => {
        const checked = option.value === preference
        const Icon = ICONS[option.value]
        return (
          <chakra.button
            key={option.value}
            ref={(el: HTMLButtonElement | null) => {
              items.current[i] = el
            }}
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            tabIndex={-1}
            onClick={() => select(option.value)}
            display="flex"
            alignItems="center"
            gap={2.5}
            w="100%"
            minH="36px"
            px={2.5}
            borderRadius="control"
            textAlign="left"
            fontSize="small"
            color={checked ? 'page.fg' : 'page.fg-secondary'}
            transition="background-color var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard)"
            _hover={{ bg: 'page.hover', color: 'page.fg' }}
            _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '-2px', bg: 'page.hover', color: 'page.fg' }}
          >
            <Icon size="sm" />
            <Text as="span" flex={1}>
              {labels[i]}
            </Text>
            {option.value === 'system' ? (
              <Text as="span" fontFamily="mono" fontSize="label" color="page.fg-subtle">
                <span className="sr-only">{fillUi(m.followsDevice, { mode: '' })}</span>
                {m[systemMode].toLowerCase()}
              </Text>
            ) : null}
            <Box as="span" display="inline-flex" w="16px" color="accent.text" visibility={checked ? 'visible' : 'hidden'}>
              <CheckIcon size="sm" />
            </Box>
          </chakra.button>
        )
      })}
    </Box>
  )
}
