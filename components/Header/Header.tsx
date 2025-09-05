import React from 'react'
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
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
} from '@chakra-ui/react'
import { useRouter } from 'next/router'
import { TfiAlignJustify } from 'react-icons/tfi'
import Footer from '../Footer/Footer'
import { FaGithub, FaGitlab, FaLinkedin, FaWhatsapp } from 'react-icons/fa'
import { AiOutlineStock } from 'react-icons/ai'
import { ChevronDownIcon } from '@chakra-ui/icons'
const Header = ({ isMobile }: { isMobile: boolean }) => {
  // const baseURL = 'hiko.dev'
  const quickLinks = [
    { name: 'Home', url: `/` },
    { name: 'About', url: `/about` },
    { name: 'Contact', url: `/contact` },
    { name: 'CV', url: `/cv` },

  ]

  const moreLinks = [
    { name: 'Crypto', url: `/crypto` },
    { name: 'QuickPayment', url: `/quick-payment` },
  ]

  const socialLink = [
    { name: 'GitHub', url: `https://github.com/HikoPLi` },
    { name: 'LinkedIn', url: `https://www.linkedin.com/in/liyanpeihiko/` },
    { name: 'WhatsApp', url: `https://wa.me/85262040827` },
  ]

  const router = useRouter()
  const { isOpen, onOpen, onClose } = useDisclosure()

  const iconMap: { [key: string]: JSX.Element } = {
    Home: <Text>Home</Text>,
    About: <Text>About</Text>,
    Contact: <Text>Contact</Text>,
    CV: <Text>CV</Text>,
    GitHub: <FaGithub />,
    GitLab: <FaGitlab />,
    LinkedIn: <FaLinkedin />,
    WhatsApp: <FaWhatsapp />,
    Crypto: <AiOutlineStock />,
    QuickPayment: <AiOutlineStock />,
  }

  const handleLinkClick = (url: string) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      window.open(url, '_blank');
    } else {
      router.push(url);
    }
  };

  return (
    <>
      <Box
        as="header"
        w="100%"
        p={4}
        bg="gray.800"
        color="white"
        textAlign="center"
        display="flex"
        justifyContent="space-between"
        alignItems="center"
      >
        <Link href="/">
          <Text fontSize={{ base: 'lg', md: 'xl' }}>HIKO DEV</Text>
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
          <Flex gap={4}>
            {quickLinks.map((link) => (
              <IconButton
                key={link.name}
                onClick={() => handleLinkClick(link.url)}
                px={4}
                py={2}
                whiteSpace="nowrap"
                color="teal.200"
                variant="outline"
                borderColor="teal.200"
                _hover={{ bg: 'teal.200', color: 'gray.800' }}
                _active={{ bg: 'teal.600', borderColor: 'teal.600' }}
                icon={iconMap[link.name]}
                aria-label={link.name}
              />
            ))}
            {/* Social */}
            <Menu>
              <MenuButton
                as={Button}
                variant="outline"
                color="teal.200"
                borderColor="teal.200"
                _hover={{ bg: 'teal.200', color: 'gray.800' }}
                _active={{ bg: 'teal.600', borderColor: 'teal.600' }}
                rightIcon={<ChevronDownIcon />}
              >
                Social
              </MenuButton>
              <MenuList>
                {socialLink.map((link) => (
                  <MenuItem
                    key={link.name}
                    onClick={() => handleLinkClick(link.url)}
                    icon={iconMap[link.name]}
                    color={'teal.200'}
                  >
                    <Text color={'teal.200'}>{link.name}</Text>
                  </MenuItem>
                ))}
              </MenuList>
            </Menu>
            {/* More */}
            <Menu>
              <MenuButton
                as={Button}
                variant="outline"
                color="teal.200"
                borderColor="teal.200"
                _hover={{ bg: 'teal.200', color: 'gray.800' }}
                _active={{ bg: 'teal.600', borderColor: 'teal.600' }}
                rightIcon={<ChevronDownIcon />}
              >
                More
              </MenuButton>
              <MenuList>
                {moreLinks.map((link) => (
                  <MenuItem
                    key={link.name}
                    onClick={() => handleLinkClick(link.url)}
                    icon={iconMap[link.name]}
                    color={'teal.200'}
                  >
                    <Text color={'teal.200'}>{link.name}</Text>
                  </MenuItem>
                ))}
              </MenuList>
            </Menu>
          </Flex>
        )}
      </Box>

      {/* Side Drawer */}
      <Drawer isOpen={isOpen} placement="left" onClose={onClose}>
        <DrawerOverlay bg="rgba(0, 0, 0, 0.6)" zIndex="overlay" />
        <DrawerContent>
          <DrawerHeader borderBottomWidth="1px">Quick Links</DrawerHeader>
          <DrawerBody>
            <Flex direction="column" gap={2}>
              {quickLinks.map((link) => (
                <IconButton
                  key={link.name}
                  onClick={() => {
                    handleLinkClick(link.url);
                    onClose();
                  }}
                  px={4}
                  py={2}
                  whiteSpace="nowrap"
                  color="teal.200"
                  variant="outline"
                  borderColor="teal.200"
                  mb={2}
                  _hover={{ bg: 'teal.200', color: 'gray.800' }}
                  icon={iconMap[link.name]}
                  aria-label={link.name}
                />
              ))}
            {/* Social */}
            <Menu>
              <MenuButton
                as={Button}
                variant="outline"
                color="teal.200"
                borderColor="teal.200"
                _hover={{ bg: 'teal.200', color: 'gray.800' }}
                _active={{ bg: 'teal.600', borderColor: 'teal.600' }}
                rightIcon={<ChevronDownIcon />}
              >
                Social
              </MenuButton>
              <MenuList>
                {socialLink.map((link) => (
                  <MenuItem
                    key={link.name}
                    onClick={() => handleLinkClick(link.url)}
                    icon={iconMap[link.name]}
                    color={'teal.200'}
                  >
                    <Text color={'teal.200'}>{link.name}</Text>
                  </MenuItem>
                ))}
              </MenuList>
            </Menu>
            {/* More */}
            <Menu>
              <MenuButton
                as={Button}
                variant="outline"
                color="teal.200"
                borderColor="teal.200"
                _hover={{ bg: 'teal.200', color: 'gray.800' }}
                _active={{ bg: 'teal.600', borderColor: 'teal.600' }}
                rightIcon={<ChevronDownIcon />}
              >
                More
              </MenuButton>
              <MenuList>
                {moreLinks.map((link) => (
                  <MenuItem
                    key={link.name}
                    onClick={() => handleLinkClick(link.url)}
                    icon={iconMap[link.name]}
                    color={'teal.200'}
                  >
                    <Text color={'teal.200'}>{link.name}</Text>
                  </MenuItem>
                ))}
              </MenuList>
            </Menu>
            </Flex>
          </DrawerBody>
          <DrawerFooter borderTopWidth="1px">
            <Flex direction="column" alignItems={'center'} gap={2}>
              <Button variant="outline" mr={3} onClick={onClose}>
                Cancel
              </Button>
              
            </Flex>
          </DrawerFooter>
          <Footer />
        </DrawerContent>
      </Drawer>
    </>
  )
}

export default Header
