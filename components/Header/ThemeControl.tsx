import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { Flex, IconButton, useColorMode } from '@chakra-ui/react'
import { toggleThemeWithTransition } from '../../lib/themeTransition'
import { ChevronDownIcon } from '../Icons/ui/chrome'
import ErrorBoundary from '../Common/ErrorBoundary'
import ThemeIcon from './ThemeIcon'
import { triggerKeyFocus, type MenuFocus } from './themeTriggerKeys'
import { useChromeUi } from '../Chrome/chromeLang'

/**
 * The header's theme control: a one-tap Light ⇄ Dark toggle (the circular
 * reveal grows from it) and, beside it, a menu button for the full
 * System / Light / Dark preference (lib/themePreference.ts).
 *
 *   - The menu is its own chunk (./ThemeMenu), fetched on hover / focus of
 *     the menu button or when first opened — the shared bundle only carries
 *     this small control.
 *   - A context-menu gesture on the toggle — right-click, or a long-press
 *     on touch screens that raise one (Android) — opens the same menu.
 *   - Both targets are at least 24 × 32 px (WCAG 2.5.8); the menu button
 *     follows the WAI-ARIA menu-button pattern (aria-haspopup, aria-expanded,
 *     ArrowDown / ArrowUp open on the first / last item).
 */

const loadThemeMenu = () => import('./ThemeMenu')
const ThemeMenu = dynamic(loadThemeMenu, { ssr: false, loading: () => null })
const preloadThemeMenu = () => {
  loadThemeMenu().catch(() => undefined)
}
/** The header (and so this control) is rendered once per page. */
const MENU_ID = 'theme-menu'

export default function ThemeControl() {
  const router = useRouter()
  const { colorMode, toggleColorMode } = useColorMode()
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

  const { t } = useChromeUi()
  const isDark = colorMode === 'dark'
  const toggleLabel = isDark ? t.toLight : t.toDark

  return (
    <Flex role="group" aria-label={t.theme} position="relative" alignItems="center">
      <IconButton
        size="sm"
        variant="ghost"
        color="page.fg-subtle"
        _hover={{ color: 'page.fg', bg: 'page.hover' }}
        aria-label={toggleLabel}
        title={toggleLabel}
        icon={<ThemeIcon />}
        // The keyboard layer's T presses this (components/Chrome/keyboardLayerActions.ts).
        data-theme-toggle=""
        onContextMenu={(e) => {
          e.preventDefault()
          openMenu('checked')
        }}
        onClick={(e) => toggleThemeWithTransition(toggleColorMode, e.currentTarget)}
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
        aria-label={t.themePreference}
        title={t.themeTitle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? MENU_ID : undefined}
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
          <ThemeMenu id={MENU_ID} triggerRef={triggerRef} initialFocus={focus} onClose={closeMenu} />
        </ErrorBoundary>
      ) : null}
    </Flex>
  )
}
