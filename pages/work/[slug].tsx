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
import { listPosts, listWorkInDisplayOrder, getWork, type HastRoot, type WorkFrontmatter } from '../../lib/mdx'
import { labelLang, type TocEntry } from '../../lib/toc'
import { safeHref } from '../../lib/cvFormat'
import { variantSrcSet } from '../../lib/uploadVariants'
import { articleImageUrls, breadcrumb, absUrl, caseStudyNode, ogLangOf, PERSON_NAME, type ArticleCards, type OgImageOptions } from '../../lib/schema'
import { signedOgImageUrl } from '../../lib/og/sign'

type Cover = { src: string; alt: string; srcSet: string | null }

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
  /** Frontmatter cover with its responsive variants (resolved on the server). */
  cover: Cover | null
  /** Neighbours in /work display order (featured first). */
  prev: ArticleLink | null
  next: ArticleLink | null
  related: ArticleLink[]
  /** Rendered in Draft Mode (the admin preview cookie): drafts are visible. */
  draftMode: boolean
}

const MONO = 'var(--font-geist-mono), monospace'

/** English UI text inside a non-English article keeps its own language. */
const uiLang = (lang: string) => (lang === 'en' || lang.startsWith('en-') ? undefined : 'en')

/** Cover sources an <img> may load: same-site paths or https URLs. */
function coverSrc(value: unknown): string {
  if (typeof value !== 'string') return ''
  const v = value.trim()
  return /^\/(?!\/)/.test(v) || /^https:\/\//i.test(v) ? v : ''
}

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
  draftMode,
}: Props) {
  const path = `/work/${slug}`
  const url = absUrl(path)
  const tech = Array.isArray(frontmatter.tech) ? frontmatter.tech : []
  const link = safeHref(frontmatter.link)
  const repo = safeHref(frontmatter.repo)
  const image = ogImages.card
  const titleLang = labelLang(frontmatter.title) || 'en'
  const ui = uiLang(lang)

  const meta: MetaItem[] = [
    { label: 'Role', value: frontmatter.role || null },
    { label: 'Timeline', value: frontmatter.period ? <span className="tnum">{frontmatter.period}</span> : null },
    { label: 'Stack', value: tech.length ? <MetaChips items={tech} label="Stack" /> : null, wide: true },
    { label: 'Read', value: <span className="tnum">{readingMinutes} min</span> },
  ]

  const actions =
    link || repo ? (
      <>
        {link && (
          <Link href={link} isExternal color="accent.text" className="link-underline" fontSize="14px">
            Visit site <span className="nudge-ne" aria-hidden>↗</span>
          </Link>
        )}
        {repo && (
          <Link href={repo} isExternal color="accent.text" className="link-underline" fontSize="14px">
            Source <span className="nudge-ne" aria-hidden>↗</span>
          </Link>
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
        modifiedTime={updatedAt ? new Date(updatedAt).toISOString() : undefined}
        jsonLd={[
          caseStudyNode({
            path,
            title: frontmatter.title,
            description: frontmatter.description,
            lang,
            images: articleImageUrls(ogImages, cover?.src),
            keywords: tech,
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
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[12, 16]} pb={draftMode ? 24 : undefined}>
          <Flex align="center" justify="space-between" gap={4} minH="32px" mb={8} className="no-print">
            <Link as={NextLink} href="/work" fontFamily={MONO} fontSize="11px" color="page.fg-secondary" className="link-underline">
              ← All projects
            </Link>
            <EditPill kind="work" slug={slug} />
          </Flex>

          <Box as="article" lang={lang}>
            <PageHeader
              eyebrow={<span lang={ui}>Case study</span>}
              title={frontmatter.title}
              titleLang={titleLang !== lang ? titleLang : undefined}
              lede={frontmatter.description}
              actions={actions}
              vtName={`vt-work-${slug}`}
            />

            {cover && (
              <Box
                mb={10}
                borderRadius="xl"
                overflow="hidden"
                border="1px solid"
                borderColor="page.border"
                bg="page.bg-elevated"
                sx={{ aspectRatio: '16 / 10' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cover.src}
                  srcSet={cover.srcSet || undefined}
                  sizes={cover.srcSet ? '(min-width: 1280px) 1200px, 100vw' : undefined}
                  alt={cover.alt}
                  width={1600}
                  height={1000}
                  decoding="async"
                  {...{ fetchpriority: 'high' }}
                  style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    viewTransitionName: `vt-work-cover-${slug}`,
                  } as React.CSSProperties}
                />
              </Box>
            )}

            <Box mb={12} pb={6} borderBottom="1px solid" borderColor="page.border" lang={ui}>
              <MetaGrid items={meta} />
            </Box>

            <ArticleBody tree={tree} toc={toc} />

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

  const work = listWorkInDisplayOrder().map((x) => toArticleLink('work', x))
  const posts = listPosts().map((p) => toArticleLink('blog', p))
  const { before, after } = neighbours(work, slug)
  const related = relatedByTags(toArticleLink('work', w), [...work, ...posts])

  const src = coverSrc(w.frontmatter.cover)
  let cover: Cover | null = null
  if (src) {
    const variants = src.startsWith('/uploads/') ? await (async () => variantSrcSet(src))().catch(() => null) : null
    cover = {
      src,
      alt: typeof w.frontmatter.coverAlt === 'string' ? w.frontmatter.coverAlt.trim() : '',
      srcSet: typeof variants === 'string' && variants.trim() ? variants.trim() : null,
    }
  }

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
      draftMode,
    },
    revalidate: 60,
  }
}
