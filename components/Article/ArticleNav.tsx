import React from 'react'
import NextLink from 'next/link'
import { Box, Flex, SimpleGrid, Text } from '@chakra-ui/react'
import type { ArticleLink } from './collectionNav'
import { formatPostDate } from '../../lib/postDate'

const MONO = 'var(--font-geist-mono), monospace'

export type PagerSide = { label: string; item: ArticleLink }

const linkSx = {
  display: 'block',
  border: '1px solid',
  borderColor: 'page.border',
  borderRadius: 'lg',
  bg: 'page.surface',
  p: 5,
  h: '100%',
  textDecoration: 'none',
  transition: 'border-color 250ms var(--ease-out-quart)',
  _hover: { borderColor: 'page.border-strong', textDecoration: 'none' },
  _focusVisible: { outline: '2px solid var(--accent)', outlineOffset: '2px' },
} as const

function metaOf(item: ArticleLink): string {
  if (!item.meta) return ''
  return item.kind === 'blog' ? formatPostDate(item.meta) : item.meta
}

function PagerCard({ side, align }: { side: PagerSide; align: 'left' | 'right' }) {
  const { item } = side
  return (
    <Box as={NextLink} href={item.permalink} sx={linkSx} textAlign={align} rel={align === 'left' ? 'prev' : 'next'}>
      <Text fontFamily={MONO} fontSize="11px" letterSpacing="0.08em" textTransform="uppercase" color="page.fg-secondary" mb={2}>
        {align === 'left' ? '← ' : ''}
        {side.label}
        {align === 'right' ? ' →' : ''}
      </Text>
      <Text as="span" display="block" fontWeight={500} fontSize="16px" color="page.fg" lang={item.lang === 'en' ? undefined : item.lang}>
        {item.title}
      </Text>
    </Box>
  )
}

/**
 * End-of-article navigation: previous / next within the collection and
 * related pieces (any collection) that share tags.
 */
export default function ArticleNav({
  before,
  after,
  related,
}: {
  before: PagerSide | null
  after: PagerSide | null
  related: ArticleLink[]
}) {
  if (!before && !after && related.length === 0) return null
  return (
    <Box as="footer" mt={16} pt={10} borderTop="1px solid" borderColor="page.border" className="no-print">
      {(before || after) && (
        <Box as="nav" aria-label="More in this collection">
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            {before ? <PagerCard side={before} align="left" /> : <Box display={{ base: 'none', md: 'block' }} />}
            {after && <PagerCard side={after} align="right" />}
          </SimpleGrid>
        </Box>
      )}

      {related.length > 0 && (
        <Box as="section" aria-labelledby="related-heading" mt={before || after ? 12 : 0}>
          <Text
            as="h2"
            id="related-heading"
            fontFamily={MONO}
            fontSize="11px"
            letterSpacing="0.12em"
            textTransform="uppercase"
            color="page.fg-secondary"
            mb={4}
          >
            Related
          </Text>
          <Box as="ul" listStyleType="none" m={0} p={0} borderTop="1px solid" borderColor="page.border">
            {related.map((item) => (
              <Box as="li" key={`${item.kind}/${item.slug}`} borderBottom="1px solid" borderColor="page.border">
                <Box
                  as={NextLink}
                  href={item.permalink}
                  display="block"
                  py={4}
                  textDecoration="none"
                  role="group"
                  _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
                >
                  <Flex direction={{ base: 'column', sm: 'row' }} gap={{ base: 1, sm: 6 }} align={{ base: 'flex-start', sm: 'baseline' }}>
                    <Text
                      as="span"
                      flexShrink={0}
                      w={{ sm: '110px' }}
                      fontFamily={MONO}
                      fontSize="11px"
                      letterSpacing="0.08em"
                      textTransform="uppercase"
                      color="page.fg-secondary"
                    >
                      {item.kind === 'blog' ? 'Writing' : 'Case study'}
                    </Text>
                    <Box flex={1} minW={0}>
                      <Text
                        as="span"
                        display="block"
                        fontWeight={500}
                        color="page.fg"
                        _groupHover={{ color: 'accent.text' }}
                        transition="color 150ms var(--ease-out-quart)"
                        lang={item.lang === 'en' ? undefined : item.lang}
                      >
                        {item.title}
                      </Text>
                      {item.description && (
                        <Text as="span" display="block" color="page.fg-secondary" fontSize="14px" mt={1} noOfLines={2}>
                          {item.description}
                        </Text>
                      )}
                    </Box>
                    {metaOf(item) && (
                      <Text as="span" flexShrink={0} fontFamily={MONO} fontSize="11px" color="page.fg-secondary">
                        {metaOf(item)}
                      </Text>
                    )}
                  </Flex>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  )
}
