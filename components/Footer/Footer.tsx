import { useEffect, useId, useRef, useState } from 'react'
import NextLink from 'next/link'
import { Box, Flex, Text, Link, Divider, chakra } from '@chakra-ui/react'
import { PRIMARY_LINKS, SOCIAL_LINKS, type NavLink, type SocialLink } from '../Chrome/chrome'
import { useBrandHost } from '../Chrome/useBrandHost'
import { referenceYear, useReferenceMonth } from '../../lib/clock'
import { FEEDS } from '../../lib/feeds'

/**
 * v6 Footer — rendered once by components/Chrome/SiteChrome.
 *
 * Minimal layout:
 *   1. Navigation links (client-side via next/link, hover-underline)
 *   2. Social links (new tab) + Subscribe (the site's feeds) + copyright
 *
 * Every link is a ≥ 44px target on phones (32px from md, where a pointer is
 * likely). Colours are semantic tokens, so the footer is right on the first
 * paint in both colour modes. The year comes from the page's reference month
 * (lib/clock.ts), so the server HTML and the hydrating client agree.
 */

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'

/** Shared hit area for footer links. */
const TARGET = {
  display: 'inline-flex',
  alignItems: 'center',
  minH: { base: '44px', md: '32px' },
  py: { base: 3, md: 1 },
} as const

/**
 * "Subscribe" disclosure listing the feeds. A plain button + panel (no
 * popover engine in the shared bundle): Escape or a click outside closes it
 * and returns focus to the button when focus was inside.
 */
function Subscribe() {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const hadFocus = rootRef.current?.contains(document.activeElement)
      setOpen(false)
      if (hadFocus) buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <Box ref={rootRef} position="relative">
      <chakra.button
        ref={buttonRef}
        type="button"
        {...TARGET}
        gap="6px"
        fontFamily={MONO}
        fontSize="11px"
        color="page.fg-subtle"
        _hover={{ color: 'page.fg' }}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        Subscribe
        <Text as="span" aria-hidden display="inline-block" transition="transform 160ms var(--ease-out-quart)" transform={open ? 'rotate(180deg)' : 'none'}>
          ▾
        </Text>
      </chakra.button>
      <Box
        as="ul"
        id={panelId}
        hidden={!open}
        aria-label="Feeds"
        listStyleType="none"
        // Phones: expands in place (never overflows a narrow screen); from md
        // it floats above the button.
        position={{ base: 'static', md: 'absolute' }}
        bottom="calc(100% + 4px)"
        left={0}
        zIndex={20}
        minW={{ base: 0, md: '220px' }}
        mb={{ base: 2, md: 0 }}
        py={1}
        bg="page.bg-elevated"
        border="1px solid"
        borderColor="page.border"
        borderRadius="md"
        boxShadow="0 12px 32px -8px rgba(0,0,0,0.25)"
      >
        {FEEDS.map((f) => (
          <li key={f.href}>
            <Link
              href={f.href}
              type={f.type}
              title={f.title}
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              gap={3}
              minH="44px"
              px={3}
              fontSize="13px"
              color="page.fg-secondary"
              _hover={{ color: 'page.fg', bg: 'page.hover', textDecoration: 'none' }}
              onClick={() => setOpen(false)}
            >
              {f.label}
              <Text as="span" fontFamily={MONO} fontSize="10px" color="page.fg-subtle">
                {f.type === 'application/feed+json' ? 'JSON' : 'XML'}
              </Text>
            </Link>
          </li>
        ))}
      </Box>
    </Box>
  )
}

/**
 * `socials`: the profile links to show (SiteChrome resolves them from
 * home.socials); `navLinks`: the primary navigation (chrome navLinksFor).
 */
const Footer = ({ socials = SOCIAL_LINKS, navLinks = PRIMARY_LINKS }: { socials?: readonly SocialLink[]; navLinks?: readonly NavLink[] }) => {
  const brand = useBrandHost()
  const year = referenceYear(useReferenceMonth())

  return (
    <Box
      as="footer"
      w="100%"
      bg="page.footer-bg"
      backdropFilter="blur(8px)"
      borderTop="1px solid"
      borderColor="page.border"
      mt={16}
      className="no-print glass"
    >
      <Box maxW="var(--container-content)" mx="auto" px={{ base: 4, md: 6, lg: 8 }} py={10}>
        <Flex direction="column" gap={6}>
          {/* Row 1: nav links */}
          <Flex
            as="nav"
            aria-label="Footer"
            wrap="wrap"
            columnGap={{ base: 4, md: 6 }}
            rowGap={0}
            justifyContent={{ base: 'center', md: 'flex-start' }}
            fontSize="13px"
            color="page.fg-secondary"
          >
            {navLinks.map((l) => (
              <Link key={l.name} as={NextLink} href={l.url} {...TARGET} _hover={{ color: 'page.fg', textDecoration: 'none' }}>
                <span className="link-underline">{l.name}</span>
              </Link>
            ))}
          </Flex>

          <Divider borderColor="page.border" />

          {/* Row 2: social + feeds + copyright */}
          <Flex
            direction={{ base: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ base: 'flex-start', md: 'center' }}
            gap={4}
          >
            <Flex columnGap={5} rowGap={0} wrap="wrap" alignItems="center" fontFamily={MONO} fontSize="11px" color="page.fg-subtle">
              {socials.map((s) => (
                <Link key={s.name} href={s.url} isExternal {...TARGET} _hover={{ color: 'page.fg', textDecoration: 'none' }}>
                  <span className="link-underline">
                    {s.name} <span aria-hidden>↗</span>
                  </span>
                  <span className="sr-only"> (opens in a new tab)</span>
                </Link>
              ))}
              <Subscribe />
            </Flex>

            <Flex gap={3} alignItems="center" fontFamily={MONO} fontSize="11px" color="page.fg-subtle">
              <Text as="span">
                ©{' '}
                <Text as="span" className="tnum" suppressHydrationWarning>
                  {year}
                </Text>{' '}
                <Link
                  as={NextLink}
                  href="/"
                  display="inline-flex"
                  alignItems="center"
                  minH="44px"
                  _hover={{ color: 'page.fg', textDecoration: 'none' }}
                >
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
