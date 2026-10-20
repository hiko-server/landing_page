import React from 'react'
import { Text, type TextProps } from '@chakra-ui/react'
import { textLang, type AuthorPart } from '../../lib/publications/citation'
import type { PubLang } from '../../lib/publications/types'

const HIDDEN_AUTHOR = { en: 'an author not shown', zh: '未显示的作者' } as const

/**
 * A paper's author list as every web view prints it (/publications, the
 * /cv Reading view, the home page's "Selected Publications"): the owner in
 * bold, a co-author the owner hid as "…" (named to screen readers only as
 * hidden, never by name), and a `lang` on a name whose script differs from
 * the page (WCAG 3.1.2). Renders nothing without an author.
 */
export default function AuthorLine({
  authors,
  lang,
  pageLang = lang,
  fontSize,
  mt = 1.5,
}: {
  authors: readonly AuthorPart[]
  /** Language of the screen-reader label. */
  lang: PubLang
  /** Language of the page around the list. */
  pageLang?: PubLang
  fontSize: TextProps['fontSize']
  mt?: TextProps['mt']
}) {
  if (!authors.length) return null
  return (
    <Text fontSize={fontSize} lineHeight="1.55" color="page.fg-secondary" mt={mt}>
      {authors.map((a, i) => (
        <React.Fragment key={i}>
          {i ? ', ' : null}
          {a.hidden ? (
            <>
              <span aria-hidden>…</span>
              <span className="sr-only">{HIDDEN_AUTHOR[lang]}</span>
            </>
          ) : a.self ? (
            <Text as="strong" fontWeight={600} color="page.fg" lang={textLang(a.name, pageLang)}>
              {a.name}
            </Text>
          ) : (
            <span lang={textLang(a.name, pageLang)}>{a.name}</span>
          )}
        </React.Fragment>
      ))}
    </Text>
  )
}
