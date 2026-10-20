import NextLink from 'next/link'
import { Box, Flex } from '@chakra-ui/react'
import { LanguagesIcon } from '../Icons/ui/content'
import type { SwitchLink } from '../../lib/translations'
import { cssTransition } from '../../theme/tokens'

/**
 * The language switch of a post or case study (F2): a link to each other
 * language version of the piece, written in that language — "阅读中文版" on
 * the English page, "Read in English" on the Chinese one; with more than one
 * other version, each language by its own name (English · 简体中文 · 繁體中文)
 * in a labelled nav. Each link carries `lang` (screen readers switch voice),
 * `hreflang` and rel="alternate"; `label` names the nav (in the page's
 * language). The words come with the page props (lib/translations
 * switchLinks), so nothing shifts and no language table is bundled; renders
 * nothing when the piece exists in one language only.
 */

const pillSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 1.5,
  minH: 8,
  px: 3,
  borderRadius: 'pill',
  border: '1px solid',
  borderColor: 'page.border-strong',
  bg: 'page.bg-elevated',
  color: 'page.fg',
  fontSize: 'caption',
  fontWeight: 500,
  lineHeight: 'shorter',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  transition: cssTransition(['border-color', 'color'], 'fast'),
  _hover: { borderColor: 'accent.text', color: 'accent.text', textDecoration: 'none' },
  _focusVisible: { outline: '2px solid var(--accent)', outlineOffset: '2px' },
  '@media (forced-colors: active)': { borderColor: 'LinkText' },
} as const

export default function LanguageSwitch({ translations, label }: { translations: readonly SwitchLink[]; label: string }) {
  if (!translations.length) return null

  if (translations.length === 1) {
    const other = translations[0]
    return (
      <Box
        as={NextLink}
        href={other.permalink}
        hrefLang={other.hreflang}
        lang={other.lang}
        rel="alternate"
        sx={pillSx}
        className="no-print"
        data-language-switch=""
      >
        <LanguagesIcon size="sm" />
        {other.readIn}
      </Box>
    )
  }

  return (
    <Flex as="nav" aria-label={label} align="center" gap={2} wrap="wrap" className="no-print" data-language-switch="">
      <Box as="span" color="page.fg-secondary" display="inline-flex">
        <LanguagesIcon size="sm" />
      </Box>
      {translations.map((v) => (
        <Box key={v.slug} as={NextLink} href={v.permalink} hrefLang={v.hreflang} lang={v.lang} rel="alternate" sx={pillSx}>
          {v.name}
        </Box>
      ))}
    </Flex>
  )
}
