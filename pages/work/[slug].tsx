import React from 'react'
import type { GetStaticPaths, GetStaticProps } from 'next'
import { Box, Flex, Link } from '@chakra-ui/react'
import NextLink from 'next/link'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import PageHeader from '../../components/General-UI/PageHeader'
import ArticleBody from '../../components/Article/ArticleBody'
import ArticleNav from '../../components/Article/ArticleNav'
import ArticleEnd, { type ShareData } from '../../components/Article/ArticleEnd'
import AtAGlance from '../../components/Article/AtAGlance'
import MetaGrid, { MetaChips, type MetaItem } from '../../components/Article/MetaGrid'
import DraftBar from '../../components/Article/DraftBar'
import EditPill from '../../components/Article/EditPill'
import CoverFrame, { type CoverView } from '../../components/Work/CoverFrame'
import { neighbours, projectLinks, relatedArticles, toArticleLink, type ArticleLink } from '../../components/Article/collectionNav'
import { listPosts, listWorkInDisplayOrder, getWork, type HastRoot, type WorkFrontmatter } from '../../lib/mdx'
import { labelLang, type TocEntry } from '../../lib/toc'
import { safeHref } from '../../lib/cvFormat'
import { formatPostDate } from '../../lib/postDate'
import { tagHref } from '../../lib/tagFilter'
import type { AuthorCardData } from '../../lib/authorCard'
import { articleImageUrls, breadcrumb, absUrl, caseStudyNode, ogLangOf, PERSON_NAME, type ArticleCards, type OgImageOptions } from '../../lib/schema'
import { signedOgImageUrl } from '../../lib/og/sign'

type Props = {
  slug: string
  frontmatter: WorkFrontmatter
  tree: HastRoot
  readingMinutes: number
  toc: TocEntry[]
  /** Contract E: BCP-47 language for <html lang>. */
  lang: string
  /** First paragraph: meta description when the frontmatter one is too short. */
  excerpt: string
  /** Content-store write time (og:image cache-buster, schema dateModified). */
  updatedAt: number | null
  /** Signed social-card URLs (1200×630 and square), computed in getStaticProps. */
  ogImages: ArticleCards
  /** Frontmatter cover with its size, focal point and responsive variants (resolved on the server). */
  cover: CoverView | null
  /** Neighbours in /work display order (featured first). */
  prev: ArticleLink | null
  next: ArticleLink | null
  related: ArticleLink[]
  /** Posts whose `project` is this case study (D8). */
  writeups: ArticleLink[]
  /** End-of-article author card (public CV / home data). */
  author: AuthorCardData | null
  /** QR code of the page for WeChat (inline SVG). */
  shareQr: string | null
  /** Rendered in Draft Mode (the admin preview cookie): drafts are visible. */
  draftMode: boolean
}

const MONO = 'var(--font-geist-mono), monospace'

/** English UI text inside a non-English article keeps its own language. */
const uiLang = (lang: string) => (lang === 'en' || lang.startsWith('en-') ? undefined : 'en')

const workTag = (t: string) => tagHref('/work', t)

