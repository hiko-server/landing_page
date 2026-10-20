import type { GetStaticPaths, GetStaticProps } from 'next'
import Head from 'next/head'
import { Box, Flex, Link } from '@chakra-ui/react'
import NextLink from 'next/link'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import PageHeader from '../../components/General-UI/PageHeader'
import ArticleBody from '../../components/Article/ArticleBody'
import ArticleNav from '../../components/Article/ArticleNav'
import ArticleEnd, { type ShareData } from '../../components/Article/ArticleEnd'
import MetaGrid, { MetaChips, type MetaItem } from '../../components/Article/MetaGrid'
import DraftBar from '../../components/Article/DraftBar'
import EditPill from '../../components/Article/EditPill'
import LanguageSwitch from '../../components/Article/LanguageSwitch'
import { neighbours, projectLinks, relatedArticles, toArticleLink, type ArticleLink } from '../../components/Article/collectionNav'
import { listPosts, getPost, type HastRoot, type PostFrontmatter } from '../../lib/mdx'
import { labelLang, type TocEntry } from '../../lib/toc'
import { articleImageUrls, blogPostingNode, breadcrumb, absUrl, cardImageAlt, ogLangOf, PERSON_NAME, type Alternate, type ArticleCards, type OgImageOptions } from '../../lib/schema'
import { signedOgImageUrl } from '../../lib/og/sign'
import { tagHref } from '../../lib/tagFilter'
import type { AuthorCardData } from '../../lib/authorCard'
import { formatPostDate, isoDate } from '../../lib/postDate'
import { fillUi, uiLangAttr } from '../../lib/uiStrings'
import { articleUiFor, type ArticleUi } from '../../lib/uiStrings/article'
import { ArticleRoot } from '../../components/Article/articleUi'
import type { SwitchLink } from '../../lib/translations'
import { markdownTwinPath } from '../../lib/markdownTwinPaths'
import { reviewReadOptions, reviewRenderOf } from '../../lib/review/render'

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
  /** Signed social-card URLs (1200×630 and square), computed in getStaticProps. */
  ogImages: ArticleCards
  /** Newer / older post in the collection (index order is newest first). */
  newer: ArticleLink | null
  older: ArticleLink | null
  related: ArticleLink[]
  /** The case study this post is about (its `project` frontmatter, D8); null when none. */
  project: ArticleLink | null
  /** End-of-article author card (public CV / home data). */
  author: AuthorCardData | null
  /** QR code of the page for WeChat (inline SVG). */
  shareQr: string | null
  /** Rendered in Draft Mode (the admin preview cookie): drafts are visible. */
  draftMode: boolean
  /** The post in other languages (F2): the language switch. */
  translations: SwitchLink[]
  /** The interface words in the post's language (F1, lib/uiStrings/article). */
  ui: ArticleUi
  /** hreflang alternates of the post and its translations (empty without translations). */
  alternates: Alternate[]
  /** Draft Mode is showing the post's unpublished changes, not its live version (H4). */
  pendingPreview: boolean
  /** Rendered for a review link (H5, pages/review/[token]): kept out of search indexes. */
  review?: boolean
}

const MONO = 'var(--font-geist-mono), monospace'

const blogTag = (t: string) => tagHref('/blog', t)

