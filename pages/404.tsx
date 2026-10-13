import NextLink from 'next/link'
import { Box, Button, Flex, Heading, Text } from '@chakra-ui/react'
import HeaderFooter from '../layout/HeaderFooter'
import CustomHead from '../components/General-UI/CustomHead'

/**
 * 404 — must stay a real 404 for crawlers (no JS auto-redirect, which Google
 * treats as a soft-404). Offers the most useful next steps instead.
 */
const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/cv', label: 'CV' },
  { href: '/work', label: 'Work' },
  { href: '/blog', label: 'Writing' },
  { href: '/contact', label: 'Contact' },
]

const Custom404 = () => {
  return (
    <>
      <CustomHead
        title="404 — Page Not Found"
        description="The page you’re looking for doesn’t exist or has moved."
        noindex
      />
      <HeaderFooter>
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[20, 28]} textAlign="center">
          <Text
            fontFamily="var(--font-geist-mono), monospace"
            fontSize="12px"
            letterSpacing="0.16em"
            color="accent.text"
            mb={3}
          >
            ERROR 404
          </Text>
          <Heading as="h1" fontSize={['28px', '40px']} fontWeight={500} letterSpacing="-0.02em" mb={4}>
            This page doesn’t exist.
          </Heading>
          <Text color="page.fg-secondary" mb={10} maxW="460px" mx="auto">
            The link may be broken, or the page may have moved. Try one of these — or press{' '}
            <Text as="kbd" fontFamily="var(--font-geist-mono), monospace" fontSize="0.9em">
              ⌘K
            </Text>{' '}
            or{' '}
            <Text as="kbd" fontFamily="var(--font-geist-mono), monospace" fontSize="0.9em">
              /
            </Text>{' '}
            to search.
          </Text>
          <Flex as="nav" aria-label="Suggested pages" justify="center" gap={2} wrap="wrap">
            {LINKS.map((l, i) => (
              <Button
                key={l.href}
                as={NextLink}
                href={l.href}
                size="sm"
                minH="44px"
                variant={i === 0 ? 'solid' : 'outline'}
                bg={i === 0 ? 'accent.solid' : undefined}
                color={i === 0 ? 'accent.fg' : undefined}
                borderColor="page.border-strong"
                _hover={i === 0 ? { bg: 'accent.solid-hover' } : { borderColor: 'var(--accent)', color: 'accent.text' }}
                _active={i === 0 ? { bg: 'accent.solid-active', transform: 'scale(0.97)' } : undefined}
              >
                {i === 0 ? '← ' : ''}
                {l.label}
              </Button>
            ))}
          </Flex>
        </Box>
      </HeaderFooter>
    </>
  )
}

export default Custom404
