import React, { useEffect, useState } from 'react'
import {
  Box,
  Text,
  Button,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  useDisclosure,
  Flex,
  IconButton,
  Link,
  useToast,
  useColorMode,
  useColorModeValue,
  Kbd,
} from '@chakra-ui/react'
import NextLink from 'next/link'
import { useRouter } from 'next/router'
import { motion } from 'framer-motion'
import { TfiAlignJustify } from 'react-icons/tfi'
import {
  FaGithub,
  FaGitlab,
  FaLinkedin,
  FaWhatsapp,
} from 'react-icons/fa'
import { MoonIcon, SunIcon, SearchIcon } from '@chakra-ui/icons'
import Footer from '../Footer/Footer'
import CommandPalette from '../General-UI/CommandPalette'

// The header "brand mark" tracks the site's domain automatically: it seeds from
// the configured site host for SSR/first paint, then switches to the live
// hostname after hydration. Change the domain and the wordmark follows with no
// code edit. The TLD-like suffix (after the last dot) gets the accent colour.
const BRAND_FALLBACK =
  process.env.NEXT_PUBLIC_SITE_HOST || process.env.NEXT_PUBLIC_PRODUCT_NAME || 'lucian-dev.com'

function normalizeHost(host: string): string {
  return host.replace(/^www\./i, '').replace(/:\d+$/, '')
}

/**
 * v6 Header
 *
 * Layout (lg+):      [logo · live-status]  [primary nav]  [⌘K · theme · admin]
 * Layout (< lg):     [logo]                [⌘K · theme · hamburger → drawer]
 *
 * Breakpoints are pure CSS (no JS media query), so the right controls render
 * on the very first paint on every route and at every width.
 *
 * Preserves every original capability from v5:
 *   - All routes (Home, About, Contact, CV, Crypto, QuickPayment)
 *   - Social links (GitHub, LinkedIn, WhatsApp)
 *   - Theme toggle
 *   - Admin login / dashboard / logout flow (cv_admin_token cookie)
 *   - Mobile drawer
 *
 * Visual changes vs v5:
 *   - teal accent → indigo (var(--accent))
 *   - icon-only quick buttons → readable text links with hover-underline
 *   - mono brand mark auto-derived from the live domain, accent on the TLD suffix
 *   - live-status pill (● Last commit · Nh ago) — fetches /api/github/events on mount
 *   - ⌘K search trigger placeholder (cmd palette UI lands in a later phase)
 */

const primaryLinks = [
  { name: 'Home', url: '/' },
  { name: 'About', url: '/about' },
  { name: 'Work', url: '/work' },
  { name: 'Writing', url: '/blog' },
  { name: 'CV', url: '/cv' },
  { name: 'Now', url: '/now' },
  { name: 'Uses', url: '/uses' },
  { name: 'Contact', url: '/contact' },
]

const utilityLinks: { name: string; url: string }[] = []

const socialLinks = [
  { name: 'GitHub', url: 'https://github.com/HikoPLi', icon: <FaGithub /> },
  { name: 'GitLab', url: 'https://gitlab.com/HikoPLi', icon: <FaGitlab /> },
  { name: 'LinkedIn', url: 'https://www.linkedin.com/in/liyanpeihiko/', icon: <FaLinkedin /> },
  { name: 'WhatsApp', url: 'https://wa.me/85262040827', icon: <FaWhatsapp /> },
]

