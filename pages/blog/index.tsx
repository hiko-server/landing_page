import React, { useMemo, useState } from 'react'
import type { GetStaticProps } from 'next'
import { Box, Flex, Text, Link, HStack, Button } from '@chakra-ui/react'
import NextLink from 'next/link'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import PageHeader from '../../components/General-UI/PageHeader'
import { listPosts, type PostFrontmatter, type MDXIndexEntry } from '../../lib/mdx'
import { formatPostDate, isoDate } from '../../lib/postDate'
import { absUrl, ogImageUrl, personAuthor, PERSON_NAME, SITE_HOST } from '../../lib/schema'

type Props = {
  posts: MDXIndexEntry<PostFrontmatter>[]
}

const MONO = 'var(--font-geist-mono), monospace'

export default function BlogIndex({ posts }: Props) {
  const [activeTag, setActiveTag] = useState<string | null>(null)

  // Collect tags with counts; keep deterministic order (alphabetical) so the
  // chip row doesn't reshuffle between renders.
  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of posts) {
      for (const t of p.frontmatter.tags || []) {
        counts.set(t, (counts.get(t) || 0) + 1)
      }
    }
    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [posts])

  const visible = useMemo(
    () => (activeTag ? posts.filter((p) => (p.frontmatter.tags || []).includes(activeTag)) : posts),
    [posts, activeTag],
  )

  const chip = (selected: boolean) => ({
    size: 'xs' as const,
    variant: 'outline' as const,
    bg: selected ? 'page.fg' : 'transparent',
    color: selected ? 'page.bg' : 'page.fg-secondary',
    borderColor: selected ? 'page.fg' : 'page.border-strong',
    fontFamily: MONO,
    fontWeight: 500,
    _hover: { borderColor: 'page.fg', bg: selected ? 'page.fg' : 'transparent' },
    _focusVisible: { outline: '2px solid var(--accent)', outlineOffset: '2px' },
  })

  return (
    <>
      <CustomHead
        title="Writing"
        description={`Essays, notes, and technical write-ups by ${PERSON_NAME} on software engineering, machine learning, and building products.`}
        url={absUrl('/blog')}
        image={ogImageUrl({ kind: 'blog', title: 'Writing', subtitle: 'Essays, notes, and write-ups' })}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Blog',
          name: `${SITE_HOST.toUpperCase()} — Writing`,
          url: absUrl('/blog'),
          author: personAuthor,
          blogPost: posts.slice(0, 10).map((p) => ({
            '@type': 'BlogPosting',
            headline: p.frontmatter.title,
            url: absUrl(p.permalink),
            datePublished: isoDate(p.frontmatter.date) || undefined,
            inLanguage: p.lang,
          })),
        }}
      />
      <HeaderFooter>
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[12, 16]}>
          <PageHeader
            eyebrow="Writing"
            title="Notes, essays, and write-ups."
            lede={
              <>
                Long-form pieces on engineering, ML, and the craft of shipping software. New posts land here when
                they&rsquo;re ready — no drafts, no fluff.
              </>
            }
          />

          {tags.length > 0 && (
            <HStack as="div" role="group" aria-label="Filter posts by tag" mb={8} spacing={2} flexWrap="wrap" rowGap={2}>
              <Button {...chip(activeTag === null)} aria-pressed={activeTag === null} onClick={() => setActiveTag(null)}>
                all ({posts.length})
              </Button>
              {tags.map(([t, n]) => (
                <Button key={t} {...chip(activeTag === t)} aria-pressed={activeTag === t} onClick={() => setActiveTag(t)}>
                  #{t} ({n})
                </Button>
              ))}
            </HStack>
          )}

          {visible.length === 0 ? (
            <Box border="1px dashed" borderColor="page.border-strong" borderRadius="lg" p={[6, 10]} textAlign="center">
              <Text fontFamily={MONO} fontSize="12px" color="page.fg-secondary" mb={2}>
                [ no posts yet ]
              </Text>
              <Text color="page.fg-secondary" fontSize="14px">
                Posts will appear here as they&rsquo;re published.
              </Text>
            </Box>
          ) : (
            <Box as="ul" className="hover-list" listStyleType="none" m={0} p={0} borderTop="1px solid" borderColor="page.border">
              {visible.map((p) => (
                <Box as="li" key={p.slug} className="hover-item" borderBottom="1px solid" borderColor="page.border">
                  <Link
                    as={NextLink}
                    href={p.permalink}
                    data-group=""
                    _hover={{ textDecoration: 'none' }}
                    _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
                    display="block"
                    py={5}
                  >
                    <Flex direction={['column', 'row']} align={['flex-start', 'baseline']} gap={[1, 6]}>
                      <Text
                        as="time"
                        className="tnum"
                        dateTime={isoDate(p.frontmatter.date) || undefined}
                        flexShrink={0}
                        fontFamily={MONO}
                        fontSize="12px"
                        color="page.fg-secondary"
                        w={['auto', '110px']}
                      >
                        {formatPostDate(p.frontmatter.date)}
                      </Text>
                      <Box flex={1} minW={0}>
                        <Text
                          as="span"
                          display="block"
                          color="page.fg"
                          fontWeight={500}
                          fontSize="17px"
                          transition="color 150ms var(--ease-out-quart)"
                          _groupHover={{ color: 'accent.text' }}
                          lang={p.lang === 'en' ? undefined : p.lang}
                          style={{ viewTransitionName: `vt-blog-${p.slug}` }}
                        >
                          {p.frontmatter.title}
                        </Text>
                        {p.frontmatter.description && (
                          <Text
                            as="span"
                            display="block"
                            color="page.fg-secondary"
                            fontSize="14px"
                            mt={1}
                            noOfLines={2}
                            lang={p.lang === 'en' ? undefined : p.lang}
                          >
                            {p.frontmatter.description}
                          </Text>
                        )}
                      </Box>
                      <Text as="span" flexShrink={0} fontFamily={MONO} fontSize="11px" color="page.fg-secondary" className="tnum">
                        {p.readingMinutes} min read
                        <Box as="span" aria-hidden className="nudge" ml={2} color="page.fg-subtle">
                          →
                        </Box>
                      </Text>
                    </Flex>
                  </Link>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </HeaderFooter>
    </>
  )
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  return {
    props: {
      posts: listPosts(),
    },
    revalidate: 60,
  }
}