export default function BlogPost({
  slug,
  frontmatter,
  tree,
  readingMinutes,
  toc,
  lang,
  excerpt,
  ogImages,
  newer,
  older,
  related,
  project,
  author,
  shareQr,
  draftMode,
  translations,
  alternates,
  ui: articleUi,
  pendingPreview,
  review = false,
}: Props) {
  const path = `/blog/${slug}`
  const url = absUrl(path)
  const published = isoDate(frontmatter.date)
  const modified = isoDate(frontmatter.updated || frontmatter.date)
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : []
  const image = ogImages.card
  const titleLang = labelLang(frontmatter.title) || 'en'
  // Interface words in the article's language (lib/uiStrings): 日期 / 阅读 on a Chinese post.
  const { t, lang: uiLang } = articleUi
  const ui = uiLangAttr(lang)
  const share: ShareData = { url, title: frontmatter.title, qrSvg: shareQr }

  const meta: MetaItem[] = [
    {
      label: t.date,
      value: published ? (
        <time dateTime={published} className="tnum">
          {formatPostDate(frontmatter.date, uiLang)}
        </time>
      ) : null,
    },
    {
      label: t.updated,
      value:
        modified && modified !== published ? (
          <time dateTime={modified} className="tnum">
            {formatPostDate(frontmatter.updated, uiLang)}
          </time>
        ) : null,
    },
    { label: t.read, value: <span className="tnum">{fillUi(t.minutes, { n: readingMinutes })}</span> },
    {
      label: t.caseStudy,
      value: project ? (
        <Link as={NextLink} href={project.permalink} color="accent.text" className="link-underline" lang={project.lang === lang ? undefined : project.lang}>
          {project.title}
        </Link>
      ) : null,
    },
    { label: t.tags, value: tags.length ? <MetaChips items={tags} label={t.tags} hrefFor={blogTag} pageLang={lang} /> : null, wide: true },
  ]

  return (
    <>
      <CustomHead
        title={frontmatter.seoTitle || frontmatter.title}
        description={frontmatter.description || `${frontmatter.title} — an essay by ${PERSON_NAME}.`}
        fallbackDescription={excerpt}
        url={url}
        image={image}
        imageAlt={cardImageAlt(frontmatter.title, frontmatter.cover, frontmatter.coverAlt)}
        type="article"
        lang={lang}
        noindex={draftMode || review}
        alternates={alternates}
        publishedTime={published || undefined}
        modifiedTime={modified || undefined}
        jsonLd={[
          blogPostingNode({
            path,
            title: frontmatter.title,
            description: frontmatter.description,
            lang,
            images: articleImageUrls(ogImages, frontmatter.cover),
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
      {/* The Markdown twin of the post (G9: /blog/<slug>.md, for language models and agents). */}
      {!frontmatter.draft && (
        <Head>
          <link key="markdown-twin" rel="alternate" type="text/markdown" href={markdownTwinPath(path)} title={`${frontmatter.title} (Markdown)`} />
        </Head>
      )}
      <HeaderFooter>
        <Box
          maxW="var(--container-content)"
          mx="auto"
          px={[4, 6, 8]}
          py={[12, 16]}
          pb={draftMode ? 24 : undefined}
          // The page gutter: full-width figures bleed through it on phones.
          sx={{ '--page-gutter': { base: '1rem', sm: '1.5rem', md: '2rem' } }}
        >
          <Flex align="center" justify="space-between" gap={4} rowGap={3} wrap="wrap" minH="32px" mb={8} className="no-print">
            <Link as={NextLink} href="/blog" fontFamily={MONO} fontSize="11px" color="page.fg-secondary" className="link-underline" lang={ui}>
              {t.allPosts}
            </Link>
            <Flex align="center" gap={2} wrap="wrap" justify="flex-end">
              <LanguageSwitch translations={translations} label={t.otherLanguages} />
              <EditPill kind="blog" slug={slug} />
            </Flex>
          </Flex>

          <ArticleRoot ui={articleUi} lang={lang} morphId={path}>
            <PageHeader
              eyebrow={<span lang={ui}>{t.writing}</span>}
              title={frontmatter.title}
              titleLang={titleLang !== lang ? titleLang : undefined}
              lede={frontmatter.description}
              morph
            />

            <Box mb={12} pb={6} borderBottom="1px solid" borderColor="page.border" lang={ui}>
              <MetaGrid items={meta} />
            </Box>

            <ArticleBody tree={tree} toc={toc} />

            <ArticleEnd author={author} share={share} />

            <ArticleNav
              before={newer ? { label: t.newer, item: newer } : null}
              after={older ? { label: t.older, item: older } : null}
              related={related}
            />
          </ArticleRoot>
        </Box>
        {draftMode && <DraftBar path={path} pending={pendingPreview} />}
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
  // A review link (H5) renders this one draft or these unpublished changes, and nothing else unpublished.
  const review = reviewRenderOf(ctx)
  const draftMode = ctx.draftMode === true && !review
  // Draft Mode shows drafts, and a live post's unpublished changes (H4).
  const post = await getPost(slug, review ? reviewReadOptions(review) : { includeDrafts: draftMode, pending: draftMode })
  if (!post && review) return { notFound: true }
  // No item: a renamed post's old address redirects permanently (308) to the new one (H6), else 404.
  if (!post) return (await import('../../lib/redirects')).missingItemProps('blog', slug, draftMode)

  const [{ loadAuthorCard }, { qrSvg }, { articleSiblings }] = await Promise.all([
    import('../../lib/authorCard'),
    import('../../lib/qr'),
    import('../../lib/articleSiblings'),
  ])
  // One link per piece, in this post's language (F2); its own translations for the switch.
  const { posts, work, translations, alternates, projectFor } = articleSiblings('blog', post, { draftMode })
  const ownLink = toArticleLink('blog', post)
  const self = { ...ownLink, project: projectFor(ownLink.project) ?? null }
  const { before, after } = neighbours(posts, slug)
  const related = relatedArticles(self, [...posts, ...work])
  const project = projectLinks(self, work)[0] ?? null
  const card: OgImageOptions = {
    kind: 'blog',
    title: post.frontmatter.title,
    lang: ogLangOf(post.lang),
    date: isoDate(post.frontmatter.date) || undefined,
    mins: post.readingMinutes,
    tags: Array.isArray(post.frontmatter.tags) ? post.frontmatter.tags : [],
    cover: post.frontmatter.cover,
    coverFocus: post.frontmatter.coverFocus,
    v: post.updatedAt,
  }

  let shareQr: string | null = null
  try {
    shareQr = await qrSvg(absUrl(`/blog/${post.slug}`))
  } catch {
    /* the share row keeps its other actions */
  }

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
      ogImages: { card: signedOgImageUrl(card), square: signedOgImageUrl({ ...card, size: 'square' }) },
      newer: before,
      older: after,
      related,
      project,
      author: loadAuthorCard(),
      shareQr,
      draftMode,
      translations,
      alternates,
      ui: articleUiFor(post.lang),
      pendingPreview: draftMode && !!(await import('../../lib/pendingRevisions')).getPendingRevision('blog', post.slug),
      ...(review ? { review: true } : {}),
      // Whether /publications exists, for the nav link (lib/publicationsData).
      ...(await import('../../lib/publicationsData')).chromePublicationsProp(),
    },
    revalidate: 60,
  }
}
