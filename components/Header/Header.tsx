import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Box,
  Text,
  Button,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerCloseButton,
  useDisclosure,
  Flex,
  IconButton,
  Link,
  useToast,
  useColorMode,
  Kbd,
} from '@chakra-ui/react'
import NextLink from 'next/link'
import { useRouter } from 'next/router'
import { motion } from 'framer-motion'
import { TfiAlignJustify } from 'react-icons/tfi'
import { FaGithub, FaGitlab, FaLinkedin, FaWhatsapp } from 'react-icons/fa'
import { MoonIcon, SunIcon, SearchIcon } from '@chakra-ui/icons'
import CommandPalette from '../General-UI/CommandPalette'
import {
  PRIMARY_LINKS,
  SOCIAL_LINKS,
  type SocialLink,
  type SocialName,
  formatAge,
  isActiveRoute,
  shouldRecheckSession,
  splitBrand,
} from '../Chrome/chrome'
import { useBrandHost } from '../Chrome/useBrandHost'

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
 */

const SOCIAL_ICONS: Record<SocialName, React.ReactElement> = {
  GitHub: <FaGithub />,
  GitLab: <FaGitlab />,
  LinkedIn: <FaLinkedin />,
  WhatsApp: <FaWhatsapp />,
}

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'

/** Mono uppercase group label used inside the mobile drawer. */
function DrawerLabel({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <Text
      id={id}
      fontFamily={MONO}
      fontSize="11px"
      letterSpacing="0.12em"
      textTransform="uppercase"
      color="page.fg-subtle"
      mb={2}
    >
      {children}
    </Text>
  )
}

