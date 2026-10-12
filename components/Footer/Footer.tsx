import React from 'react'
import NextLink from 'next/link'
import { Box, Flex, Text, Link, Divider } from '@chakra-ui/react'
import { PRIMARY_LINKS, SOCIAL_LINKS } from '../Chrome/chrome'
import { useBrandHost } from '../Chrome/useBrandHost'

/**
 * v6 Footer — rendered once by components/Chrome/SiteChrome.
 *
 * Minimal layout:
 *   1. Navigation links (client-side via next/link, hover-underline)
 *   2. Social links (new tab) + copyright
 *
 * Colours are semantic tokens, so the footer is right on the first paint in
 * both colour modes.
 */

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'

const Footer: React.FC = () => {
  const brand = useBrandHost()

  return (
    <Box
      as="footer"
      w="100%"
      bg="page.footer-bg"
      backdropFilter="blur(8px)"
      borderTop="1px solid"
      borderColor="page.border"
      mt={16}
      className="no-print"
    >
      <Box maxW="var(--container-content)" mx="auto" px={{ base: 4, md: 6, lg: 8 }} py={10}>
        <Flex direction="column" gap={6}>
          {/* Row 1: nav links */}
          <Flex
            as="nav"
            aria-label="Footer"
            wrap="wrap"
            gap={{ base: 4, md: 6 }}
            justifyContent={{ base: 'center', md: 'flex-start' }}
            fontSize="13px"
            color="page.fg-secondary"
          >
            {PRIMARY_LINKS.map((l) => (
              <Link
                key={l.name}
                as={NextLink}
                href={l.url}
                className="link-underline"
                _hover={{ color: 'page.fg', textDecoration: 'none' }}
              >
                {l.name}
              </Link>
            ))}
          </Flex>

          <Divider borderColor="page.border" />

          {/* Row 2: social + copyright */}
          <Flex
            direction={{ base: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ base: 'flex-start', md: 'center' }}
            gap={4}
          >
            <Flex gap={5} wrap="wrap" fontFamily={MONO} fontSize="11px" color="page.fg-subtle">
              {SOCIAL_LINKS.map((s) => (
                <Link
                  key={s.name}
                  href={s.url}
                  isExternal
                  className="link-underline"
                  _hover={{ color: 'page.fg', textDecoration: 'none' }}
                >
                  {s.name}{' '}
                  <span aria-hidden>↗</span>
                  <span className="sr-only"> (opens in a new tab)</span>
                </Link>
              ))}
            </Flex>

            <Flex gap={3} alignItems="center" fontFamily={MONO} fontSize="11px" color="page.fg-subtle">
              <Text as="span">
                © {new Date().getFullYear()}{' '}
                <Link as={NextLink} href="/" _hover={{ color: 'page.fg', textDecoration: 'none' }}>
                  {brand}
                </Link>
              </Text>
              <Text as="span" aria-hidden>
                ·
              </Text>
              <Text as="span">All rights reserved</Text>
            </Flex>
          </Flex>
        </Flex>
      </Box>
    </Box>
  )
}

export default Footer
