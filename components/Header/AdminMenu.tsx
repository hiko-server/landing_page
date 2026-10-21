import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import NextLink from 'next/link'
import { useRouter } from 'next/router'
import { Box, Text, chakra } from '@chakra-ui/react'
import { keyframes } from '@emotion/react'
import { ChevronDownIcon } from '../Icons/ui/chrome'
import { DashboardIcon, LogOutIcon } from '../Icons/ui/account'
import { useChromeUi } from '../Chrome/chromeLang'
import { MENU_UI } from '../../lib/uiStrings/menu'
import { menuKeyTarget } from './themeMenuKeys'
import type { MenuFocus } from './themeTriggerKeys'

/**
 * The signed-in owner's controls in the header (lg+): one menu button
 * beside the wordmark — Dashboard, Log out — in place of the two buttons
 * that used to fill the right-hand group.
 *
 * Why beside the wordmark: the header row is a 1fr · auto · 1fr grid with
 * the primary nav centred (components/Header/Header). The right-hand group
 * (language switch, ⌘K, theme) already fills its share at 992 px, so
 * anything added there pushes the nav sideways — and the brand into it —
 * and does so only once the session check has answered, after the first
 * paint. The left share always has room for this 42 px button (brand +
 * button, and at xl the live-status pill, stay under the share at every
 * width and in both languages; e2e/review-r3-header.spec.ts), so the nav,
 * the brand and the right-hand group stay exactly where a visitor sees
 * them and nothing moves when the button appears.
 *
 * Its own chunk: Header fetches it with the session check (only for a
 * visitor who can be signed in) and renders it with the answer, before the
 * live status, which waits for that answer — so visitors never download
 * it, and it never appears in front of the status. Below lg the drawer
 * lists the same two actions.
 *
 * A WAI-ARIA menu button like the theme menu (./ThemeMenu): Enter / Space
 * or ArrowDown open it on the first item, ArrowUp on the last; inside,
 * ArrowUp / ArrowDown wrap, Home / End jump, a letter picks by its first
 * letter, Escape closes and returns focus, Tab and a click outside close
 * it. A navigation closes it.
 */

const MENU_ID = 'admin-menu'

const appear = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`
const enter = keyframes`
  from { opacity: 0; transform: translateY(-4px) scale(0.98); }
  to { opacity: 1; transform: none; }
`

export default function AdminMenu({ onLogout }: { onLogout: () => void }) {
  const router = useRouter()
  const { t, lang } = useChromeUi()
  const m = MENU_UI[lang]
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const items = useRef<(HTMLElement | null)[]>([])
  const [open, setOpen] = useState(false)
  const [focusOn, setFocusOn] = useState<MenuFocus>('first')
  const labels = [t.dashboard, t.logout]

  const openMenu = useCallback((at: MenuFocus) => {
    setFocusOn(at)
    setOpen(true)
  }, [])
  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  // Focus the requested item when the menu opens.
  useEffect(() => {
    if (!open) return
    items.current[focusOn === 'last' ? labels.length - 1 : 0]?.focus()
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // A press outside the menu and its trigger closes it (focus stays where it went).
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target || menuRef.current?.contains(target) || triggerRef.current?.contains(target))
        return
      close(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, close])

  // The menu belongs to the page it was opened on.
  useEffect(() => {
    const onStart = () => setOpen(false)
    router.events.on('routeChangeStart', onStart)
    return () => router.events.off('routeChangeStart', onStart)
  }, [router.events])

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
      return
    }
    if (e.key === 'Tab') {
      close(false)
      return
    }
    const current = items.current.findIndex((el) => el === document.activeElement)
    // Space activates the focused item (a link only answers Enter by itself).
    if (e.key === ' ' && current >= 0) {
      e.preventDefault()
      items.current[current]?.click()
      return
    }
    const next = menuKeyTarget(e.key, current, labels.length, labels)
    if (next !== null) {
      e.preventDefault()
      items.current[next]?.focus()
    }
  }

  const item = {
    display: 'flex',
    alignItems: 'center',
    gap: 2.5,
    w: '100%',
    minH: '36px',
    px: 2.5,
    borderRadius: 'control',
    textAlign: 'left',
    fontSize: 'small',
    color: 'page.fg-secondary',
    textDecoration: 'none',
    transition:
      'background-color var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard)',
    _hover: { bg: 'page.hover', color: 'page.fg', textDecoration: 'none' },
    _focusVisible: {
      outline: '2px solid var(--accent)',
      outlineOffset: '-2px',
      bg: 'page.hover',
      color: 'page.fg',
    },
  } as const

  return (
    <Box
      data-admin-menu=""
      position="relative"
      display={{ base: 'none', lg: 'inline-flex' }}
      alignItems="center"
      flexShrink={0}
      // Fades in where it will stay: nothing around it moves.
      animation={`${appear} var(--duration-base) var(--ease-standard)`}
    >
      <chakra.button
        ref={triggerRef}
        type="button"
        aria-label={m.admin}
        title={m.admin}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? MENU_ID : undefined}
        onClick={() => (open ? close(false) : openMenu('first'))}
        onKeyDown={(e) => {
          // The theme menu button's keys (./themeTriggerKeys, not imported:
          // a second user would split it out of the shared chunk).
          const at: MenuFocus | null = e.key === 'ArrowDown' ? 'first' : e.key === 'ArrowUp' ? 'last' : null
          if (!at) return
          e.preventDefault()
          openMenu(at)
        }}
        display="inline-flex"
        alignItems="center"
        gap="2px"
        h="32px"
        px="7px"
        borderRadius="md"
        color="page.fg-subtle"
        transition="color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard)"
        _hover={{ color: 'page.fg', bg: 'page.hover' }}
        _expanded={{ color: 'page.fg', bg: 'page.hover' }}
        _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
      >
        <DashboardIcon size="sm" />
        <ChevronDownIcon size="xs" />
      </chakra.button>
      {open ? (
        <Box
          ref={menuRef}
          id={MENU_ID}
          role="menu"
          aria-label={m.admin}
          aria-orientation="vertical"
          onKeyDown={onMenuKeyDown}
          position="absolute"
          top="calc(100% + 8px)"
          left={0}
          zIndex={30}
          minW="12rem"
          p={1}
          bg="page.bg"
          border="1px solid"
          borderColor="page.border-strong"
          borderRadius="card"
          boxShadow="elevation.md"
          transformOrigin="top left"
          animation={`${enter} var(--duration-fast) var(--ease-standard)`}
        >
          <Box
            as={NextLink}
            href="/admin/dashboard"
            ref={(el: HTMLElement | null) => {
              items.current[0] = el
            }}
            role="menuitem"
            tabIndex={-1}
            {...item}
          >
            <DashboardIcon size="sm" />
            <Text as="span">{t.dashboard}</Text>
          </Box>
          <chakra.button
            ref={(el: HTMLButtonElement | null) => {
              items.current[1] = el
            }}
            type="button"
            role="menuitem"
            tabIndex={-1}
            title={t.logoutTitle}
            onClick={() => {
              // The button leaves with the session: focus moves with the page (router.replace).
              close(false)
              onLogout()
            }}
            {...item}
          >
            <LogOutIcon size="sm" />
            <Text as="span">{t.logout}</Text>
          </chakra.button>
        </Box>
      ) : null}
    </Box>
  )
}
