import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Text, Button, useDisclosure, Flex, IconButton, Link, useColorMode, Kbd } from '@chakra-ui/react'
import NextLink from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { motion } from 'framer-motion'
import { SearchIcon } from '@chakra-ui/icons'
import CommandPaletteLazy, { preloadCommandPalette } from '../General-UI/CommandPaletteLazy'
import {
  MOBILE_MENU_DIALOG_ID,
  PRIMARY_LINKS,
  SOCIAL_LINKS,
  type SocialLink,
  formatAge,
  isActiveRoute,
  shortcutTarget,
  shouldProbeSession,
  shouldRecheckSession,
  splitBrand,
} from '../Chrome/chrome'
import { useBrandHost } from '../Chrome/useBrandHost'
import { useChromeToast } from '../Chrome/useChromeToast'
import { useShortcutsEnabled } from '../Chrome/useShortcutsEnabled'
import { HIDE_ON_COARSE_POINTER, isApplePlatform, paletteKeyShortcuts, paletteShortcutLabel } from '../Chrome/platform'
import { OPEN_PALETTE_EVENT, normalizePaletteQuery, type OpenPaletteDetail } from '../Chrome/paletteEvents'
import { useFetchJson } from '../Common/useFetchJson'
import { MenuIcon } from '../Icons/brand'
import { toggleThemeWithTransition } from '../../lib/themeTransition'
import { getShortcutsEnabled, isImeComposing } from '../../lib/keyboardShortcuts'
import { pageKeyOf } from '../../lib/viewTransition'
import ThemeIcon from './ThemeIcon'

/**
 * v6 Header — rendered once by components/Chrome/SiteChrome (persistent across
 * client-side navigations).
 *
 * Layout (lg+):      [logo · live-status]  [primary nav]  [⌘K · theme · admin]
 * Layout (< lg):     [logo]                [⌘K · theme · hamburger → drawer]
 *
 * Breakpoints are pure CSS (no JS media query) and every colour is a semantic
 * token (CSS variable), so the header is correct on the very first paint at
 * every width and in both colour modes.
 *
 * Weight: the ⌘K palette and the mobile drawer are separate chunks, fetched
 * when first needed (and warmed on hover / focus / idle); icons are inline.
 */

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'

const loadMobileDrawer = () => import('./MobileDrawer')
const MobileDrawer = dynamic(loadMobileDrawer, { ssr: false, loading: () => null })
const preloadMobileDrawer = () => {
  loadMobileDrawer().catch(() => undefined)
}

/** True while `query` matches (false on the server and until mounted). */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const update = () => setMatches(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [query])
  return matches
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

type GithubEvents = { events?: { type?: string; created_at?: string }[] }

/** "● Last commit · 2h ago" — only where it is shown (md+), fetched once per visit. */
function LiveStatus() {
  const wide = useMediaQuery('(min-width: 48em)')
  return wide ? <LiveStatusPill /> : null
}

function LiveStatusPill() {
  // Shared with the home activity widgets (concurrent requests are deduped).
  const { data } = useFetchJson<GithubEvents>('/api/github/events')
  const created = useMemo(() => {
    const events = data?.events || []
    return (events.find((e) => e.type === 'PushEvent') || events[0])?.created_at || null
  }, [data])

  // The age is computed on the client only (no server/client mismatch) and
  // recomputed when the page is restored from the back/forward cache.
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
  }, [created])
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setNow(Date.now())
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  const text = created && now ? formatAge(created, now) : null
  if (!text) return null

  return (
    <Flex
      // Hidden at lg (1024–1279): the full nav + admin actions leave no room there.
      display={{ base: 'none', md: 'flex', lg: 'none', xl: 'flex' }}
      alignItems="center"
      gap="6px"
      flexShrink={0}
      whiteSpace="nowrap"
      fontFamily={MONO}
      fontSize="11px"
      color="page.fg-subtle"
      letterSpacing="0.02em"
      className="tnum"
      title={`Last commit · ${text}`}
    >
      <Box position="relative" w="6px" h="6px" aria-hidden>
        <Box className="pulse-dot" position="absolute" inset={0} borderRadius="full" />
        <Box w="6px" h="6px" borderRadius="full" bg="var(--live-green)" position="relative" />
      </Box>
      <Text as="span">
        <span className="sr-only">Last commit </span>
        {/* Beside the full nav (xl+, fixed-width header) only the age fits. */}
        <Text as="span" aria-hidden display={{ base: 'inline', lg: 'none' }}>
          Last commit ·{' '}
        </Text>
        {text}
      </Text>
    </Flex>
  )
}

