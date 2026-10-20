import { useMemo } from 'react'
import type { GetStaticProps } from 'next'
import { Box, Flex, Text, Link } from '@chakra-ui/react'
import NextLink from 'next/link'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import PageHeader from '../../components/General-UI/PageHeader'
import EmptyState from '../../components/General-UI/EmptyState'
import TagFilterBar, { TagPrepaint, useTagFilter } from '../../components/Article/TagFilter'
import { listPosts, type PostFrontmatter, type MDXIndexEntry } from '../../lib/mdx'
import { hasTag, tagCounts, tagSlugList } from '../../lib/tagFilter'
import { formatPostDate, isoDate } from '../../lib/postDate'
import { absUrl, personAuthor, PERSON_NAME, SITE_HOST } from '../../lib/schema'
import { ogPresetUrl } from '../../lib/og/presets'
import { alsoInOf, collapseTranslations, type AlsoIn } from '../../lib/translations'
import { LIST_UI } from '../../lib/uiStrings/lists'

type IndexPost = MDXIndexEntry<PostFrontmatter> & {
  /** Languages the post is also published in (F2): one entry per piece, in English where it exists. */
  alsoIn: AlsoIn[]
}

type Props = {
  posts: IndexPost[]
}

const MONO = 'var(--font-geist-mono), monospace'

/**
 * /blog — every published post, newest first, with a shareable tag filter
 * (`?tag=edge-ai`, components/Article/TagFilter.tsx). A post published in
 * several languages is listed once, in English where it exists, marked
 * "Also in 简体中文" (its page switches language). ISR (60 s).
 */
export default function BlogIndex({ posts }: Props) {
  // Tags with counts, alphabetical, so the chip row never reshuffles.
  const tags = useMemo(() => tagCounts(posts.map((p) => p.frontmatter.tags)), [posts])
  const { active, select } = useTagFilter(tags)

  const visible = useMemo(() => (active ? posts.filter((p) => hasTag(p.frontmatter.tags, active)) : posts), [posts, active])

  return (
    <>
      <CustomHead
        title="Writing"
        description={`Essays, notes, and technical write-ups by ${PERSON_NAME} on software engineering, machine learning, and building products.`}
        url={absUrl('/blog')}
        image={ogPresetUrl('writing')}
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
            <TagFilterBar
              tags={tags}
              total={posts.length}
              active={active}
              onSelect={select}
              label="Filter posts by tag"
              noun={{ one: 'post', many: 'posts' }}
              matching={visible.length}
            />
          )}

          {visible.length === 0 ? (
            <EmptyState
              title="No posts yet"
              actions={[
                { label: 'Case studies', href: '/work' },
                { label: 'CV', href: '/cv' },
              ]}
            >
              Posts will appear here as they&rsquo;re published.
            </EmptyState>
          ) : (
            <>
              <TagPrepaint tags={tags} />
              <Box as="ul" className="hover-list" listStyleType="none" m={0} p={0} borderTop="1px solid" borderColor="page.border">
                {visible.map((p) => (
                  <Box
                    as="li"
                    key={p.slug}
                    className="hover-item"
                    borderBottom="1px solid"
                    borderColor="page.border"
                    data-tag-item=""
                    data-tag-slugs={tagSlugList(p.frontmatter.tags)}
                  >
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
                          {p.alsoIn.length > 0 && (
                            <Text as="span" display="block" mt={1.5} fontFamily={MONO} fontSize="11px" color="page.fg-secondary" data-also-in="">
                              {LIST_UI.en.alsoIn}{' '}
                              {p.alsoIn.map((l, i) => (
                                <span key={l.lang}>
                                  {i > 0 ? ', ' : ''}
                                  <span lang={l.lang}>{l.name}</span>
                                </span>
                              ))}
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
            </>
          )}
        </Box>
      </HeaderFooter>
    </>
  )
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  return {
    props: {
      posts: collapseTranslations(listPosts(), 'en').map(({ entry, alsoIn }) => ({ ...entry, alsoIn: alsoInOf(alsoIn) })),
      // Whether /publications exists, for the nav link (lib/publicationsData).
      ...(await import('../../lib/publicationsData')).chromePublicationsProp(),
    },
    revalidate: 60,
  }
}
