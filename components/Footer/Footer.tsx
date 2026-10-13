import NextLink from 'next/link'
import { Box, Flex, Link, Text } from '@chakra-ui/react'
import { SOCIAL_LINKS, splitBrand, type SocialLink } from '../Chrome/chrome'
import { useBrandHost } from '../Chrome/useBrandHost'
import { referenceYear, useReferenceMonth } from '../../lib/clock'
import { BUILD_COMMIT } from '../../lib/build'
import BrandMark from '../Icons/BrandMark'
import { ABOUT_SITE_LINKS, SITE_LINKS, type FooterLink } from './footerLinks'

/**
 * Footer — rendered once by components/Chrome/SiteChrome.
 *
 *   ≥ md   [LY lucian-dev.com]   Site        This site     Elsewhere
 *                                Home …      Colophon …    GitHub ↗ …
 *          ─────────────────────────────────────────────────────────────
 *          © 2026 lucian-dev.com          Built with Next.js · Set in Geist · Build 1a2e842
 *
 *   phones the brand on top, then Site beside This site + Elsewhere (every
 *          list is a column, so no link is ever left alone on a row), then
 *          the sign-off lines.
 *
 * "This site" carries the colophon, the privacy promise (/colophon#privacy),
 * the feeds and the source. The build line names the commit the image was
 * built from (NEXT_PUBLIC_BUILD_SHA, lib/build.ts) and is left out of local
 * builds that have none. Every link is a ≥ 44px target on phones (32px from
 * md, where a pointer is likely). Colours are semantic tokens, so the footer
 * is right on the first paint in both colour modes. The year comes from the
 * page's reference month (lib/clock.ts), so the server HTML and the
 * hydrating client agree. No client state: nothing here adds JavaScript
 * beyond the markup.
 */

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'

/** Shared hit area for footer links. */
const TARGET = {
  display: 'inline-flex',
  alignItems: 'center',
  minH: { base: '44px', md: '32px' },
  py: { base: 2.5, md: 1 },
} as const

const LINK_HOVER = { color: 'page.fg', textDecoration: 'none' } as const

/** Column heading id, from its title ("This site" → "footer-this-site"). */
const columnId = (title: string) => `footer-${title.toLowerCase().replace(/\s+/g, '-')}`

function ColumnTitle({ title }: { title: string }) {
  return (
    <Text
      as="h2"
      id={columnId(title)}
      fontFamily={MONO}
      fontSize="11px"
      fontWeight={500}
      letterSpacing="0.12em"
      textTransform="uppercase"
      color="page.fg-subtle"
      mb={{ base: 1, md: 3 }}
    >
      {title}
    </Text>
  )
}

function FooterItem({ link }: { link: FooterLink }) {
  if (link.external) {
    return (
      <Link href={link.href} isExternal {...TARGET} _hover={LINK_HOVER}>
        <span className="link-underline">
          {link.label} <span aria-hidden>↗</span>
        </span>
        <span className="sr-only"> (opens in a new tab)</span>
      </Link>
    )
  }
  // Feeds are documents for feed readers, not pages: a plain link.
  if (link.type) {
    return (
      <Link href={link.href} type={link.type} title={link.title} {...TARGET} _hover={LINK_HOVER}>
        <span className="link-underline">{link.label}</span>
      </Link>
    )
  }
  return (
    <Link as={NextLink} href={link.href} {...TARGET} _hover={LINK_HOVER}>
      <span className="link-underline">{link.label}</span>
    </Link>
  )
}

function Column({ title, links, area }: { title: string; links: readonly FooterLink[]; area: string }) {
  return (
    <Box gridArea={area} minW={0}>
      <ColumnTitle title={title} />
      <Box as="ul" listStyleType="none" m={0} p={0} aria-labelledby={columnId(title)} fontSize="14px" color="page.fg-secondary">
        {links.map((l) => (
          <li key={l.href}>
            <FooterItem link={l} />
          </li>
        ))}
      </Box>
    </Box>
  )
}