/** "● Last commit · 2h ago" — fetched once per visit (the header is persistent). */
function LiveStatus() {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/github/events')
        if (!res.ok) return
        const data = (await res.json()) as { events?: { type?: string; created_at?: string }[] }
        const events = data.events || []
        const created = (events.find((e) => e.type === 'PushEvent') || events[0])?.created_at
        if (!created || cancelled) return
        setText(formatAge(created, Date.now()))
      } catch {
        // Best effort: the pill simply stays hidden.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

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

/** Moon in light mode, sun in dark — switched by CSS so the first paint is right. */
function ThemeIcon() {
  return (
    <>
      <MoonIcon aria-hidden _dark={{ display: 'none' }} />
      <SunIcon aria-hidden display="none" _dark={{ display: 'inline-block' }} />
    </>
  )
}

/** `socials`: the profile links to offer in the drawer (SiteChrome resolves them from home.socials). */
const Header = ({ socials = SOCIAL_LINKS }: { socials?: readonly SocialLink[] }) => {
  const router = useRouter()
  const toast = useToast()
  const [isAdmin, setIsAdmin] = useState(false)
  const { isOpen, onOpen, onClose } = useDisclosure()
  const { isOpen: cmdkOpen, onOpen: openCmdk, onClose: closeCmdk } = useDisclosure()
  const { colorMode, toggleColorMode } = useColorMode()
  const firstDrawerLinkRef = useRef<HTMLAnchorElement>(null)
  const brand = useBrandHost()
  const [brandHead, brandTail] = splitBrand(brand)

  // The session cookie is httpOnly (invisible to document.cookie), so ask the
  // server (always 200 → { authenticated }). Once on mount, then only when a
  // navigation can have changed the answer (see shouldRecheckSession). Only
  // the newest response is applied, and an in-flight check is never dropped
  // just because the visitor navigated meanwhile.
  const isAdminRef = useRef(isAdmin)
  isAdminRef.current = isAdmin
  const sessionSeq = useRef(0)
  const checkSession = useCallback(() => {
    const seq = ++sessionSeq.current
    fetch('/api/admin/session', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { authenticated: false }))
      .then((d) => {
        if (seq === sessionSeq.current) setIsAdmin(!!d?.authenticated)
      })
      .catch(() => {})
  }, [])
  useEffect(() => {
    checkSession()
    return () => {
      // Unmounted: ignore any response still in flight.
      sessionSeq.current += 1
    }
  }, [checkSession])
  const pathname = router.pathname
  const lastPathRef = useRef(pathname)
  useEffect(() => {
    const prev = lastPathRef.current
    lastPathRef.current = pathname
    if (shouldRecheckSession(prev, pathname, isAdminRef.current)) checkSession()
  }, [pathname, checkSession])

  // The drawer belongs to the page it was opened on: close it whenever a
  // navigation starts (links, ⌘K, "G then …" shortcuts, Back/Forward).
  useEffect(() => {
    router.events.on('routeChangeStart', onClose)
    return () => router.events.off('routeChangeStart', onClose)
  }, [router.events, onClose])

  const [isMac, setIsMac] = useState(true)
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent))
  }, [])

  // Global ⌘K / Ctrl+K to open the command palette from any page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (cmdkOpen) closeCmdk()
        else openCmdk()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [cmdkOpen, openCmdk, closeCmdk])

  const logout = async () => {
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
  }

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
        className="no-print"
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
              onClick={openCmdk}
              aria-label="Open command palette"
              aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
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
              >
                {isMac ? '⌘K' : 'Ctrl K'}
              </Kbd>
            </Button>

            {/* Theme toggle */}
            <IconButton
              size="sm"
              variant="ghost"
              color="page.fg-subtle"
              _hover={{ color: 'page.fg', bg: 'page.hover' }}
              aria-label={themeLabel}
              title={themeLabel}
              icon={<ThemeIcon />}
              onClick={toggleColorMode}
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
              icon={<TfiAlignJustify />}
              onClick={onOpen}
              variant="ghost"
              size="sm"
              aria-label="Open menu"
              aria-haspopup="dialog"
              aria-expanded={isOpen}
              display={{ base: 'inline-flex', lg: 'none' }}
              color="page.fg-subtle"
              _hover={{ color: 'page.fg', bg: 'page.hover' }}
            />
          </Flex>
        </Flex>
      </Box>

      {/*
        Mobile drawer: every primary link, then socials, theme and (signed in)
        admin. Chakra's Drawer traps focus and closes on Escape; the first
        link receives focus on open.
      */}
      <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="xs" initialFocusRef={firstDrawerLinkRef}>
        <DrawerOverlay bg="rgba(0,0,0,0.6)" backdropFilter="blur(4px)" />
        <DrawerContent bg="page.bg" color="page.fg" borderLeft="1px solid" borderColor="page.border">
          <DrawerCloseButton top="10px" color="page.fg-subtle" _hover={{ color: 'page.fg', bg: 'page.hover' }} />
          <DrawerHeader
            borderBottomWidth="1px"
            borderColor="page.border"
            fontFamily={MONO}
            fontSize="11px"
            fontWeight={500}
            letterSpacing="0.12em"
            textTransform="uppercase"
            color="page.fg-subtle"
            py={4}
          >
            Menu
          </DrawerHeader>
          <DrawerBody py={4}>
            <Flex direction="column" gap={5}>
              <Box as="nav" aria-labelledby="drawer-nav-label">
                <DrawerLabel id="drawer-nav-label">Navigate</DrawerLabel>
                <Flex direction="column" gap={1}>
                  {PRIMARY_LINKS.map((link, i) => {
                    const active = isActiveRoute(router.pathname, link.url)
                    return (
                      <Link
                        key={link.name}
                        as={NextLink}
                        href={link.url}
                        ref={i === 0 ? firstDrawerLinkRef : undefined}
                        aria-current={active ? 'page' : undefined}
                        onClick={onClose}
                        display="flex"
                        alignItems="center"
                        h="44px"
                        px={3}
                        fontSize="15px"
                        fontWeight={active ? 600 : 500}
                        color={active ? 'page.fg' : 'page.fg-secondary'}
                        bg={active ? 'page.hover' : undefined}
                        borderLeft="2px solid"
                        borderColor={active ? 'var(--accent)' : 'transparent'}
                        borderRadius="0 6px 6px 0"
                        _hover={{ color: 'page.fg', bg: 'page.hover', textDecoration: 'none' }}
                        _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '-2px' }}
                      >
                        {link.name}
                      </Link>
                    )
                  })}
                </Flex>
              </Box>

              <Box>
                <DrawerLabel>Elsewhere</DrawerLabel>
                <Flex gap={2} wrap="wrap">
                  {socials.map((s) => (
                    <IconButton
                      key={s.name}
                      as="a"
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      icon={SOCIAL_ICONS[s.name]}
                      variant="outline"
                      size="md"
                      borderColor="page.border"
                      color="page.fg-subtle"
                      _hover={{ color: 'page.fg', borderColor: 'page.border-strong' }}
                      aria-label={`${s.name} (opens in a new tab)`}
                      title={s.name}
                    />
                  ))}
                </Flex>
              </Box>

              <Button
                onClick={toggleColorMode}
                variant="outline"
                borderColor="page.border"
                color="page.fg-secondary"
                size="sm"
                w="100%"
                leftIcon={<ThemeIcon />}
                _hover={{ borderColor: 'page.border-strong', color: 'page.fg' }}
              >
                {isDark ? 'Light mode' : 'Dark mode'}
              </Button>

              {/*
                Mobile admin section — matches desktop: hidden when logged
                out. Visitors reach /admin/login via ⌘K or by typing the URL.
              */}
              {isAdmin && (
                <Box>
                  <DrawerLabel>Admin</DrawerLabel>
                  <Flex direction="column" gap={2}>
                    <Button
                      as={NextLink}
                      href="/admin/dashboard"
                      size="sm"
                      variant="outline"
                      borderColor="page.border"
                      color="page.fg-secondary"
                      _hover={{ borderColor: 'page.border-strong', color: 'page.fg' }}
                      onClick={onClose}
                    >
                      Dashboard
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      color="page.fg-subtle"
                      _hover={{ color: 'page.fg', bg: 'page.hover' }}
                      onClick={() => {
                        onClose()
                        logout()
                      }}
                    >
                      Logout
                    </Button>
                  </Flex>
                </Box>
              )}
            </Flex>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* Global ⌘K command palette (lazy-fetched dynamic items on first open) */}
      <CommandPalette isOpen={cmdkOpen} onClose={closeCmdk} />
    </>
  )
}

export default Header
