import { useEffect, useState } from 'react'
import {
  Box,
  Text,
  Button,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerCloseButton,
  DrawerBody,
  DrawerFooter,
  useDisclosure,
  Flex,
  IconButton,
  Link,
  Stack,
  useToast,
  useColorMode,
  useColorModeValue,
} from '@chakra-ui/react'
import { useRouter } from 'next/router'
import { TfiAlignJustify } from 'react-icons/tfi'
import { FaGithub, FaLinkedin, FaWhatsapp } from 'react-icons/fa'
import { AiOutlineStock } from 'react-icons/ai'
import { MoonIcon, SunIcon } from '@chakra-ui/icons'
import {
  primaryNavigationLinks,
  secondaryNavigationLinks,
  socialNavigationLinks,
} from '../../lib/siteNavigation'

const Header = ({ isMobile }: { isMobile: boolean }) => {
  const router = useRouter()
  const toast = useToast()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setIsAdmin(document.cookie.includes('cv_admin_token='))
    }
  }, [])

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
  const { isOpen, onOpen, onClose } = useDisclosure()

  const iconMap: { [key: string]: JSX.Element } = {
    GitHub: <FaGithub />,
    LinkedIn: <FaLinkedin />,
    WhatsApp: <FaWhatsapp />,
    Crypto: <AiOutlineStock />,
    'Quick Payment': <AiOutlineStock />,
  }

  const isCurrentPath = (href: string) =>
    href === '/' ? router.pathname === '/' : router.pathname.startsWith(href)

  const handleLinkClick = (url: string, external?: boolean) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      window.open(url, '_blank', 'noopener,noreferrer')
    } else {
      router.push(url)
    }
    if (external) {
      onClose()
    }
  }

  const { colorMode, toggleColorMode } = useColorMode()
  const headerBg = useColorModeValue('gray.800', 'gray.900')
  const headerColor = useColorModeValue('white', 'gray.100')
  const navButtonColor = useColorModeValue('teal.200', 'teal.100')
  const drawerBg = useColorModeValue('white', 'gray.800')
  const drawerButtonColor = useColorModeValue('gray.700', 'gray.100')
  const drawerBorderColor = useColorModeValue('gray.200', 'gray.600')
  const drawerMuted = useColorModeValue('gray.500', 'gray.400')
  const drawerHoverBg = useColorModeValue('blackAlpha.50', 'whiteAlpha.100')

  return (
    <>
      <Box
        as="header"
        w="100%"
        p={4}
        bg={headerBg}
        color={headerColor}
        textAlign="center"
        display="flex"
        justifyContent="space-between"
        alignItems="center"
      >
        <Link href="/">
          <Text fontSize={{ base: 'lg', md: 'xl' }} fontWeight="bold" letterSpacing="0.08em">
            HIKO DEV
          </Text>
        </Link>

        {isMobile ? (
          <IconButton
            icon={<TfiAlignJustify />}
            onClick={onOpen}
            variant="outline"
            color="teal.500"
            borderColor="teal.500"
            _hover={{ bg: 'teal.500', color: 'white' }}
            aria-label="Open Menu"
            _active={{ bg: 'teal.600', borderColor: 'teal.600' }}
          />
        ) : (
          <Flex gap={3} alignItems="center" flexWrap="wrap" justifyContent="flex-end">
            {primaryNavigationLinks.map((link) => {
              const active = isCurrentPath(link.href)
              return (
                <Button
                  key={link.label}
                  onClick={() => handleLinkClick(link.href)}
                  variant={active ? 'solid' : 'outline'}
                  colorScheme="teal"
                  color={active ? 'gray.800' : navButtonColor}
                  borderColor={navButtonColor}
                  _hover={{ bg: 'teal.200', color: 'gray.800' }}
                  aria-current={active ? 'page' : undefined}
                >
                  {link.label}
                </Button>
              )
            })}
            <IconButton
              aria-label="Toggle color mode"
              onClick={toggleColorMode}
              variant="outline"
              color={navButtonColor}
              borderColor={navButtonColor}
              _hover={{ bg: 'teal.200', color: 'gray.800' }}
              title={colorMode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              icon={colorMode === 'light' ? <MoonIcon /> : <SunIcon />}
            />
            <Flex gap={2} alignItems="center">
              {socialNavigationLinks.map((link) => (
                <IconButton
                  key={link.label}
                  onClick={() => handleLinkClick(link.href, link.external)}
                  variant="outline"
                  color={navButtonColor}
                  borderColor={navButtonColor}
                  _hover={{ bg: 'teal.200', color: 'gray.800' }}
                  aria-label={link.label}
                  icon={iconMap[link.label]}
                />
              ))}
            </Flex>
            <Flex gap={2} alignItems="center">
              {secondaryNavigationLinks.map((link) => (
                <Button
                  key={link.label}
                  variant={isCurrentPath(link.href) ? 'solid' : 'outline'}
                  colorScheme="teal"
                  color={isCurrentPath(link.href) ? 'gray.800' : navButtonColor}
                  borderColor={navButtonColor}
                  _hover={{ bg: 'teal.200', color: 'gray.800' }}
                  leftIcon={iconMap[link.label]}
                  onClick={() => handleLinkClick(link.href)}
                  aria-current={isCurrentPath(link.href) ? 'page' : undefined}
                >
                  {link.label}
                </Button>
              ))}
            </Flex>
            {!isAdmin ? (
              <Button
                variant="solid"
                colorScheme="teal"
                onClick={() => router.push('/admin/login')}
              >
                Admin Login
              </Button>
            ) : (
              <Flex gap={2}>
                <Button variant="outline" colorScheme="teal" onClick={() => router.push('/admin/dashboard')}>Dashboard</Button>
                <Button variant="solid" colorScheme="red" onClick={logout}>
                  Logout
                </Button>
              </Flex>
            )}
          </Flex>
        )}
      </Box>

      {/* Side Drawer */}
      <Drawer isOpen={isOpen} placement="left" onClose={onClose}>
        <DrawerOverlay bg="rgba(0, 0, 0, 0.6)" zIndex="overlay" />
        <DrawerContent bg={drawerBg}>
          <DrawerCloseButton />
          <DrawerHeader borderBottomWidth="1px">Navigation</DrawerHeader>
          <DrawerBody>
            <Stack spacing={6}>
              <Box>
                <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="0.08em" color={drawerMuted} mb={3}>
                  Theme
                </Text>
                <Button
                  onClick={toggleColorMode}
                  variant="outline"
                  color={drawerButtonColor}
                  borderColor={drawerBorderColor}
                  _hover={{ bg: drawerHoverBg }}
                  title={colorMode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                  leftIcon={colorMode === 'light' ? <MoonIcon /> : <SunIcon />}
                  w="full"
                  justifyContent="flex-start"
                >
                  {colorMode === 'light' ? 'Dark Mode' : 'Light Mode'}
                </Button>
              </Box>

              <Box>
                <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="0.08em" color={drawerMuted} mb={3}>
                  Explore
                </Text>
                <Stack spacing={2}>
                  {primaryNavigationLinks.map((link) => {
                    const active = isCurrentPath(link.href)
                    return (
                      <Button
                        key={link.label}
                        onClick={() => {
                          handleLinkClick(link.href)
                          onClose()
                        }}
                        justifyContent="flex-start"
                        variant={active ? 'solid' : 'outline'}
                        colorScheme="teal"
                        color={active ? 'gray.800' : drawerButtonColor}
                        borderColor={drawerBorderColor}
                        aria-current={active ? 'page' : undefined}
                      >
                        {link.label}
                      </Button>
                    )
                  })}
                </Stack>
              </Box>

              <Box>
                <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="0.08em" color={drawerMuted} mb={3}>
                  More
                </Text>
                <Stack spacing={2}>
                  {secondaryNavigationLinks.map((link) => {
                    const active = isCurrentPath(link.href)
                    return (
                      <Button
                        key={link.label}
                        onClick={() => {
                          handleLinkClick(link.href)
                          onClose()
                        }}
                        justifyContent="flex-start"
                        variant={active ? 'solid' : 'outline'}
                        colorScheme="teal"
                        color={active ? 'gray.800' : drawerButtonColor}
                        borderColor={drawerBorderColor}
                        leftIcon={iconMap[link.label]}
                        aria-current={active ? 'page' : undefined}
                      >
                        {link.label}
                      </Button>
                    )
                  })}
                </Stack>
              </Box>

              <Box>
                <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="0.08em" color={drawerMuted} mb={3}>
                  Connect
                </Text>
                <Flex gap={3}>
                  {socialNavigationLinks.map((link) => (
                    <IconButton
                      key={link.label}
                      onClick={() => handleLinkClick(link.href, link.external)}
                      variant="outline"
                      color={drawerButtonColor}
                      borderColor={drawerBorderColor}
                      _hover={{ bg: drawerHoverBg }}
                      aria-label={link.label}
                      icon={iconMap[link.label]}
                    />
                  ))}
                </Flex>
              </Box>

              <Box>
                <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="0.08em" color={drawerMuted} mb={3}>
                  Admin
                </Text>
                <Stack spacing={2}>
                  {!isAdmin ? (
                    <Button
                      variant="solid"
                      colorScheme="teal"
                      onClick={() => {
                        onClose()
                        router.push('/admin/login')
                      }}
                    >
                      Admin Login
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" colorScheme="teal" onClick={() => { onClose(); router.push('/admin/dashboard') }}>
                        Dashboard
                      </Button>
                      <Button variant="solid" colorScheme="red" onClick={() => { onClose(); logout() }}>
                        Logout
                      </Button>
                    </>
                  )}
                </Stack>
              </Box>
            </Stack>
          </DrawerBody>
          <DrawerFooter borderTopWidth="1px">
            <Flex direction="column" alignItems={'center'} gap={2} w="full">
              <Button variant="outline" onClick={onClose} w="full">
                Cancel
              </Button>
            </Flex>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  )
}

export default Header
