import { Box, Flex, Text } from '@chakra-ui/react'
import NextLink from 'next/link'

import { formatPostDate } from '../../lib/postDate'
import { fillUi } from '../../lib/uiStrings'
import type { WritingItem } from './projectMatch'
import { useHomeUi } from './homeUi'

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

const moreLinkSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 1.5,
  minH: '24px',
  fontFamily: monoFont,
  fontSize: '12px',
  letterSpacing: '0.04em',
  color: 'accent.text',
  _hover: { textDecoration: 'underline', textUnderlineOffset: '3px' },
  _focusVisible: { outline: '2px solid var(--accent)', outlineOffset: '2px', borderRadius: 'sm' },
} as const

/**
 * Writing & case studies — the newest posts and case studies (server
 * data from lib/mdx), as plain link rows on a hover-intent list:
 *
 *   [POST]  The AI was the easy part: building an edge waste-sorter…   May 30, 2026
 *
 * A post is dated by its publication date, a case study by its last update
 * (said so to screen readers). Titles carry their own `lang`. Renders
 * nothing when there is nothing published.
 */
export default function LatestWriting({
  items,
  hasPosts,
  hasWork,
}: {
  items?: WritingItem[]
  /** Whether any post / case study is published (shows the "All …" links). */
  hasPosts?: boolean
  hasWork?: boolean
}) {
  const { t, lang, links } = useHomeUi()
  const w = t.writing
  const rows = Array.isArray(items) ? items : []
  if (!rows.length) return null
  // A title in another language than the page's carries its own.
  const ownLang = (l: string) => (l === lang ? undefined : l)

  return (
    <Box w="100%" maxW="1100px">
      <Box as="ul" className="hover-list" listStyleType="none" m={0} p={0}>
        {rows.map((r) => (
          <Box as="li" key={r.href} borderTop="1px solid" borderColor="page.border" _last={{ borderBottom: '1px solid', borderColor: 'page.border' }}>
            <Flex
              as={NextLink}
              href={r.href}
              className="hover-item pressable"
              data-vt-morph={r.href}
              direction={{ base: 'column', md: 'row' }}
              align={{ base: 'flex-start', md: 'baseline' }}
              gap={{ base: 1, md: 6 }}
              py={4}
              color="page.fg"
              _hover={{ textDecoration: 'none' }}
              sx={{ '&:hover .writing-title': { color: 'accent.text' } }}
              _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px', borderRadius: 'sm' }}
            >
              <Text
                as="span"
                flexShrink={0}
                w={{ md: '64px' }}
                fontFamily={monoFont}
                fontSize="11px"
                letterSpacing="0.08em"
                color="page.fg-secondary"
              >
                {r.kind === 'post' ? w.post : w.work}
                <span className="sr-only">{r.kind === 'post' ? w.postSr : w.workSr}</span>
              </Text>
              <Box flex="1" minW={0}>
                <Text
                  as="span"
                  className="writing-title"
                  data-vt-part="title"
                  display="block"
                  fontSize="16px"
                  fontWeight={500}
                  lineHeight="1.4"
                  letterSpacing="-0.005em"
                  lang={ownLang(r.lang)}
                  sx={{ transition: 'color 200ms var(--ease-out-quart)' }}
                >
                  {r.title}
                </Text>
                {r.description && (
                  <Text as="span" display="block" mt={1} fontSize="13px" lineHeight="1.6" color="page.fg-secondary" noOfLines={1} lang={ownLang(r.lang)}>
                    {r.description}
                  </Text>
                )}
              </Box>
              <Flex
                as="span"
                flexShrink={0}
                gap={3}
                fontFamily={monoFont}
                fontSize="11px"
                letterSpacing="0.04em"
                color="page.fg-secondary"
                className="tnum"
              >
                {r.date && (
                  <time dateTime={r.date}>
                    {r.kind === 'work' && <span className="sr-only">{w.updated}</span>}
                    {formatPostDate(r.date, lang)}
                  </time>
                )}
                {r.readingMinutes > 0 && <span>{fillUi(w.minutes, { n: r.readingMinutes })}</span>}
              </Flex>
            </Flex>
          </Box>
        ))}
      </Box>

      <Flex mt={5} gap={6} wrap="wrap">
        {hasPosts && (
          <Box as={NextLink} href={links.blog} sx={moreLinkSx}>
            {w.allWriting} <span className="nudge" aria-hidden>→</span>
          </Box>
        )}
        {hasWork && (
          <Box as={NextLink} href={links.work} sx={moreLinkSx}>
            {w.allWork} <span className="nudge" aria-hidden>→</span>
          </Box>
        )}
      </Flex>
    </Box>
  )
}
