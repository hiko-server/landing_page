import React from 'react'
import type { GetStaticPaths, GetStaticProps } from 'next'
import { Box, Flex, Link } from '@chakra-ui/react'
import NextLink from 'next/link'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import PageHeader from '../../components/General-UI/PageHeader'
import ArticleBody from '../../components/Article/ArticleBody'
import ArticleNav from '../../components/Article/ArticleNav'
import MetaGrid, { MetaChips, type MetaItem } from '../../components/Article/MetaGrid'
import DraftBar from '../../components/Article/DraftBar'
import EditPill from '../../components/Article/EditPill'
import { neighbours, relatedByTags, toArticleLink, type ArticleLink } from '../../components/Article/collectionNav'
import { listPosts, listWorkInDisplayOrder, getPost, type HastRoot, type PostFrontmatter } from '../../lib/mdx'
import { labelLang, type TocEntry } from '../../lib/toc'
import { articleImages, blogPostingNode, breadcrumb, absUrl, ogImageUrl, ogLangOf, PERSON_NAME, type OgImageOptions } from '../../lib/schema'
import { formatPostDate, isoDate } from '../../lib/postDate'

type Props = {
  slug: string
  frontmatter: PostFrontmatter
  tree: HastRoot
  readingMinutes: number
  toc: TocEntry[]
  /** Contract E: BCP-47 language for <html lang>. */
  lang: string
  /** First paragraph: meta description when the frontmatter one is too short. */
  excerpt: string
  /** Content-store write time (og:image cache-buster). */
  updatedAt: number | null
  /** Newer / older post in the collection (index order is newest first). */
  newer: ArticleLink | null
  older: ArticleLink | null
  related: ArticleLink[]
  /** Rendered in Draft Mode (the admin preview cookie): drafts are visible. */
  draftMode: boolean
}

const MONO = 'var(--font-geist-mono), monospace'

/** English UI text inside a non-English article keeps its own language. */
const uiLang = (lang: string) => (lang === 'en' || lang.startsWith('en-') ? undefined : 'en')

export default function BlogPost({
  slug,
  frontmatter,
  tree,
  readingMinutes,
  toc,
  lang,
  excerpt,
  updatedAt,
  newer,
  older,
  related,
  draftMode,
}: Props) {
  const path = `/blog/${slug}`
  const url = absUrl(path)
  const published = isoDate(frontmatter.date)
  const modified = isoDate(frontmatter.updated || frontmatter.date)
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : []
  const card: OgImageOptions = {
    kind: 'blog',
    title: frontmatter.title,
    lang: ogLangOf(lang),
    date: published || undefined,
    mins: readingMinutes,
    tags,
    cover: frontmatter.cover,
    v: updatedAt,
  }
  const image = ogImageUrl(card)
  const titleLang = labelLang(frontmatter.title) || 'en'
  const ui = uiLang(lang)

  const meta: MetaItem[] = [
    {
      label: 'Date',
      value: published ? (
        <time dateTime={published} className="tnum">
          {formatPostDate(frontmatter.date)}
        </time>
      ) : null,
    },
    {
      label: 'Updated',
      value:
        modified && modified !== published ? (
          <time dateTime={modified} className="tnum">
            {formatPostDate(frontmatter.updated)}
          </time>
        ) : null,
    },
    { label: 'Read', value: <span className="tnum">{readingMinutes} min</span> },
    { label: 'Tags', value: tags.length ? <MetaChips items={tags} label="Tags" /> : null, wide: true },
  ]

  return (
    <>
      <CustomHead
        title={frontmatter.seoTitle || frontmatter.title}
        description={frontmatter.description || `${frontmatter.title} — an essay by ${PERSON_NAME}.`}
        fallbackDescription={excerpt}
        url={url}
        image={image}
        imageAlt={`${frontmatter.title} — ${PERSON_NAME}`}
        type="article"
        lang={lang}
        noindex={draftMode}
        publishedTime={published || undefined}
        modifiedTime={modified || undefined}
        jsonLd={[
          blogPostingNode({
            path,
            title: frontmatter.title,
            description: frontmatter.description,
            lang,
            images: articleImages(card, frontmatter.cover),
            keywords: tags,
            datePublished: published,
            dateModified: modified,
          }),
          breadcrumb([
            { name: 'Home', path: '/' },
            { name: 'Writing', path: '/blog' },
            { name: frontmatter.title, path },
          ]),
        ]}
      />
      <HeaderFooter>
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[12, 16]} pb={draftMode ? 24 : undefined}>
          <Flex align="center" justify="space-between" gap={4} minH="32px" mb={8} className="no-print">
            <Link as={NextLink} href="/blog" fontFamily={MONO} fontSize="11px" color="page.fg-secondary" className="link-underline">
              ← All posts
            </Link>
            <EditPill kind="blog" slug={slug} />
          </Flex>

          <Box as="article" lang={lang}>
            <PageHeader
              eyebrow={<span lang={ui}>Writing</span>}
              title={frontmatter.title}
              titleLang={titleLang !== lang ? titleLang : undefined}
              lede={frontmatter.description}
              vtName={`vt-blog-${slug}`}
            />

            <Box mb={12} pb={6} borderBottom="1px solid" borderColor="page.border" lang={ui}>
              <MetaGrid items={meta} />
            </Box>

            <ArticleBody tree={tree} toc={toc} />

            <ArticleNav
              before={newer ? { label: 'Newer', item: newer } : null}
              after={older ? { label: 'Older', item: older } : null}
              related={related}
            />
          </Box>
        </Box>
        {draftMode && <DraftBar path={path} />}
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
  const draftMode = ctx.draftMode === true
  const post = await getPost(slug, { includeDrafts: draftMode })
  if (!post) return { notFound: true, revalidate: 60 }

  const posts = listPosts().map((p) => toArticleLink('blog', p))
  const work = listWorkInDisplayOrder().map((w) => toArticleLink('work', w))
  const { before, after } = neighbours(posts, slug)
  const related = relatedByTags(toArticleLink('blog', post), [...posts, ...work])

  return {
    props: {
      slug: post.slug,
      frontmatter: post.frontmatter,
      tree: post.tree,
      readingMinutes: post.readingMinutes,
      toc: post.toc,
      lang: post.lang,
      excerpt: post.excerpt,
      updatedAt: post.updatedAt,
      newer: before,
      older: after,
      related,
      draftMode,
    },
    revalidate: 60,
  }
}
