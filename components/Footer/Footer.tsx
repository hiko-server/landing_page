import React from 'react'
import {
  Box,
  Flex,
  Text,
  Link,
  useColorModeValue,
  Divider,
} from '@chakra-ui/react'

/**
 * v6 Footer
 *
 * Minimal three-row layout:
 *   1. Navigation links (text, hover-underline)
 *   2. Social + external links
 *   3. Copyright + version pill (engineer signature)
 */

const navLinks = [
  { name: 'Home', url: '/' },
  { name: 'About', url: '/about' },
  { name: 'Work', url: '/work' },
  { name: 'Writing', url: '/blog' },
  { name: 'CV', url: '/cv' },
  { name: 'Now', url: '/now' },
  { name: 'Uses', url: '/uses' },
  { name: 'Contact', url: '/contact' },
]

const socialLinks = [
  { name: 'GitHub', url: 'https://github.com/HikoPLi' },
  { name: 'GitLab', url: 'https://gitlab.com/HikoPLi' },
  { name: 'LinkedIn', url: 'https://www.linkedin.com/in/liyanpeihiko/' },
  { name: 'WhatsApp', url: 'https://wa.me/85262040827' },
]

const Footer: React.FC = () => {
  const bg = useColorModeValue('rgba(253,253,253,0.5)', 'rgba(5,5,5,0.5)')
  const border = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.10)')
  const fg = useColorModeValue('gray.700', 'gray.300')
  const subtle = useColorModeValue('gray.500', 'gray.500')
  const linkHover = useColorModeValue('black', 'white')
  const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

  return (
    <Box
      as="footer"
      w="100%"
      bg={bg}
      backdropFilter="blur(8px)"
      borderTop="1px solid"
      borderColor={border}
      mt={16}
      className="no-print"
    >
      <Box maxW="var(--container-content)" mx="auto" px={{ base: 4, md: 6, lg: 8 }} py={10}>
        <Flex direction="column" gap={6}>
          {/* Row 1: nav links */}
          <Flex
            wrap="wrap"
            gap={{ base: 4, md: 6 }}
            justifyContent={{ base: 'center', md: 'flex-start' }}
            fontSize="13px"
            color={fg}
          >
            {navLinks.map((l) => (
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

          <Divider borderColor={border} />

          {/* Row 2: social + version + copyright */}
          <Flex
            direction={{ base: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ base: 'flex-start', md: 'center' }}
            gap={4}
          >
            <Flex gap={5} wrap="wrap" fontFamily={monoFont} fontSize="11px" color={subtle}>
              {socialLinks.map((s) => (
                <Link
                  key={s.name}
                  href={s.url}
                  isExternal
                  className="link-underline"
                  _hover={{ color: linkHover, textDecoration: 'none' }}
                >
                  {s.name} ↗
                </Link>
              ))}
            </Flex>

            <Flex
              gap={3}
              alignItems="center"
              fontFamily={monoFont}
              fontSize="11px"
              color={subtle}
            >
              <Text as="span">
                © {new Date().getFullYear()}{' '}
                <Link href="https://hiko.dev" isExternal _hover={{ color: linkHover, textDecoration: 'none' }}>
                  hiko.dev
                </Link>
              </Text>
              <Text as="span">·</Text>
              <Text as="span">All rights reserved</Text>
            </Flex>
          </Flex>
        </Flex>
      </Box>
    </Box>
  )
}

export default Footer
