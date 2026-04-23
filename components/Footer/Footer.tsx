import { Box, Flex, Link, Text, useColorModeValue } from '@chakra-ui/react'
import {
  primaryNavigationLinks,
  secondaryNavigationLinks,
  socialNavigationLinks,
} from '../../lib/siteNavigation'

const Footer: React.FC = () => {
  const bg = useColorModeValue('whiteAlpha.900', 'gray.900')
  const color = useColorModeValue('gray.700', 'gray.100')
  const linkColor = useColorModeValue('teal.700', 'teal.200')
  const sectionLabel = useColorModeValue('gray.500', 'gray.400')
  const borderColor = useColorModeValue('blackAlpha.100', 'whiteAlpha.200')

  return (
    <Box
      as="footer"
      w="100%"
      px={{ base: 4, md: 8 }}
      py={{ base: 6, md: 8 }}
      bg={bg}
      color={color}
      borderTopWidth="1px"
      borderColor={borderColor}
    >
      <Flex
        maxW="1200px"
        mx="auto"
        gap={{ base: 6, md: 10 }}
        justify="space-between"
        align={{ base: 'flex-start', md: 'center' }}
        direction={{ base: 'column', md: 'row' }}
      >
        <Box>
          <Text fontWeight="bold" letterSpacing="0.08em">
            HIKO.DEV
          </Text>
          <Text mt={2} maxW="sm" color={sectionLabel} fontSize="sm">
            Portfolio, CV, and contact hub for full-stack product engineering
            work.
          </Text>
        </Box>

        <Flex
          gap={{ base: 6, md: 8 }}
          wrap="wrap"
          align={{ base: 'flex-start', md: 'center' }}
        >
          <Box>
            <Text fontSize="xs" fontWeight="bold" letterSpacing="0.08em" textTransform="uppercase" color={sectionLabel}>
              Explore
            </Text>
            <Flex mt={2} gap={3} wrap="wrap">
              {primaryNavigationLinks.map((link) => (
                <Link key={link.label} href={link.href} color={linkColor}>
                  {link.label}
                </Link>
              ))}
            </Flex>
          </Box>

          <Box>
            <Text fontSize="xs" fontWeight="bold" letterSpacing="0.08em" textTransform="uppercase" color={sectionLabel}>
              More
            </Text>
            <Flex mt={2} gap={3} wrap="wrap">
              {secondaryNavigationLinks.map((link) => (
                <Link key={link.label} href={link.href} color={linkColor}>
                  {link.label}
                </Link>
              ))}
            </Flex>
          </Box>

          <Box>
            <Text fontSize="xs" fontWeight="bold" letterSpacing="0.08em" textTransform="uppercase" color={sectionLabel}>
              Connect
            </Text>
            <Flex mt={2} gap={3} wrap="wrap">
              {socialNavigationLinks.map((link) => (
                <Link key={link.label} href={link.href} color={linkColor} isExternal>
                  {link.label}
                </Link>
              ))}
            </Flex>
          </Box>
        </Flex>
      </Flex>

      <Text mt={6} textAlign={{ base: 'left', md: 'center' }} fontSize="sm" color={sectionLabel}>
        &copy; {new Date().getFullYear()}{' '}
        <Link href="https://hiko.dev" isExternal color={linkColor}>
          hiko.dev
        </Link>
        . All rights reserved.
      </Text>
    </Box>
  )
}

export default Footer
