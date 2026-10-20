import NextLink from 'next/link'
import { Box, Link } from '@chakra-ui/react'
import { LanguagesIcon } from '../Icons/ui/chrome'
import { switchLabel } from '../../lib/uiStrings/languages'
import type { LangLink } from '../../lib/zhRoutes'

/**
 * The header's language switch (F3): a link to this page's version in the
 * other language — /about ⇄ /zh/about, /cv ⇄ /cv/zh, a post ⇄ its
 * translation — rendered only when that version exists (pageProps.langLinks;
 * a page whose Chinese copy the owner has not written has none, so the
 * switch is absent rather than leading to a 404).
 *
 * Each link names its language in that language ("中文", "English") and
 * carries `lang` and `hreflang`, so a screen reader pronounces it right and
 * announces where it leads (WCAG 3.1.2). It is an ordinary client-side
 * navigation: the next page brings its own words and <html lang>. The
 * choice is not remembered (no cookie, no redirect): every page stays at
 * its own address.
 *
 * On phones narrower than 375 px (320–360: small Androids, an iPhone SE
 * with Display Zoom) the switch shows its icon only, so it never runs into
 * the brand; the label stays in the link for screen readers (visually
 * hidden, not removed), and the drawer lists the same links in words.
 */
const ICON_ONLY = '@media screen and (max-width: 23.43em)'

/** Visually hidden, still read (the link's name and its `lang`). */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const

/** The switch's box: shared by the links and the slot kept for one (below). */
const SWITCH_BOX = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 1.5,
  h: '32px',
  px: 2,
  flexShrink: 0,
  borderRadius: 'md',
  fontSize: '13px',
  fontWeight: 500,
  lineHeight: 1,
  whiteSpace: 'nowrap',
} as const

/**
 * `reserveFor`: from lg up (where the primary nav is in the header) the
 * switch's place is kept on a page without one — as wide as a switch to
 * `reserveFor` would be — so the right-hand group, and with it the nav,
 * has the same width on every page of the language (the header row is a
 * centred grid, but a group wider than its share still decides). An
 * invisible copy of that switch sizes the slot, so it follows the real
 * one's font and padding exactly. Below lg nothing is reserved.
 */
export default function LanguageSwitch({ links, reserveFor }: { links: readonly LangLink[]; reserveFor?: string }) {
  if (!links.length && !reserveFor) return null
  const items = links.map((l) => (
    <Link
      key={l.lang}
      as={NextLink}
      href={l.href}
      hrefLang={l.lang}
      lang={l.lang}
      data-lang-switch=""
      {...SWITCH_BOX}
      color="page.fg-subtle"
      _hover={{ color: 'page.fg', bg: 'page.hover', textDecoration: 'none' }}
      _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
    >
      <LanguagesIcon size="sm" />
      <Box as="span" data-lang-label="" sx={{ [ICON_ONLY]: VISUALLY_HIDDEN }}>
        {switchLabel(l.lang, links)}
      </Box>
    </Link>
  ))
  if (!reserveFor) return <>{items}</>
  return (
    <Box
      data-lang-slot=""
      display={links.length ? 'inline-grid' : { base: 'none', lg: 'inline-grid' }}
      justifyItems="end"
      alignItems="center"
      flexShrink={0}
    >
      <Box aria-hidden gridArea="1 / 1" {...SWITCH_BOX} display={{ base: 'none', lg: 'inline-flex' }} visibility="hidden" pointerEvents="none">
        <LanguagesIcon size="sm" />
        <span lang={reserveFor}>{switchLabel(reserveFor, [{ lang: reserveFor }])}</span>
      </Box>
      <Box gridArea="1 / 1" display="inline-flex" alignItems="center" gap={2}>
        {items}
      </Box>
    </Box>
  )
}
