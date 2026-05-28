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
import { useRouter } from 'next/router'
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

/**
 * v6 Header
 *
 * Layout (desktop):  [logo · live-status]  [primary nav]  [⌘K · theme · admin]
 * Layout (mobile):   [logo]                [hamburger → drawer]
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
 *   - mono brand mark "hiko.dev" with accent on ".dev"
 *   - live-status pill (● Last commit · Nh ago) — fetches /api/github/events on mount
 *   - ⌘K search trigger placeholder (cmd palette UI lands in a later phase)
 */

const primaryLinks = [
  { name: 'Home', url: '/' },
  { name: 'About', url: '/about' },
  { name: 'Work', url: '/work' },         // new in v6 (case studies — Phase D)
  { name: 'Writing', url: '/blog' },      // new in v6 (blog — Phase D)
  { name: 'CV', url: '/cv' },
  { name: 'Contact', url: '/contact' },
]

const utilityLinks = [
  { name: 'Crypto', url: '/crypto' },
  { name: 'Quick Payment', url: '/quick-payment' },
]

const socialLinks = [
  { name: 'GitHub', url: 'https://github.com/HikoPLi', icon: <FaGithub /> },
  { name: 'GitLab', url: 'https://gitlab.com/HikoPLi', icon: <FaGitlab /> },
  { name: 'LinkedIn', url: 'https://www.linkedin.com/in/liyanpeihiko/', icon: <FaLinkedin /> },
  { name: 'WhatsApp', url: 'https://wa.me/85262040827', icon: <FaWhatsapp /> },
]

function LiveStatus() {
  const [text, setText] = useState<string | null>(null)
  const muted = useColorModeValue('gray.500', 'gray.400')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/github/events')
        if (!res.ok) return
        const data = (await res.json()) as { events?: { created_at?: string }[] }
        const created = data.events?.[0]?.created_at
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
      } catch {}
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (!text) return null

  return (
    <Flex
      display={{ base: 'none', md: 'flex' }}
      alignItems="center"
      gap="6px"
      fontFamily="var(--font-geist-mono), monospace"
      fontSize="11px"
      color={muted}
      letterSpacing="0.02em"
    >
      <Box position="relative" w="6px" h="6px">
        <Box className="pulse-dot" position="absolute" inset={0} borderRadius="full" />
        <Box w="6px" h="6px" borderRadius="full" bg="var(--live-green)" position="relative" />
      </Box>
      <Text as="span">Last commit · {text}</Text>
    </Flex>
  )
}

const Header = ({ isMobile }: { isMobile: boolean }) => {
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

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setIsAdmin(document.cookie.includes('cv_admin_token='))
    }
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

  const goto = (url: string) => {
    if (url.startsWith('http')) window.open(url, '_blank')
    else router.push(url)
  }

  // Tokens (computed via Chakra so dark/light mode resolve automatically)
  const headerBg = useColorModeValue('rgba(253,253,253,0.75)', 'rgba(5,5,5,0.75)')
  const borderColor = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.10)')
  const linkColor = useColorModeValue('gray.700', 'gray.300')
  const linkHover = useColorModeValue('black', 'white')
  const subtle = useColorModeValue('gray.500', 'gray.400')

  return (
    <>
      <Box
        as="header"
        position="sticky"
        top={0}
        zIndex={40}
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
              href="/"
              fontFamily="var(--font-geist-mono), monospace"
              fontSize="13px"
              fontWeight={600}
              letterSpacing="-0.01em"
              _hover={{ textDecoration: 'none' }}
              whiteSpace="nowrap"
            >
              <Text as="span">hiko</Text>
              <Text as="span" color="var(--accent)">.dev</Text>
            </Link>
            <LiveStatus />
          </Flex>

          {/* Center / right: primary nav (desktop only) */}
          {!isMobile && (
            <Flex
              as="nav"
              aria-label="Primary"
              alignItems="center"
              gap={6}
              display={{ base: 'none', lg: 'flex' }}
              fontSize="14px"
              color={linkColor}
            >
              {primaryLinks.map((l) => (
                <Link
                  key={l.name}
                  href={l.url}
                  className="link-underline"
                  _hover={{ color: linkHover, textDecoration: 'none' }}
                >
                  {l.name}
                </Link>
              ))}
            </Flex>
          )}

          {/* Right: utility */}
          {isMobile ? (
            <IconButton
              icon={<TfiAlignJustify />}
              onClick={onOpen}
              variant="ghost"
              size="sm"
              aria-label="Open menu"
              color={subtle}
              _hover={{ color: linkHover, bg: 'transparent' }}
            />
          ) : (
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
                onClick={openCmdk}
                aria-label="Open command palette"
              >
                <Text display={{ base: 'none', xl: 'inline' }} mr={2}>Search</Text>
                <Kbd
                  fontSize="10px"
                  bg="transparent"
                  border="1px solid"
                  borderColor={borderColor}
                  color={subtle}
                >
                  ⌘K
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

              {/* Admin entry */}
              {!isAdmin ? (
                <Button
                  size="sm"
                  variant="outline"
                  h="32px"
                  borderColor={borderColor}
                  color={linkColor}
                  fontSize="13px"
                  fontWeight={500}
                  _hover={{ borderColor: linkColor, color: linkHover }}
                  onClick={() => router.push('/admin/login')}
                >
                  Admin
                </Button>
              ) : (
                <Flex gap={1}>
                  <Button
                    size="sm"
                    variant="outline"
                    h="32px"
                    borderColor={borderColor}
                    color={linkColor}
                    fontSize="13px"
                    fontWeight={500}
                    _hover={{ borderColor: linkColor, color: linkHover }}
                    onClick={() => router.push('/admin/dashboard')}
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
            </Flex>
          )}
        </Flex>
      </Box>

      {/* Mobile drawer (preserves all links + admin) */}
      <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="xs">
        <DrawerOverlay bg="rgba(0,0,0,0.6)" backdropFilter="blur(4px)" />
        <DrawerContent bg={useColorModeValue('white', 'gray.900')}>
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
                  {primaryLinks.concat(utilityLinks).map((link) => (
                    <Button
                      key={link.name}
                      variant="ghost"
                      justifyContent="flex-start"
                      onClick={() => {
                        goto(link.url)
                        onClose()
                      }}
                      h="36px"
                      fontWeight={500}
                      color={linkColor}
                      _hover={{ color: linkHover, bg: 'transparent' }}
                    >
                      {link.name}
                    </Button>
                  ))}
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
                      icon={s.icon}
                      onClick={() => goto(s.url)}
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
                {!isAdmin ? (
                  <Button
                    size="sm"
                    variant="outline"
                    w="100%"
                    borderColor={borderColor}
                    color={linkColor}
                    _hover={{ borderColor: linkColor, color: linkHover }}
                    onClick={() => {
                      router.push('/admin/login')
                      onClose()
                    }}
                  >
                    Admin Login
                  </Button>
                ) : (
                  <Flex direction="column" gap={2}>
                    <Button
                      size="sm"
                      variant="outline"
                      borderColor={borderColor}
                      color={linkColor}
                      _hover={{ borderColor: linkColor, color: linkHover }}
                      onClick={() => {
                        router.push('/admin/dashboard')
                        onClose()
                      }}
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
                )}
              </Box>
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