function LiveStatus() {
  const [text, setText] = useState<string | null>(null)
  const muted = useColorModeValue('gray.600', 'gray.400')

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
        const diffMs = Date.now() - new Date(created).getTime()
        const minutes = Math.max(0, Math.floor(diffMs / 60000))
        const label =
          minutes < 60
            ? `${minutes}m ago`
            : minutes < 60 * 24
              ? `${Math.floor(minutes / 60)}h ago`
              : `${Math.floor(minutes / 60 / 24)}d ago`
        setText(label)
      } catch {
    /* best effort — render with what we have */
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
      fontFamily="var(--font-geist-mono), monospace"
      fontSize="11px"
      color={muted}
      letterSpacing="0.02em"
      title={`Last commit · ${text}`}
    >
      <Box position="relative" w="6px" h="6px">
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

/** Current route matches a nav link (exact for "/", prefix otherwise). */
function isActive(pathname: string, url: string) {
  if (url === '/') return pathname === '/'
  return pathname === url || pathname.startsWith(`${url}/`)
}

const Header = () => {
  const router = useRouter()
  const toast = useToast()
  const [isAdmin, setIsAdmin] = useState(false)
  const { isOpen, onOpen, onClose } = useDisclosure()
  const {
    isOpen: cmdkOpen,
    onOpen: openCmdk,
    onClose: closeCmdk,
  } = useDisclosure()
  const { colorMode, toggleColorMode } = useColorMode()

  // The session cookie is httpOnly (invisible to document.cookie), so ask the
  // server (always 200 → { authenticated }).
  useEffect(() => {
    let alive = true
    fetch('/api/admin/session', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { authenticated: false }))
      .then((d) => alive && setIsAdmin(!!d?.authenticated))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [router.asPath])

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
      await fetch('/api/admin/logout', { method: 'POST' })
      setIsAdmin(false)
      toast({ status: 'success', title: 'Logged out' })
      router.replace('/')
    } catch (e) {
      toast({ status: 'error', title: 'Logout failed' })
    }
  }

  // Tokens (computed via Chakra so dark/light mode resolve automatically)
  const headerBg = useColorModeValue('rgba(253,253,253,0.75)', 'rgba(5,5,5,0.75)')
  const borderColor = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.10)')
  const linkColor = useColorModeValue('gray.700', 'gray.300')
  const linkHover = useColorModeValue('black', 'white')
  const subtle = useColorModeValue('gray.600', 'gray.400')
  const drawerBg = useColorModeValue('white', 'gray.900')
  const activeBg = useColorModeValue('rgba(0,0,0,0.04)', 'rgba(255,255,255,0.06)')

  // Brand mark, auto-derived from the domain (see BRAND_FALLBACK note above):
  // SSR/first paint uses the configured fallback, then the client swaps in the
  // real hostname. Split on the last dot so the TLD-like suffix gets the accent.
  const [brand, setBrand] = useState(() => normalizeHost(BRAND_FALLBACK))
  useEffect(() => {
    const host = typeof window !== 'undefined' ? window.location?.hostname : ''
    if (host) setBrand(normalizeHost(host))
  }, [])
  const brandDot = brand.lastIndexOf('.')
  const brandHead = brandDot > 0 ? brand.slice(0, brandDot) : brand
  const brandTail = brandDot > 0 ? brand.slice(brandDot) : ''

  return (
    <>
      <Box
        as="header"
        position="relative"
        w="100%"
        bg={headerBg}
        backdropFilter="blur(14px)"
        borderBottom="1px solid"
        borderColor={borderColor}
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
              aria-label="Home"
              fontFamily="var(--font-geist-mono), monospace"
              fontSize="13px"
              fontWeight={600}
              letterSpacing="-0.01em"
              _hover={{ textDecoration: 'none' }}
              whiteSpace="nowrap"
            >
              <Text as="span">{brandHead}</Text>
              {brandTail && <Text as="span" color="var(--accent)">{brandTail}</Text>}
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
            color={linkColor}
          >
            {primaryLinks.map((l) => {
              const active = isActive(router.pathname, l.url)
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
                  color={active ? linkHover : undefined}
                  fontWeight={active ? 500 : 400}
                  _hover={{ color: linkHover, textDecoration: 'none', bg: activeBg }}
                  transition="color 150ms, background-color 150ms"
                >
                  {l.name}
                  {active ? (
                    <Box
                      as={motion.span}
                      layoutId="nav-active"
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
                borderColor={borderColor}
                color={subtle}
                fontFamily="var(--font-geist-mono), monospace"
                fontSize="11px"
                fontWeight={500}
                letterSpacing="0.02em"
                _hover={{ borderColor: linkColor, color: linkHover }}
                leftIcon={<SearchIcon boxSize="10px" />}
                iconSpacing={{ base: 0, md: 2 }}
                onClick={openCmdk}
                aria-label="Open command palette"
                aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
              >
                <Text as="span" display={{ base: 'none', xl: 'inline' }} mr={2}>Search</Text>
                <Kbd
                  display={{ base: 'none', md: 'inline-block' }}
                  fontSize="10px"
                  bg="transparent"
                  border="1px solid"
                  borderColor={borderColor}
                  color={subtle}
                >
                  {isMac ? '⌘K' : 'Ctrl K'}
                </Kbd>
              </Button>

              {/* Theme toggle */}
              <IconButton
                size="sm"
                variant="ghost"
                color={subtle}
                _hover={{ color: linkHover, bg: 'transparent' }}
                aria-label="Toggle color mode"
                title={colorMode === 'light' ? 'Switch to dark' : 'Switch to light'}
                icon={colorMode === 'light' ? <MoonIcon /> : <SunIcon />}
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
                    borderColor={borderColor}
                    color={linkColor}
                    fontSize="13px"
                    fontWeight={500}
                    _hover={{ borderColor: linkColor, color: linkHover }}
                  >
                    Dashboard
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    h="32px"
                    color={subtle}
                    fontSize="13px"
                    _hover={{ color: linkHover }}
                    onClick={logout}
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
                aria-expanded={isOpen}
                display={{ base: 'inline-flex', lg: 'none' }}
                color={subtle}
                _hover={{ color: linkHover, bg: 'transparent' }}
              />
          </Flex>
        </Flex>
      </Box>

      {/* Mobile drawer (preserves all links + admin) */}
      <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="xs">
        <DrawerOverlay bg="rgba(0,0,0,0.6)" backdropFilter="blur(4px)" />
        <DrawerContent bg={drawerBg}>
          <DrawerHeader
            borderBottomWidth="1px"
            borderColor={borderColor}
            fontFamily="var(--font-geist-mono), monospace"
            fontSize="11px"
            letterSpacing="0.12em"
            textTransform="uppercase"
            color={subtle}
          >
            Menu
          </DrawerHeader>
          <DrawerBody py={4}>
            <Flex direction="column" gap={3}>
              <Box>
                <Text
                  fontFamily="var(--font-geist-mono), monospace"
                  fontSize="10px"
                  letterSpacing="0.12em"
                  textTransform="uppercase"
                  color={subtle}
                  mb={2}
                >
                  Navigate
                </Text>
                <Flex direction="column" gap={1}>
                  {primaryLinks.concat(utilityLinks).map((link) => {
                    const active = isActive(router.pathname, link.url)
                    return (
                      <Button
                        key={link.name}
                        as={NextLink}
                        href={link.url}
                        aria-current={active ? 'page' : undefined}
                        variant="ghost"
                        justifyContent="flex-start"
                        onClick={onClose}
                        h="40px"
                        fontWeight={active ? 600 : 500}
                        color={active ? linkHover : linkColor}
                        bg={active ? activeBg : undefined}
                        borderLeft="2px solid"
                        borderColor={active ? 'var(--accent)' : 'transparent'}
                        borderRadius="0 6px 6px 0"
                        _hover={{ color: linkHover, bg: activeBg }}
                      >
                        {link.name}
                      </Button>
                    )
                  })}
                </Flex>
              </Box>

              <Box mt={2}>
                <Text
                  fontFamily="var(--font-geist-mono), monospace"
                  fontSize="10px"
                  letterSpacing="0.12em"
                  textTransform="uppercase"
                  color={subtle}
                  mb={2}
                >
                  Elsewhere
                </Text>
                <Flex gap={2} wrap="wrap">
                  {socialLinks.map((s) => (
                    <IconButton
                      key={s.name}
                      as="a"
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      icon={s.icon}
                      variant="outline"
                      size="sm"
                      borderColor={borderColor}
                      color={subtle}
                      _hover={{ color: linkHover, borderColor: linkColor }}
                      aria-label={s.name}
                    />
                  ))}
                </Flex>
              </Box>

              <Box mt={2}>
                <Button
                  onClick={toggleColorMode}
                  variant="outline"
                  borderColor={borderColor}
                  color={linkColor}
                  size="sm"
                  w="100%"
                  leftIcon={colorMode === 'light' ? <MoonIcon /> : <SunIcon />}
                  _hover={{ borderColor: linkColor, color: linkHover }}
                >
                  {colorMode === 'light' ? 'Dark mode' : 'Light mode'}
                </Button>
              </Box>

              {/*
                Mobile admin section — matches desktop: hidden when logged
                out. Visitors reach /admin/login via ⌘K or by typing the URL.
              */}
              {isAdmin && (
                <Box mt={2}>
                  <Text
                    fontFamily="var(--font-geist-mono), monospace"
                    fontSize="10px"
                    letterSpacing="0.12em"
                    textTransform="uppercase"
                    color={subtle}
                    mb={2}
                  >
                    Admin
                  </Text>
                  <Flex direction="column" gap={2}>
                    <Button
                      as={NextLink}
                      href="/admin/dashboard"
                      size="sm"
                      variant="outline"
                      borderColor={borderColor}
                      color={linkColor}
                      _hover={{ borderColor: linkColor, color: linkHover }}
                      onClick={onClose}
                    >
                      Dashboard
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      color={subtle}
                      _hover={{ color: linkHover }}
                      onClick={() => {
                        logout()
                        onClose()
                      }}
                    >
                      Logout
                    </Button>
                  </Flex>
                </Box>
              )}
            </Flex>
          </DrawerBody>
          <DrawerFooter borderTopWidth="1px" borderColor={borderColor}>
            <Footer />
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Global ⌘K command palette (lazy-fetched dynamic items on first open) */}
      <CommandPalette isOpen={cmdkOpen} onClose={closeCmdk} />
    </>
  )
}

export default Header
