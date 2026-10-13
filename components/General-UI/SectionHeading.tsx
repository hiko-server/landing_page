import type React from 'react'
import { Flex, Text, type FlexProps } from '@chakra-ui/react'

/**
 * The heading of a page section — the home sections, the /about blocks,
 * /now's groups, the /cv skill evidence — in one plain style:
 *
 *   Open Source                                   (aux, e.g. "3 entries")
 *
 * Sans, the `section` text style (theme/tokens.ts: the h3 size at weight
 * 500, slightly tightened), primary text colour. No index number, no
 * brackets, no uppercase eyebrow and no trailing rule: the site's sections
 * are told apart by their titles (the owner's 2026-10-13 request).
 *
 *   - `id` goes on the heading element itself, so a section's
 *     `aria-labelledby` and the section navs point at the title;
 *   - `aux`: optional quiet text on the same baseline at the far end (a
 *     count, a small control) — never part of the heading's name;
 *   - `as`: the outline level (h2 by default);
 *   - the `section-heading` class lets SectionReveal fade just the heading
 *     (`labelOnly` sections, whose rows run their own stagger).
 *
 * Spacing is on the 4px grid (Chakra space): 20px under the heading on
 * phones, 24px from md. The line box is fixed by the text style, so the
 * server HTML and the hydrated page measure the same (no layout shift).
 */
export default function SectionHeading({
  id,
  as = 'h2',
  children,
  aux,
  lang,
  mb = { base: 5, md: 6 },
  ...rest
}: {
  id?: string
  as?: 'h2' | 'h3'
  children: React.ReactNode
  aux?: React.ReactNode
  lang?: string
  mb?: FlexProps['mb']
} & Omit<FlexProps, 'id' | 'as' | 'children' | 'lang' | 'mb'>) {
  return (
    <Flex className="section-heading" align="baseline" justify="space-between" gap={4} mb={mb} minW={0} {...rest}>
      <Text as={as} id={id} lang={lang} textStyle="section" color="page.fg" m={0} minW={0} sx={{ textWrap: 'balance' }}>
        {children}
      </Text>
      {aux ? (
        <Text as="span" textStyle="meta" color="page.fg-subtle" flexShrink={0}>
          {aux}
        </Text>
      ) : null}
    </Flex>
  )
}
