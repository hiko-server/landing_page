import React from 'react'
import type { GetStaticPaths, GetStaticProps } from 'next'
import { Box, Heading, Text, Flex, Tag, Link } from '@chakra-ui/react'
import NextLink from 'next/link'
import type { MDXRemoteSerializeResult } from 'next-mdx-remote'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import SectionLabel from '../../components/General-UI/SectionLabel'
import ArticleBody from '../../components/Article/ArticleBody'
import ArticleNav from '../../components/Article/ArticleNav'
import { neighbours, relatedByTags, toArticleLink, type ArticleLink } from '../../components/Article/collectionNav'
import { listPosts, listWorkInDisplayOrder, getPost, type PostFrontmatter } from '../../lib/mdx'
import type { TocEntry } from '../../lib/toc'
import { absUrl, breadcrumb, ogImageUrl, personRef, PERSON_NAME } from '../../lib/schema'
import { formatPostDate, isoDate } from '../../lib/postDate'

type Props = {
  slug: string
  frontmatter: PostFrontmatter
  source: MDXRemoteSerializeResult
  readingMinutes: number
  toc: TocEntry[]
  /** Contract E: BCP-47 language for <html lang>. */
  lang: string
  /** Newer / older post in the collection (index order is newest first). */
  newer: ArticleLink | null
  older: ArticleLink | null
  related: ArticleLink[]
}

const MONO = 'var(--font-geist-mono), monospace'

export default function BlogPost({ slug, frontmatter, source, readingMinutes, toc, lang, newer, older, related }: Props) {
  const url = absUrl(`/blog/${slug}`)
  const image = ogImageUrl({ kind: 'blog', title: frontmatter.title, subtitle: frontmatter.description })
  const published = isoDate(frontmatter.date)
  const modified = isoDate(frontmatter.updated || frontmatter.date)
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : []

  return (
    <>
      <CustomHead
        title={frontmatter.title}
        description={frontmatter.description || `${frontmatter.title} — an essay by ${PERSON_NAME}.`}
        url={url}
        image={image}
        type="article"
        lang={lang}
        publishedTime={published || undefined}
        modifiedTime={modified || undefined}
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: frontmatter.title,
            description: frontmatter.description || undefined,
            image,
            inLanguage: lang,
            datePublished: published || undefined,
            dateModified: modified || undefined,
            ...(tags.length ? { keywords: tags.join(', ') } : {}),
            author: personRef,
            publisher: personRef,
            mainEntityOfPage: url,
            url,
          },
          breadcrumb([
            { name: 'Home', path: '/' },
            { name: 'Writing', path: '/blog' },
            { name: frontmatter.title, path: `/blog/${slug}` },
          ]),
        ]}
      />
      <HeaderFooter>
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[12, 16]}>
          <Link
            as={NextLink}
            href="/blog"
            fontFamily={MONO}
            fontSize="11px"
            color="page.fg-secondary"
            className="link-underline no-print"
            display="inline-block"
            mb={8}
          >
            ← All posts
          </Link>

          <Box as="article" lang={lang}>
            <Box as="header">
              <SectionLabel n="01" as="p">
                Article
              </SectionLabel>

              <Heading
                as="h1"
                mt={6}
                mb={4}
                fontSize={['32px', '44px', '52px']}
                lineHeight="1.08"
                letterSpacing="-0.025em"
                fontWeight={500}
                maxW="900px"
                style={{ viewTransitionName: `vt-blog-${slug}` }}
              >
                {frontmatter.title}
              </Heading>

              {frontmatter.description && (
                <Text color="page.fg-secondary" fontSize={['16px', '17px']} maxW="720px" mb={6}>
                  {frontmatter.description}
                </Text>
              )}

              <Flex
                wrap="wrap"
                gap={4}
                align="center"
                fontFamily={MONO}
                fontSize="11px"
                color="page.fg-secondary"
                mb={12}
                pb={6}
                borderBottom="1px solid"
                borderColor="page.border"
              >
                {published && (
                  <>
                    <Text as="time" dateTime={published}>
                      {formatPostDate(frontmatter.date)}
                    </Text>
                    <Text as="span" aria-hidden opacity={0.5}>
                      ·
                    </Text>
                  </>
                )}
                <Text as="span">{readingMinutes} min read</Text>
                {modified && modified !== published && (
                  <>
                    <Text as="span" aria-hidden opacity={0.5}>
                      ·
                    </Text>
                    <Text as="span">
                      Updated <time dateTime={modified}>{formatPostDate(frontmatter.updated)}</time>
                    </Text>
                  </>
                )}
                {tags.length > 0 && (
                  <>
                    <Text as="span" aria-hidden opacity={0.5}>
                      ·
                    </Text>
                    <Flex as="ul" aria-label="Tags" listStyleType="none" gap={2} wrap="wrap" m={0} p={0}>
                      {tags.map((t) => (
                        <Box as="li" key={t}>
                          <Tag size="sm" variant="outline" fontSize="10px" fontFamily={MONO}>
                            {t}
                          </Tag>
                        </Box>
                      ))}
                    </Flex>
                  </>
                )}
              </Flex>
            </Box>

            <ArticleBody source={source} toc={toc} />

            <ArticleNav
              before={newer ? { label: 'Newer', item: newer } : null}
              after={older ? { label: 'Older', item: older } : null}
              related={related}
            />
          </Box>
        </Box>
      </HeaderFooter>
    </>
  )
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: listPosts().map((p) => ({ params: { slug: p.slug } })),
  fallback: 'blocking',
})

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const slug = String(ctx.params?.slug || '')
  const post = await getPost(slug)
  if (!post) return { notFound: true, revalidate: 60 }

  const posts = listPosts().map((p) => toArticleLink('blog', p))
  const work = listWorkInDisplayOrder().map((w) => toArticleLink('work', w))
  const { before, after } = neighbours(posts, slug)
  const related = relatedByTags(toArticleLink('blog', post), [...posts, ...work])

  return {
    props: {
      slug: post.slug,
      frontmatter: post.frontmatter,
      source: post.source,
      readingMinutes: post.readingMinutes,
      toc: post.toc,
      lang: post.lang,
      newer: before,
      older: after,
      related,
    },
    revalidate: 60,
  }
}