export default function WorkCase({
  slug,
  frontmatter,
  tree,
  readingMinutes,
  toc,
  lang,
  excerpt,
  updatedAt,
  ogImages,
  cover,
  prev,
  next,
  related,
  writeups,
  author,
  shareQr,
  draftMode,
}: Props) {
  const path = `/work/${slug}`
  const url = absUrl(path)
  const tech = Array.isArray(frontmatter.tech) ? frontmatter.tech : []
  const link = safeHref(frontmatter.link)
  const repo = safeHref(frontmatter.repo)
  const extraLinks = Array.isArray(frontmatter.links) ? frontmatter.links : []
  const image = ogImages.card
  const titleLang = labelLang(frontmatter.title) || 'en'
  const ui = uiLang(lang)
  const share: ShareData = { url, title: frontmatter.title, qrSvg: shareQr }

  const meta: MetaItem[] = [
    { label: 'Role', value: frontmatter.role || null },
    { label: 'Team', value: frontmatter.team || null },
    { label: 'Timeline', value: frontmatter.period ? <span className="tnum">{frontmatter.period}</span> : null },
    {
      label: 'Published',
      value: frontmatter.published ? (
        <time dateTime={frontmatter.published} className="tnum">
          {formatPostDate(frontmatter.published)}
        </time>
      ) : null,
    },
    { label: 'Stack', value: tech.length ? <MetaChips items={tech} label="Stack" hrefFor={workTag} /> : null, wide: true },
    {
      label: writeups.length === 1 ? 'Write-up' : 'Write-ups',
      value: writeups.length ? (
        <Flex as="ul" direction="column" gap={1} listStyleType="none" m={0} p={0}>
          {writeups.map((w) => (
            <Box as="li" key={w.slug}>
              <Link as={NextLink} href={w.permalink} color="accent.text" className="link-underline" lang={w.lang === 'en' ? undefined : w.lang}>
                {w.title}
              </Link>
            </Box>
          ))}
        </Flex>
      ) : null,
      wide: true,
    },
    { label: 'Read', value: <span className="tnum">{readingMinutes} min</span> },
  ]

  const external = (href: string, text: React.ReactNode, key?: string) => (
    <Link key={key} href={href} isExternal color="accent.text" className="link-underline" fontSize="14px">
      {text} <span className="nudge-ne" aria-hidden>↗</span>
    </Link>
  )
  const actions =
    link || repo || extraLinks.length ? (
      <>
        {link && external(link, 'Visit site')}
        {repo && external(repo, 'Source')}
        {extraLinks.map((l) =>
          l.url.startsWith('/') ? (
            <Link key={l.url} as={NextLink} href={l.url} color="accent.text" className="link-underline" fontSize="14px">
              {l.label}
            </Link>
          ) : (
            external(l.url, l.label, l.url)
          ),
        )}
      </>
    ) : undefined

  return (
    <>
      <CustomHead
        title={frontmatter.seoTitle || frontmatter.title}
        description={frontmatter.description || `${frontmatter.title} — a project case study by ${PERSON_NAME}.`}
        fallbackDescription={excerpt}
        url={url}
        image={image}
        imageAlt={`${frontmatter.title} — ${PERSON_NAME}`}
        type="article"
        lang={lang}
        noindex={draftMode}
        publishedTime={frontmatter.published || undefined}
        modifiedTime={updatedAt ? new Date(updatedAt).toISOString() : undefined}
        jsonLd={[
          caseStudyNode({
            path,
            title: frontmatter.title,
            description: frontmatter.description,
            abstract: frontmatter.summary,
            lang,
            images: articleImageUrls(ogImages, cover?.src),
            keywords: tech,
            datePublished: frontmatter.published,
            dateModified: updatedAt ? new Date(updatedAt).toISOString() : undefined,
            sameAs: [link, repo].filter(Boolean),
          }),
          breadcrumb([
            { name: 'Home', path: '/' },
            { name: 'Work', path: '/work' },
            { name: frontmatter.title, path },
          ]),
        ]}
      />
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
          <Flex align="center" justify="space-between" gap={4} minH="32px" mb={8} className="no-print">
            <Link as={NextLink} href="/work" fontFamily={MONO} fontSize="11px" color="page.fg-secondary" className="link-underline">
              ← All projects
            </Link>
            <EditPill kind="work" slug={slug} />
          </Flex>

          <Box as="article" lang={lang} data-vt-morph={path}>
            <PageHeader
              eyebrow={<span lang={ui}>Case study</span>}
              title={frontmatter.title}
              titleLang={titleLang !== lang ? titleLang : undefined}
              lede={frontmatter.description}
              actions={actions}
              morph
            />

            <AtAGlance summary={frontmatter.summary} outcomes={frontmatter.outcomes} labelLang={ui} />

            {cover && (
              <Box mb={10}>
                <CoverFrame cover={cover} title={frontmatter.title} sizes="(min-width: 1280px) 1200px, 100vw" eager morph radius="xl" />
              </Box>
            )}

            <Box mb={12} pb={6} borderBottom="1px solid" borderColor="page.border" lang={ui}>
              <MetaGrid items={meta} />
            </Box>

            <ArticleBody tree={tree} toc={toc} />

            <ArticleEnd author={author} share={share} lang={lang} />

            <ArticleNav
              before={prev ? { label: 'Previous', item: prev } : null}
              after={next ? { label: 'Next', item: next } : null}
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
  paths: listWorkInDisplayOrder().map((w) => ({ params: { slug: w.slug } })),
  fallback: 'blocking',
})

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const slug = String(ctx.params?.slug || '')
  const draftMode = ctx.draftMode === true
  const w = await getWork(slug, { includeDrafts: draftMode })
  if (!w) return { notFound: true, revalidate: 60 }

  const [{ resolveCover }, { loadAuthorCard }, { qrSvg }] = await Promise.all([
    import('../../lib/coverImage'),
    import('../../lib/authorCard'),
    import('../../lib/qr'),
  ])

  const work = listWorkInDisplayOrder().map((x) => toArticleLink('work', x))
  const posts = listPosts().map((p) => toArticleLink('blog', p))
  const self = toArticleLink('work', w)
  const { before, after } = neighbours(work, slug)
  const related = relatedArticles(self, [...work, ...posts])
  const writeups = projectLinks(self, posts)

  let shareQr: string | null = null
  try {
    shareQr = await qrSvg(absUrl(`/work/${w.slug}`))
  } catch {
    /* the share row keeps its other actions */
  }

  const cover = resolveCover(w.frontmatter.cover, w.frontmatter.coverAlt, w.frontmatter.coverFocus)
  const card: OgImageOptions = {
    kind: 'work',
    title: w.frontmatter.title,
    lang: ogLangOf(w.lang),
    mins: w.readingMinutes,
    tags: Array.isArray(w.frontmatter.tech) ? w.frontmatter.tech : [],
    cover: cover?.src,
    v: w.updatedAt,
  }

  return {
    props: {
      slug: w.slug,
      frontmatter: w.frontmatter,
      tree: w.tree,
      readingMinutes: w.readingMinutes,
      toc: w.toc,
      lang: w.lang,
      excerpt: w.excerpt,
      updatedAt: w.updatedAt,
      ogImages: { card: signedOgImageUrl(card), square: signedOgImageUrl({ ...card, size: 'square' }) },
      cover,
      prev: before,
      next: after,
      related,
      writeups,
      author: loadAuthorCard(),
      shareQr,
      draftMode,
      // Whether /publications exists, for the nav link (lib/publicationsData).
      ...(await import('../../lib/publicationsData')).chromePublicationsProp(),
    },
    revalidate: 60,
  }
}