/** `socials`: the profile links to show (SiteChrome resolves them from home.socials). */
const Footer = ({ socials = SOCIAL_LINKS }: { socials?: readonly SocialLink[] }) => {
  const brand = useBrandHost()
  const [brandHead, brandTail] = splitBrand(brand)
  const year = referenceYear(useReferenceMonth())
  const elsewhere: FooterLink[] = socials.map((s) => ({ label: s.name, href: s.url, external: true }))

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
      {/* The bottom padding clears the fixed scroll-to-top button (≤ 64px from the bottom edge), so it never covers the last line. */}
      <Box maxW="var(--container-content)" mx="auto" px={{ base: 4, md: 6, lg: 8 }} pt={{ base: 10, md: 14 }} pb={20}>
        <Box as="nav" aria-label="Footer">
          <Box
            display="grid"
            gridTemplateColumns={{ base: 'repeat(2, minmax(0, 1fr))', md: 'minmax(0, 1.6fr) repeat(3, minmax(0, 1fr))' }}
            gridTemplateAreas={{ base: `"brand brand" "site meta" "site else"`, md: `"brand site meta else"` }}
            gridTemplateRows={{ base: 'auto auto 1fr', md: 'auto' }}
            columnGap={{ base: 6, md: 8 }}
            rowGap={{ base: 8, md: 0 }}
          >
            <Box gridArea="brand">
              <Link
                as={NextLink}
                href="/"
                display="inline-flex"
                alignItems="center"
                gap={2.5}
                minH="44px"
                fontFamily={MONO}
                fontSize="13px"
                fontWeight={600}
                letterSpacing="-0.01em"
                color="page.fg"
                _hover={{ textDecoration: 'none' }}
              >
                <BrandMark size={28} />
                <span>
                  {brandHead}
                  {brandTail && (
                    <Text as="span" color="accent.text">
                      {brandTail}
                    </Text>
                  )}
                </span>
              </Link>
            </Box>
            <Column title="Site" links={SITE_LINKS.map((l) => ({ label: l.name, href: l.url }))} area="site" />
            <Column title="This site" links={ABOUT_SITE_LINKS} area="meta" />
            {elsewhere.length > 0 && <Column title="Elsewhere" links={elsewhere} area="else" />}
          </Box>
        </Box>

        <Flex
          mt={{ base: 8, md: 12 }}
          pt={{ base: 5, md: 6 }}
          borderTop="1px solid"
          borderColor="page.border"
          direction={{ base: 'column', md: 'row' }}
          justify="space-between"
          align={{ base: 'flex-start', md: 'center' }}
          columnGap={6}
          rowGap={1}
          fontFamily={MONO}
          fontSize="11px"
          letterSpacing="0.02em"
          color="page.fg-subtle"
        >
          <Text as="p" m={0}>
            ©{' '}
            <Text as="span" className="tnum" suppressHydrationWarning>
              {year}
            </Text>{' '}
            {brand}
          </Text>
          <Flex as="p" m={0} wrap="wrap" align="center" columnGap={2} rowGap={0}>
            <Link as={NextLink} href="/colophon" {...TARGET} _hover={LINK_HOVER}>
              <span className="link-underline">Built with Next.js · Set in Geist</span>
            </Link>
            {BUILD_COMMIT && (
              <>
                <Text as="span" aria-hidden>
                  ·
                </Text>
                <Link href={BUILD_COMMIT.href} isExternal {...TARGET} className="tnum" title={`Deployed from commit ${BUILD_COMMIT.sha}`} _hover={LINK_HOVER}>
                  <span className="link-underline">Build {BUILD_COMMIT.short}</span>
                  <span className="sr-only"> (opens in a new tab)</span>
                </Link>
              </>
            )}
          </Flex>
        </Flex>
      </Box>
    </Box>
  )
}

export default Footer
