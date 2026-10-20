import NextLink from 'next/link'
import { Link } from '@chakra-ui/react'
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
 */
export default function LanguageSwitch({ links }: { links: readonly LangLink[] }) {
  if (!links.length) return null
  return (
    <>
      {links.map((l) => (
        <Link
          key={l.lang}
          as={NextLink}
          href={l.href}
          hrefLang={l.lang}
          lang={l.lang}
          data-lang-switch=""
          display="inline-flex"
          alignItems="center"
          gap={1.5}
          h="32px"
          px={2}
          flexShrink={0}
          borderRadius="md"
          fontSize="13px"
          fontWeight={500}
          lineHeight={1}
          whiteSpace="nowrap"
          color="page.fg-subtle"
          _hover={{ color: 'page.fg', bg: 'page.hover', textDecoration: 'none' }}
          _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
        >
          <LanguagesIcon size="sm" />
          {switchLabel(l.lang, links)}
        </Link>
      ))}
    </>
  )
}
