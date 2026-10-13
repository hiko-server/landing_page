import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { Flex, IconButton, useColorMode } from '@chakra-ui/react'
import { toggleThemeWithTransition } from '../../lib/themeTransition'
import { ChevronDownIcon } from '../Icons/ui/chrome'
import ErrorBoundary from '../Common/ErrorBoundary'
import ThemeIcon from './ThemeIcon'
import { LONG_PRESS_MS, exceedsSlop, triggerKeyFocus, type MenuFocus } from './themeMenuKeys'

/**
 * The header's theme control: a one-tap Light ⇄ Dark toggle (the circular
 * reveal grows from it) and, beside it, a menu button for the full
 * System / Light / Dark preference (lib/themePreference.ts).
 *
 *   - The menu is its own chunk (./ThemeMenu), fetched on hover / focus of
 *     the menu button or when first opened — the shared bundle only carries
 *     this small control.
 *   - Long-press (touch) or right-click on the toggle opens the same menu.
 *   - Both targets are at least 24 × 32 px (WCAG 2.5.8); the menu button
 *     follows the WAI-ARIA menu-button pattern (aria-haspopup, aria-expanded,
 *     ArrowDown / ArrowUp open on the first / last item).
 */

const loadThemeMenu = () => import('./ThemeMenu')
const ThemeMenu = dynamic(loadThemeMenu, { ssr: false, loading: () => null })
const preloadThemeMenu = () => {
  loadThemeMenu().catch(() => undefined)
}

export default function ThemeControl() {
  const router = useRouter()
  const { colorMode, toggleColorMode } = useColorMode()
  const menuId = `theme-menu-${useId().replace(/:/g, '')}`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [requested, setRequested] = useState(false)
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState<MenuFocus>('checked')

  const openMenu = useCallback((at: MenuFocus) => {
    setFocus(at)
    setRequested(true)
    setOpen(true)
  }, [])

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  // A navigation closes the menu (it belongs to the page it was opened on).
  useEffect(() => {
    const close = () => setOpen(false)
    router.events.on('routeChangeStart', close)
    return () => router.events.off('routeChangeStart', close)
  }, [router.events])

  // Long-press on the toggle (touch): open the menu and swallow the click.
  const press = useRef<{ timer: number; x: number; y: number } | null>(null)
  const swallowClick = useRef(false)
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer)
    press.current = null
  }
  const onTogglePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    swallowClick.current = false
    if (e.pointerType !== 'touch') return
    preloadThemeMenu()
    const timer = window.setTimeout(() => {
      press.current = null
      swallowClick.current = true
      openMenu('checked')
    }, LONG_PRESS_MS)
    press.current = { timer, x: e.clientX, y: e.clientY }
  }
  const onTogglePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (press.current && exceedsSlop(press.current, { x: e.clientX, y: e.clientY })) cancelPress()
  }
  useEffect(() => cancelPress, [])

  const isDark = colorMode === 'dark'
  const toggleLabel = isDark ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <Flex role="group" aria-label="Theme" position="relative" alignItems="center">
      <IconButton
        size="sm"
        variant="ghost"
        color="page.fg-subtle"
        _hover={{ color: 'page.fg', bg: 'page.hover' }}
        aria-label={toggleLabel}
        title={toggleLabel}
        icon={<ThemeIcon />}
        // No callout or text selection while a finger is held on it.
        sx={{ WebkitTouchCallout: 'none', userSelect: 'none', touchAction: 'manipulation' }}
        onPointerDown={onTogglePointerDown}
        onPointerMove={onTogglePointerMove}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
        onContextMenu={(e) => {
          e.preventDefault()
          cancelPress()
          swallowClick.current = false
          openMenu('checked')
        }}
        onClick={(e) => {
          if (swallowClick.current) {
            swallowClick.current = false
            return
          }
          toggleThemeWithTransition(toggleColorMode, e.currentTarget)
        }}
      />
      <IconButton
        ref={triggerRef}
        size="sm"
        variant="ghost"
        minW="24px"
        w="24px"
        px={0}
        color="page.fg-subtle"
        _hover={{ color: 'page.fg', bg: 'page.hover' }}
        _expanded={{ color: 'page.fg', bg: 'page.hover' }}
        aria-label="Theme preference"
        title="Theme: System, Light or Dark"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        icon={<ChevronDownIcon size="xs" />}
        onPointerEnter={preloadThemeMenu}
        onFocus={preloadThemeMenu}
        onClick={() => (open ? closeMenu(false) : openMenu('checked'))}
        onKeyDown={(e) => {
          const at = triggerKeyFocus(e.key)
          if (!at) return
          e.preventDefault()
          openMenu(at)
        }}
      />
      {requested && open ? (
        <ErrorBoundary name="theme-menu" fallback={null}>
          <ThemeMenu id={menuId} triggerRef={triggerRef} initialFocus={focus} onClose={closeMenu} />
        </ErrorBoundary>
      ) : null}
    </Flex>
  )
}
