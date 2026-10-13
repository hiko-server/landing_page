import React, { useRef } from 'react'
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  IconButton,
  Link,
  Text,
  useColorMode,
} from '@chakra-ui/react'
import NextLink from 'next/link'
import { useRouter } from 'next/router'
import { MOBILE_MENU_ID, PRIMARY_LINKS, type NavLink, type SocialLink, type SocialName, isActiveRoute } from '../Chrome/chrome'
import { useChromeLang } from '../Chrome/chromeLang'
import { GitHubIcon, GitLabIcon, LinkedInIcon, WhatsAppIcon } from '../Icons/brand'
import { toggleThemeWithTransition } from '../../lib/themeTransition'
import ThemeIcon from './ThemeIcon'

/**
 * Mobile menu (below lg), loaded on demand by the header: every primary link,
 * then socials, theme and (signed in) admin. Chakra's Drawer traps focus,
 * closes on Escape, focuses the first link on open and returns focus to the
 * hamburger on close.
 */

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'

const SOCIAL_ICONS: Record<SocialName, React.ReactElement> = {
  GitHub: <GitHubIcon />,
  GitLab: <GitLabIcon />,
  LinkedIn: <LinkedInIcon />,
  WhatsApp: <WhatsAppIcon />,
}

/** Mono uppercase group label. */
function DrawerLabel({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <Text id={id} fontFamily={MONO} fontSize="11px" letterSpacing="0.12em" textTransform="uppercase" color="page.fg-subtle" mb={2}>
      {children}
    </Text>
  )
}

export type MobileDrawerProps = {
  isOpen: boolean
  onClose: () => void
  socials: readonly SocialLink[]
  /** The primary navigation (chrome navLinksFor); defaults to PRIMARY_LINKS. */
  navLinks?: readonly NavLink[]
  isAdmin: boolean
  onLogout: () => void
  /** False when the menu closes because the visitor left the page (focus then moves to the new page). */
  returnFocusOnClose?: boolean
}

export default function MobileDrawer({
  isOpen,
  onClose,
  socials,
  navLinks = PRIMARY_LINKS,
  isAdmin,
  onLogout,
  returnFocusOnClose = true,
}: MobileDrawerProps) {
  const router = useRouter()
  const { colorMode, toggleColorMode } = useColorMode()
  const firstLinkRef = useRef<HTMLAnchorElement>(null)
  const isDark = colorMode === 'dark'
  // Portaled to <body>, outside the header's lang="en" subtree.
  const chromeLang = useChromeLang()

  return (
    <Drawer id={MOBILE_MENU_ID} isOpen={isOpen} placement="right" onClose={onClose} size="xs" initialFocusRef={firstLinkRef} returnFocusOnClose={returnFocusOnClose}>
      <DrawerOverlay bg="rgba(0,0,0,0.6)" backdropFilter="blur(4px)" />
      <DrawerContent lang={chromeLang} bg="page.bg" color="page.fg" borderLeft="1px solid" borderColor="page.border">
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
                {navLinks.map((link, i) => {
                  const active = isActiveRoute(router.pathname, link.url)
                  return (
                    <Link
                      key={link.name}
                      as={NextLink}
                      href={link.url}
                      ref={i === 0 ? firstLinkRef : undefined}
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

            {socials.length > 0 && (
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
                      minW="44px"
                      h="44px"
                      borderColor="page.border"
                      color="page.fg-subtle"
                      _hover={{ color: 'page.fg', borderColor: 'page.border-strong' }}
                      aria-label={`${s.name} (opens in a new tab)`}
                      title={s.name}
                    />
                  ))}
                </Flex>
              </Box>
            )}

            <Button
              onClick={(e) => toggleThemeWithTransition(toggleColorMode, e.currentTarget)}
              variant="outline"
              borderColor="page.border"
              color="page.fg-secondary"
              h="44px"
              w="100%"
              fontSize="14px"
              leftIcon={<ThemeIcon size={18} />}
              _hover={{ borderColor: 'page.border-strong', color: 'page.fg' }}
            >
              {isDark ? 'Light mode' : 'Dark mode'}
            </Button>

            {/* Admin section — like the desktop header, only when signed in. */}
            {isAdmin && (
              <Box>
                <DrawerLabel>Admin</DrawerLabel>
                <Flex direction="column" gap={2}>
                  <Button
                    as={NextLink}
                    href="/admin/dashboard"
                    h="44px"
                    variant="outline"
                    borderColor="page.border"
                    color="page.fg-secondary"
                    _hover={{ borderColor: 'page.border-strong', color: 'page.fg' }}
                    onClick={onClose}
                  >
                    Dashboard
                  </Button>
                  <Button
                    h="44px"
                    variant="ghost"
                    color="page.fg-subtle"
                    _hover={{ color: 'page.fg', bg: 'page.hover' }}
                    onClick={() => {
                      onClose()
                      onLogout()
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
  )
}
