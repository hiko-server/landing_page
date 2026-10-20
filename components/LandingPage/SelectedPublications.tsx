import NextLink from 'next/link'
import { Box, Flex, Text } from '@chakra-ui/react'

import { textLang } from '../../lib/publications/citation'
import type { SelectedPublications as SelectedPublicationsData } from '../../lib/publications/selected'
import AuthorLine from '../Publications/AuthorLine'
import { StarIcon } from '../Icons/ui/content'

const COLOR_TRANSITION = 'color var(--duration-fast) var(--ease-standard)'

/**
 * Selected Publications — the first papers of /publications (published
 * first, then newest; lib/publications selectPublications) as rows on the
 * home page's hover-intent list, like "Writing & case studies":
 *
 *   2025   Tiny models at the edge                      (h3, links to /publications#key)
 *          Jane Doe, Example Person, …                  (the owner in bold)
 *          Journal of Edge Computing  [ACCEPTED]  ★ Best Paper Award
 *
 * The title is the row's one link (its accessible name is the title alone);
 * a stretched ::after makes the whole row clickable, and the focus ring
 * outlines the row. Anything not yet published carries its status; a paper
 * under review names no venue. Labels are English like /publications, and
 * entered text gets a `lang` when its script differs from the page. Renders
 * nothing without a paper — the server sends null and the section is left
 * out. Type, motion and radii are design tokens (theme/tokens.ts).
 */
export default function SelectedPublications({ data }: { data: SelectedPublicationsData }) {
  const rows = data?.items || []
  if (!rows.length) return null
  const more = data.total - rows.length

  return (
    <Box w="100%" maxW="1100px">
      <Box as="ul" className="hover-list" listStyleType="none" m={0} p={0}>
        {rows.map((item) => (
          <Box
            as="li"
            key={item.key}
            className="hover-item"
            position="relative"
            borderTop="1px solid"
            borderColor="page.border"
            _last={{ borderBottom: '1px solid', borderColor: 'page.border' }}
            sx={{
              '&:hover .pub-row-title': { color: 'accent.text' },
              '& .stretched-link:focus-visible': { outline: 'none' },
              '& .stretched-link:focus-visible::after': { outline: '2px solid var(--accent)', outlineOffset: '2px', borderRadius: 'control' },
            }}
          >
            <Flex direction={{ base: 'column', md: 'row' }} align={{ base: 'flex-start', md: 'baseline' }} gap={{ base: 1, md: 6 }} py={{ base: 4, md: 5 }}>
              <Text as="span" flexShrink={0} w={{ md: '64px' }} textStyle="meta" color="page.fg-secondary" className="tnum">
                {item.year ? <time dateTime={item.year}>{item.year}</time> : null}
              </Text>
              <Box flex="1" minW={0}>
                <Text as="h3" fontSize="body" fontWeight={500} lineHeight="1.4" color="page.fg" sx={{ textWrap: 'pretty' }}>
                  <Box
                    as={NextLink}
                    href={`/publications#${item.key}`}
                    className="stretched-link pub-row-title"
                    lang={textLang(item.title, 'en')}
                    _hover={{ textDecoration: 'none' }}
                    sx={{ transition: COLOR_TRANSITION }}
                  >
                    {item.title}
                  </Box>
                </Text>
                <AuthorLine authors={item.authors} lang="en" fontSize="small" mt={1} />
                {item.venue || item.status || item.award ? (
                  <Flex mt={1.5} columnGap={3} rowGap={1.5} wrap="wrap" align="center" textStyle="small" color="page.fg-secondary">
                    {item.venue ? (
                      <Text as="cite" fontStyle="italic" lang={textLang(item.venue, 'en')}>
                        {item.venue}
                      </Text>
                    ) : null}
                    {item.status ? (
                      <Box as="span" textStyle="label" letterSpacing="caps-tight" px={2} py="1px" borderRadius="pill" bg="var(--accent-soft)" color="accent.text">
                        {item.status}
                      </Box>
                    ) : null}
                    {item.award ? (
                      <Flex as="span" align="center" gap={1.5} color="page.fg" lang={textLang(item.award, 'en')}>
                        <Box as="span" color="accent.text" display="inline-flex" aria-hidden>
                          <StarIcon size="xs" fill="currentColor" />
                        </Box>
                        {item.award}
                      </Flex>
                    ) : null}
                  </Flex>
                ) : null}
              </Box>
            </Flex>
          </Box>
        ))}
      </Box>

      <Flex mt={5} gap={6} wrap="wrap">
        <Box
          as={NextLink}
          href="/publications"
          display="inline-flex"
          alignItems="center"
          gap={1.5}
          minH="24px"
          textStyle="meta"
          color="accent.text"
          _hover={{ textDecoration: 'underline', textUnderlineOffset: '3px' }}
          _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px', borderRadius: 'control' }}
        >
          {more > 0 ? `All ${data.total} publications` : 'All publications'} <span className="nudge" aria-hidden>→</span>
        </Box>
      </Flex>
    </Box>
  )
}
