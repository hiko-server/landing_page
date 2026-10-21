import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Text, Button, useDisclosure, Flex, IconButton, Link, Kbd } from '@chakra-ui/react'
import NextLink from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { m } from 'framer-motion'
import CommandPaletteLazy, { preloadCommandPalette } from '../General-UI/CommandPaletteLazy'
import {
  MOBILE_MENU_DIALOG_ID,
  PRIMARY_LINKS,
  SOCIAL_LINKS,
  type NavLink,
  type SocialLink,
  isActiveLink,
  shouldProbeSession,
  shouldRecheckSession,
  splitBrand,
} from '../Chrome/chrome'
import { useBrandHost } from '../Chrome/useBrandHost'
import { useChromeToast } from '../Chrome/useChromeToast'
import { useChromeUi } from '../Chrome/chromeLang'
import { fillUi } from '../../lib/uiStrings'
import LanguageSwitch from './LanguageSwitch'
import { ZH_LANG } from '../../lib/zhRoutes'
import { useShortcutsEnabled } from '../Chrome/useShortcutsEnabled'
import { HIDE_ON_COARSE_POINTER, isApplePlatform, paletteKeyShortcuts, paletteShortcutLabel } from '../Chrome/platform'
import {
  OPEN_PALETTE_EVENT,
  normalizePaletteMode,
  normalizePalettePage,
  normalizePaletteQuery,
  type OpenPaletteDetail,
  type OpenPaletteOptions,
  type PaletteMode,
} from '../Chrome/paletteEvents'
import type { PalettePage } from '../General-UI/paletteModel'
import { MenuIcon, SearchIcon } from '../Icons/ui/chrome'
import { isImeComposing } from '../../lib/keyboardShortcuts'
import { pageKeyOf } from '../../lib/viewTransition'
import ThemeControl from './ThemeControl'
import type AdminMenu from './AdminMenu'

/**
 * v6 Header — rendered once by components/Chrome/SiteChrome (persistent across
 * client-side navigations).
 *
 * Layout (lg+):      [logo · admin ▾ · live-status]  [primary nav]  [中文 · ⌘K · theme ▾]
 *                    (a 1fr · auto · 1fr grid: the nav is centred and never
 *                    moves when a side changes width from page to page, or
 *                    when the signed-in owner's menu appears — ./AdminMenu)
 * Layout (< lg):     [logo]                [中文 · ⌘K · theme ▾ · hamburger → drawer]
 *
 * Every word comes from the chrome's dictionary (lib/uiStrings/chrome,
 * components/Chrome/chromeLang): Chinese on a Chinese page. The language
 * switch (./LanguageSwitch) links this page's version in the other
 * language and is absent when there is none (F3).
 *
 * Breakpoints are pure CSS (no JS media query) and every colour is a semantic
 * token (CSS variable), so the header is correct on the very first paint at
 * every width and in both colour modes.
 *
 * Weight: the ⌘K palette, the mobile drawer, the theme menu and the
 * signed-in owner's menu are separate chunks, fetched when first needed (and
 * warmed on hover / focus / idle, or with the session check); icons are
 * inline (components/Icons/ui/chrome).
 */

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'

const LiveStatusPill = dynamic(() => import('./LiveStatusPill'), { ssr: false, loading: () => null })

// The signed-in owner's menu (./AdminMenu): its own chunk, fetched only for
// a visitor who can be signed in (alongside the session check).
const loadAdminMenu = () => import('./AdminMenu').then((m) => m.default, () => null)

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

/**
 * "● Last commit · 2h ago" — only where it is shown (md+). The pill is
 * client-only (its age is computed in the browser), so its code is a chunk
 * of its own, fetched once the header knows it is wide enough.
 */
function LiveStatus() {
  const wide = useMediaQuery('(min-width: 48em)')
  return wide ? <LiveStatusPill /> : null
}

/**
 * `socials`: the profile links to offer in the drawer (SiteChrome resolves
 * them from home.socials); `navLinks`: the primary navigation (chrome
 * navLinksFor); `publications`: /publications exists (the ⌘K palette lists it).
 */