/** `socials`: the profile links to offer in the drawer (SiteChrome resolves them from home.socials). */
const Header = ({ socials = SOCIAL_LINKS }: { socials?: readonly SocialLink[] }) => {
  const router = useRouter()
  const toast = useChromeToast()
  const [isAdmin, setIsAdmin] = useState(false)
  const { isOpen, onOpen, onClose } = useDisclosure()
  const { isOpen: cmdkOpen, onOpen: openCmdk, onClose: closeCmdk } = useDisclosure()
  // The lazy chunks are rendered from the first time they are asked for on.
  const [paletteRequested, setPaletteRequested] = useState(false)
  // Text the palette opens with (the 404 page's search field); '' otherwise.
  const [paletteQuery, setPaletteQuery] = useState('')
  const [drawerRequested, setDrawerRequested] = useState(false)
  const { colorMode, toggleColorMode } = useColorMode()
  const brand = useBrandHost()
  const [brandHead, brandTail] = splitBrand(brand)
  const shortcutsOn = useShortcutsEnabled()
  // A dialog closed because the visitor left the page must not pull focus
  // back to its trigger in the header: focus moves into the new page's
  // <main> instead (components/Chrome/routeFocus.ts).
  const [dialogsReturnFocus, setDialogsReturnFocus] = useState(true)

  const openPalette = useCallback(
    (query = '') => {
      setDialogsReturnFocus(true)
      setPaletteQuery(query)
      setPaletteRequested(true)
      openCmdk()
    },
    [openCmdk],
  )

  // Page content can ask for the palette (components/Chrome/paletteEvents).
  useEffect(() => {
    const onOpen = (e: Event) => openPalette(normalizePaletteQuery((e as CustomEvent<OpenPaletteDetail>).detail?.query))
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_PALETTE_EVENT, onOpen)
  }, [openPalette])

  // The drawer's Search action: the palette opens once the drawer has left
  // (one dialog at a time; focus then returns to the hamburger as usual).
  const paletteAfterDrawer = useRef(false)
  const searchFromDrawer = useCallback(() => {
    paletteAfterDrawer.current = true
    onClose()
  }, [onClose])
  const onDrawerCloseComplete = useCallback(() => {
    if (!paletteAfterDrawer.current) return
    paletteAfterDrawer.current = false
    openPalette()
  }, [openPalette])

  const openDrawer = useCallback(() => {
    setDialogsReturnFocus(true)
    setDrawerRequested(true)
    onOpen()
  }, [onOpen])

  // The session cookie is httpOnly (invisible to document.cookie), so ask the
  // server (always 200 → { authenticated }) — but only when the visitor can
  // be signed in at all (the cv_admin_hint cookie, or inside /admin), so
  // ordinary visitors never send the request. Once on mount, then only when
  // a navigation can have changed the answer (see shouldRecheckSession).
  // Only the newest response is applied, and an in-flight check is never
  // dropped just because the visitor navigated meanwhile.
  const isAdminRef = useRef(isAdmin)
  isAdminRef.current = isAdmin
  const sessionSeq = useRef(0)
  const checkSession = useCallback((pathname: string) => {
    const seq = ++sessionSeq.current
    if (!shouldProbeSession(document.cookie, pathname)) {
      setIsAdmin(false)
      return
    }
    fetch('/api/admin/session', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { authenticated: false }))
      .then((d) => {
        if (seq === sessionSeq.current) setIsAdmin(!!d?.authenticated)
      })
      .catch(() => {})
  }, [])
  const pathname = router.pathname
  const lastPathRef = useRef(pathname)
  useEffect(() => {
    checkSession(lastPathRef.current)
    return () => {
      // Unmounted: ignore any response still in flight.
      sessionSeq.current += 1
    }
  }, [checkSession])
  useEffect(() => {
    const prev = lastPathRef.current
    lastPathRef.current = pathname
    if (shouldRecheckSession(prev, pathname, isAdminRef.current)) checkSession(pathname)
  }, [pathname, checkSession])

  // The drawer belongs to the page it was opened on: close it whenever a
  // navigation starts (links, ⌘K, "G then …" shortcuts, Back/Forward). The
  // palette closes too when the page changes under it (Back / Forward while
  // it is open); its own navigations close it first. Whatever is still on
  // screen when the route transition starts fades out in place
  // (RouteTransitions lifts open layers out of the page snapshot).
  const pageKeyRef = useRef(pageKeyOf(router.asPath))
  pageKeyRef.current = pageKeyOf(router.asPath)
  useEffect(() => {
    const onRouteChangeStart = (as: string) => {
      const leavesPage = pageKeyOf(as) !== pageKeyRef.current
      if (leavesPage) {
        setDialogsReturnFocus(false)
        closeCmdk()
      }
      paletteAfterDrawer.current = false
      onClose()
    }
    router.events.on('routeChangeStart', onRouteChangeStart)
    return () => router.events.off('routeChangeStart', onRouteChangeStart)
  }, [router.events, onClose, closeCmdk])

  const [isMac, setIsMac] = useState(true)
  useEffect(() => {
    setIsMac(isApplePlatform(navigator as Navigator & { userAgentData?: { platform?: string } }))
  }, [])

  // Global keys: ⌘K / Ctrl+K toggles the palette anywhere; "/" opens it and
  // "G then <key>" navigates (both only outside text fields, palette closed,
  // and only while the visitor has not turned single-key shortcuts off —
  // WCAG 2.1.4, lib/keyboardShortcuts). Keys typed into an input method's
  // composition are never shortcuts.
  useEffect(() => {
    let armedUntil = 0
    const onKey = (e: KeyboardEvent) => {
      if (isImeComposing(e)) return
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        // A focused widget that owns ⌘K (the rich editor's link form) handled it.
        if (e.defaultPrevented) return
        e.preventDefault()
        if (cmdkOpen) closeCmdk()
        else openPalette()
        return
      }
      if (cmdkOpen || e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.defaultPrevented || isEditableTarget(e.target)) return
      if (!getShortcutsEnabled()) {
        armedUntil = 0
        return
      }
      if (e.key === '/') {
        e.preventDefault()
        armedUntil = 0
        openPalette()
        return
      }
      const k = e.key.toLowerCase()
      const target = Date.now() < armedUntil ? shortcutTarget(k) : null
      if (target) {
        armedUntil = 0
        e.preventDefault()
        if (router.asPath.split(/[?#]/)[0] !== target) router.push(target)
        return
      }
      armedUntil = k === 'g' && !e.shiftKey ? Date.now() + 1200 : 0
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [cmdkOpen, openPalette, closeCmdk, router])

  // Warm the palette chunk once the browser is idle after load.
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(preloadCommandPalette, { timeout: 5000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const timer = window.setTimeout(preloadCommandPalette, 2000)
    return () => window.clearTimeout(timer)
  }, [])

  const logout = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/logout', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      sessionSeq.current += 1
      setIsAdmin(false)
      toast({ status: 'success', title: 'Logged out' })
      router.replace('/')
    } catch {
      toast({ status: 'error', title: 'Logout failed' })
    }
  }, [router, toast])

  const isDark = colorMode === 'dark'
  const themeLabel = isDark ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <>
      <Box
        as="header"
        position="relative"
        w="100%"
        bg="page.header-bg"
        backdropFilter="blur(14px)"
        borderBottom="1px solid"
        borderColor="page.border"
        className="no-print glass"
      >
        <Flex
          maxW="var(--container-content)"
          mx="auto"
          px={{ base: 4, md: 6, lg: 8 }}
          h="56px"
          alignItems="center"
          justifyContent="space-between"
          gap={4}
        >
          {/* Left: brand + live status */}
          <Flex alignItems="center" gap={5} minW={0}>
            <Link
              as={NextLink}
              href="/"
              aria-label={`${brand} — home`}
              display="inline-flex"
              alignItems="center"
              minH="44px"
              fontFamily={MONO}
              fontSize="13px"
              fontWeight={600}
              letterSpacing="-0.01em"
              color="page.fg"
              _hover={{ textDecoration: 'none' }}
              whiteSpace="nowrap"
            >
              <Text as="span">{brandHead}</Text>
              {brandTail && (
                <Text as="span" color="accent.text">
                  {brandTail}
                </Text>
              )}
            </Link>
            <LiveStatus />
          </Flex>

          {/* Center: primary nav (lg+) */}
          <Flex
            as="nav"
            aria-label="Primary"
            alignItems="center"
            gap={1}
            display={{ base: 'none', lg: 'flex' }}
            fontSize="14px"
            color="page.fg-secondary"
          >
            {PRIMARY_LINKS.map((l) => {
              const active = isActiveRoute(router.pathname, l.url)
              return (
                <Link
                  key={l.name}
                  as={NextLink}
                  href={l.url}
                  aria-current={active ? 'page' : undefined}
                  position="relative"
                  px={2.5}
                  py={1.5}
                  borderRadius="md"
                  color={active ? 'page.fg' : undefined}
                  fontWeight={active ? 500 : 400}
                  _hover={{ color: 'page.fg', textDecoration: 'none', bg: 'page.hover' }}
                  transition="color 150ms, background-color 150ms"
                >
                  {l.name}
                  {active ? (
                    // One shared layoutId: the header is persistent, so the
                    // underline glides to the new item on navigation (instant
                    // under prefers-reduced-motion via MotionConfig).
                    <Box
                      as={motion.span}
                      layoutId="nav-active"
                      aria-hidden
                      position="absolute"
                      left="10px"
                      right="10px"
                      bottom="-1px"
                      h="1.5px"
                      borderRadius="full"
                      bg="var(--accent)"
                      transition={{ type: 'spring', stiffness: 520, damping: 40 } as any}
                    />
                  ) : null}
                </Link>
              )
            })}
          </Flex>

          {/* Right: utility */}
          <Flex alignItems="center" gap={2}>
            {/* ⌘K search trigger — opens the full CommandPalette */}
            <Button
              size="sm"
              variant="outline"
              h="32px"
              px={2.5}
              borderColor="page.border"
              color="page.fg-subtle"
              fontFamily={MONO}
              fontSize="11px"
              fontWeight={500}
              letterSpacing="0.02em"
              _hover={{ borderColor: 'page.border-strong', color: 'page.fg' }}
              leftIcon={<SearchIcon boxSize="10px" />}
              iconSpacing={{ base: 0, md: 2 }}
              onClick={() => openPalette()}
              onPointerEnter={preloadCommandPalette}
              onFocus={preloadCommandPalette}
              aria-label="Open command palette"
              aria-haspopup="dialog"
              aria-keyshortcuts={paletteKeyShortcuts(isMac, shortcutsOn)}
            >
              <Text as="span" display={{ base: 'none', xl: 'inline' }} mr={2}>
                Search
              </Text>
              <Kbd
                display={{ base: 'none', md: 'inline-block' }}
                fontSize="10px"
                bg="transparent"
                border="1px solid"
                borderColor="page.border"
                color="page.fg-subtle"
                // No keyboard hint on touch-first devices (components/Chrome/platform).
                sx={HIDE_ON_COARSE_POINTER}
              >
                {paletteShortcutLabel(isMac)}
              </Kbd>
            </Button>

            {/* Theme toggle: the new mode is revealed from this button. */}
            <IconButton
              size="sm"
              variant="ghost"
              color="page.fg-subtle"
              _hover={{ color: 'page.fg', bg: 'page.hover' }}
              aria-label={themeLabel}
              title={themeLabel}
              icon={<ThemeIcon />}
              onClick={(e) => toggleThemeWithTransition(toggleColorMode, e.currentTarget)}
            />

            {/*
              Admin entry — hidden when logged out (per spec: 不要直接显示).
              Reach /admin/login through the ⌘K command palette ("Admin login")
              or by typing the URL directly. The logged-in pair (Dashboard +
              Logout) stays visible because an authenticated admin needs an
              obvious way back to the dashboard / out of the session.
            */}
            {isAdmin && (
              <Flex gap={1} display={{ base: 'none', lg: 'flex' }}>
                <Button
                  as={NextLink}
                  href="/admin/dashboard"
                  size="sm"
                  variant="outline"
                  h="32px"
                  borderColor="page.border"
                  color="page.fg-secondary"
                  fontSize="13px"
                  fontWeight={500}
                  _hover={{ borderColor: 'page.border-strong', color: 'page.fg' }}
                >
                  Dashboard
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  h="32px"
                  color="page.fg-subtle"
                  fontSize="13px"
                  _hover={{ color: 'page.fg', bg: 'page.hover' }}
                  onClick={logout}
                  title="Sign out on every device"
                >
                  Logout
                </Button>
              </Flex>
            )}

            <IconButton
              icon={<MenuIcon />}
              onClick={openDrawer}
              onPointerDown={preloadMobileDrawer}
              onFocus={preloadMobileDrawer}
              variant="ghost"
              size="sm"
              aria-label="Open menu"
              aria-haspopup="dialog"
              aria-expanded={isOpen}
              aria-controls={MOBILE_MENU_DIALOG_ID}
              display={{ base: 'inline-flex', lg: 'none' }}
              color="page.fg-subtle"
              _hover={{ color: 'page.fg', bg: 'page.hover' }}
            />
          </Flex>
        </Flex>
      </Box>

      {drawerRequested && (
        <MobileDrawer
          isOpen={isOpen}
          onClose={onClose}
          socials={socials}
          isAdmin={isAdmin}
          onLogout={logout}
          onSearch={searchFromDrawer}
          onCloseComplete={onDrawerCloseComplete}
          returnFocusOnClose={dialogsReturnFocus}
        />
      )}

      {paletteRequested && (
        <CommandPaletteLazy
          isOpen={cmdkOpen}
          onClose={closeCmdk}
          isAdmin={isAdmin}
          initialQuery={paletteQuery}
          returnFocusOnClose={dialogsReturnFocus}
        />
      )}
    </>
  )
}

export default Header