const Header = ({
  socials = SOCIAL_LINKS,
  navLinks = PRIMARY_LINKS,
  publications = false,
}: {
  socials?: readonly SocialLink[]
  navLinks?: readonly NavLink[]
  publications?: boolean
}) => {
  const router = useRouter()
  const toast = useChromeToast()
  // The chrome's words (F3: Chinese on a Chinese page) and the page's other-language versions.
  const { t, lang: uiLang, links: langLinks } = useChromeUi()
  const [isAdmin, setIsAdmin] = useState(false)
  // The owner's menu, once its code is in; and whether the header knows who
  // is visiting. The live status waits for that (at once for a visitor who
  // cannot be signed in), so the menu never appears in front of it later.
  const [OwnerMenu, setOwnerMenu] = useState<typeof AdminMenu | null>(null)
  const [visitorKnown, setVisitorKnown] = useState(false)
  const { isOpen, onOpen, onClose } = useDisclosure()
  const { isOpen: cmdkOpen, onOpen: openCmdk, onClose: closeCmdk } = useDisclosure()
  // The lazy chunks are rendered from the first time they are asked for on.
  const [paletteRequested, setPaletteRequested] = useState(false)
  // Text the palette opens with (the 404 page's search field); '' otherwise.
  const [paletteQuery, setPaletteQuery] = useState('')
  // The nested page it opens on ("?" → Keyboard shortcuts), and whether it
  // was opened from the keyboard (it then appears at once, no entrance).
  const [palettePage, setPalettePage] = useState<PalettePage | null>(null)
  const [paletteInstant, setPaletteInstant] = useState(false)
  // The mode it opens in ('ask' from the "Ask Lucian" entry on /about and /contact).
  const [paletteMode, setPaletteMode] = useState<PaletteMode>('search')
  const [drawerRequested, setDrawerRequested] = useState(false)
  const brand = useBrandHost()
  const [brandHead, brandTail] = splitBrand(brand)
  const shortcutsOn = useShortcutsEnabled()
  // A dialog closed because the visitor left the page must not pull focus
  // back to its trigger in the header: focus moves into the new page's
  // <main> instead (components/Chrome/routeFocus.ts).
  const [dialogsReturnFocus, setDialogsReturnFocus] = useState(true)

  const openPalette = useCallback(
    (query = '', { page = null, instant = false, mode = 'search' }: OpenPaletteOptions = {}) => {
      setDialogsReturnFocus(true)
      setPaletteQuery(query)
      setPalettePage(page)
      setPaletteInstant(instant)
      setPaletteMode(mode)
      setPaletteRequested(true)
      openCmdk()
    },
    [openCmdk],
  )

  // Page content and the keyboard layer ("/", "?") ask for the palette
  // (components/Chrome/paletteEvents).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenPaletteDetail>).detail
      openPalette(normalizePaletteQuery(detail?.query), {
        page: normalizePalettePage(detail?.page),
        instant: detail?.instant === true,
        mode: normalizePaletteMode(detail?.mode),
      })
    }
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
      setVisitorKnown(true)
      return
    }
    const menu = loadAdminMenu()
    fetch('/api/admin/session', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { authenticated: false }))
      .then(async (d) => {
        // Signed in: the menu's code first, so it shows with the answer.
        const Menu = d?.authenticated ? await menu : null
        if (seq !== sessionSeq.current) return
        if (Menu) setOwnerMenu(() => Menu)
        setIsAdmin(!!d?.authenticated)
      })
      .catch(() => {})
      .finally(() => setVisitorKnown(true))
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

  // ⌘K / Ctrl+K toggles the palette anywhere (keys typed into an input
  // method's composition are never shortcuts). It opens at once, without the
  // entrance animation. The single-key shortcuts ("/", "?", "G then …",
  // J / K, …) are the keyboard layer's (components/Chrome/KeyboardLayer.tsx).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isImeComposing(e)) return
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        // A focused widget that owns ⌘K (the rich editor's link form) handled it.
        if (e.defaultPrevented) return
        e.preventDefault()
        if (cmdkOpen) closeCmdk()
        else openPalette('', { instant: true })
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [cmdkOpen, openPalette, closeCmdk])

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
      toast({ status: 'success', title: t.loggedOut })
      router.replace('/')
    } catch {
      toast({ status: 'error', title: t.logoutFailed })
    }
  }, [router, toast, t])

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
        // .site-header: the hairline comes in once the page scrolls (globals.css).
        className="no-print glass site-header"
      >
        <Flex
          maxW="var(--container-content)"
          mx="auto"
          px={{ base: 4, md: 6, lg: 8 }}
          h="56px"
          alignItems="center"
          justifyContent="space-between"
          gap={4}
          // lg+: three columns with the nav in the middle one, so the nav
          // sits at the same place on every page — whether this page has a
          // language switch, the live status has loaded, or the labels are
          // Chinese (it then narrows about its centre), or the owner is
          // signed in (./AdminMenu sits in the left share, which always has
          // room for it). The side columns share what is left; a side wider
          // than its share (the right-hand group beside a nine-link nav at
          // 992 px) takes what it needs, the same on every page.
          display={{ base: 'flex', lg: 'grid' }}
          gridTemplateColumns={{ lg: '1fr auto 1fr' }}
        >
          {/* Left: brand (+ the signed-in owner's menu, lg+) + live status.
              6 px between the wordmark and the menu; the live status keeps
              20 px before it (its own margin, ./LiveStatusPill). */}
          <Flex alignItems="center" gap={1.5} minW={0} justifySelf="start">
            <Link
              as={NextLink}
              href="/"
              aria-label={fillUi(t.homeLink, { brand })}
              display="inline-flex"
              alignItems="center"
              minH="44px"
              fontFamily={MONO}
              fontSize="13px"
              fontWeight={600}
              letterSpacing="-0.01em"
              // The domain is always Latin: it keeps its tracking on a Chinese page (globals.css).
              data-script="latin"
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
            {/* Signed in only (per spec: 不要直接显示 — /admin/login is
                reached through ⌘K "Admin login" or its URL); a signed-in
                owner keeps an obvious way to the dashboard and out. */}
            {isAdmin && OwnerMenu ? <OwnerMenu onLogout={logout} /> : null}
            {visitorKnown && <LiveStatus />}
          </Flex>

          {/* Center: primary nav (lg+) */}
          <Flex
            as="nav"
            aria-label={t.primaryNav}
            alignItems="center"
            gap={1}
            display={{ base: 'none', lg: 'flex' }}
            fontSize="14px"
            color="page.fg-secondary"
          >
            {navLinks.map((l) => {
              const active = isActiveLink(router.pathname, l)
              return (
                <Link
                  key={l.name}
                  as={NextLink}
                  href={l.url}
                  aria-current={active ? 'page' : undefined}
                  position="relative"
                  // 10 px; 7 px with nine links (globals.css "Header row with nine primary links").
                  px="var(--nav-item-px, 10px)"
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
                      as={m.span}
                      layoutId="nav-active"
                      aria-hidden
                      position="absolute"
                      left="var(--nav-item-px, 10px)"
                      right="var(--nav-item-px, 10px)"
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
          <Flex alignItems="center" gap={2} justifySelf="end">
            {/* This page in the other language, when it has one (F3). From
                lg up its place is kept on a page without one, so the nav does
                not move from page to page. */}
            <LanguageSwitch links={langLinks} reserveFor={uiLang === 'en' ? ZH_LANG : 'en'} />

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
              leftIcon={<SearchIcon size="xs" />}
              iconSpacing={{ base: 0, md: 2 }}
              onClick={() => openPalette()}
              onPointerEnter={preloadCommandPalette}
              onFocus={preloadCommandPalette}
              aria-label={t.openPalette}
              aria-haspopup="dialog"
              aria-keyshortcuts={paletteKeyShortcuts(isMac, shortcutsOn)}
            >
              <Text as="span" display={{ base: 'none', xl: 'inline' }} mr={2} data-search-label="">
                {t.search}
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

            {/* Theme: one-tap toggle (the new mode is revealed from it) + the
                System / Light / Dark menu. */}
            <ThemeControl />

            <IconButton
              icon={<MenuIcon size="sm" />}
              onClick={openDrawer}
              onPointerDown={preloadMobileDrawer}
              onFocus={preloadMobileDrawer}
              variant="ghost"
              size="sm"
              aria-label={t.openMenu}
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
          navLinks={navLinks}
          langLinks={langLinks}
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
          initialPage={palettePage}
          instant={paletteInstant}
          initialMode={paletteMode}
          publications={publications}
          returnFocusOnClose={dialogsReturnFocus}
        />
      )}
    </>
  )
}

export default Header
