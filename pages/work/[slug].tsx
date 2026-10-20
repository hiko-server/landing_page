import React from 'react'
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
import AtAGlance from '../../components/Article/AtAGlance'
import MetaGrid, { MetaChips, type MetaItem } from '../../components/Article/MetaGrid'
import DraftBar from '../../components/Article/DraftBar'
import EditPill from '../../components/Article/EditPill'
import LanguageSwitch from '../../components/Article/LanguageSwitch'
import CoverFrame, { type CoverView } from '../../components/Work/CoverFrame'
import { neighbours, projectLinks, relatedArticles, toArticleLink, type ArticleLink } from '../../components/Article/collectionNav'
import { listWorkInDisplayOrder, getWork, type HastRoot, type WorkFrontmatter } from '../../lib/mdx'
import { labelLang, langWithin, type TocEntry } from '../../lib/toc'
import { safeHref } from '../../lib/cvFormat'
import { formatPostDate } from '../../lib/postDate'
import { fillUi, uiLangAttr } from '../../lib/uiStrings'
import { articleUiFor, type ArticleUi } from '../../lib/uiStrings/article'
import { ArticleRoot } from '../../components/Article/articleUi'
import type { SwitchLink } from '../../lib/translations'
import { markdownTwinPath } from '../../lib/markdownTwinPaths'
import { reviewReadOptions, reviewRenderOf } from '../../lib/review/render'
import { tagHref } from '../../lib/tagFilter'
import type { AuthorCardData } from '../../lib/authorCard'
import { articleImageUrls, breadcrumb, absUrl, cardImageAlt, caseStudyNode, ogLangOf, PERSON_NAME, type Alternate, type ArticleCards, type OgImageOptions } from '../../lib/schema'
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
  /** The case study in other languages (F2): the language switch. */
  translations: SwitchLink[]
  /** The interface words in the case study's language (F1, lib/uiStrings/article). */
  ui: ArticleUi
  /** hreflang alternates of the case study and its translations (empty without translations). */
  alternates: Alternate[]
  /** Draft Mode is showing the case study's unpublished changes, not its live version (H4). */
  pendingPreview: boolean
  /** Rendered for a review link (H5, pages/review/[token]): kept out of search indexes. */
  review?: boolean
}

const MONO = 'var(--font-geist-mono), monospace'

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
  translations,
  alternates,
  ui: articleUi,
  pendingPreview,
  review = false,
}: Props) {
  const path = `/work/${slug}`
  const url = absUrl(path)
  const tech = Array.isArray(frontmatter.tech) ? frontmatter.tech : []
  const link = safeHref(frontmatter.link)
  const repo = safeHref(frontmatter.repo)
  const extraLinks = Array.isArray(frontmatter.links) ? frontmatter.links : []
  const image = ogImages.card
  const titleLang = labelLang(frontmatter.title) || 'en'
  // Interface words in the case study's language (lib/uiStrings): 角色 / 技术栈 on a Chinese one.
  const { t, lang: uiLang } = articleUi
  const ui = uiLangAttr(lang)
  // The owner's short values keep their own language (an English role on a Chinese page is marked "en").
  const own = (text: string | undefined) => (text ? <span lang={langWithin(text, lang)}>{text}</span> : null)
  const share: ShareData = { url, title: frontmatter.title, qrSvg: shareQr }

  const meta: MetaItem[] = [
    { label: t.role, value: own(frontmatter.role) },
    { label: t.team, value: own(frontmatter.team) },
    { label: t.timeline, value: frontmatter.period ? <span className="tnum">{frontmatter.period}</span> : null },
    {
      label: t.published,
      value: frontmatter.published ? (
        <time dateTime={frontmatter.published} className="tnum">
          {formatPostDate(frontmatter.published, uiLang)}
        </time>
      ) : null,
    },
    { label: t.stack, value: tech.length ? <MetaChips items={tech} label={t.stack} hrefFor={workTag} pageLang={lang} /> : null, wide: true },
    {
      label: writeups.length === 1 ? t.writeup : t.writeups,
      value: writeups.length ? (
        <Flex as="ul" direction="column" gap={1} listStyleType="none" m={0} p={0}>
          {writeups.map((w) => (
            <Box as="li" key={w.slug}>
              <Link as={NextLink} href={w.permalink} color="accent.text" className="link-underline" lang={w.lang === lang ? undefined : w.lang}>
                {w.title}
              </Link>
            </Box>
          ))}
        </Flex>
      ) : null,
      wide: true,
    },
    { label: t.read, value: <span className="tnum">{fillUi(t.minutes, { n: readingMinutes })}</span> },
  ]

  const external = (href: string, text: React.ReactNode, key?: string) => (
    <Link key={key} href={href} isExternal color="accent.text" className="link-underline" fontSize="14px">
      {text} <span className="nudge-ne" aria-hidden>↗</span>
    </Link>
  )
  const actions =
    link || repo || extraLinks.length ? (
      <>
        {link && external(link, t.visitSite)}
        {repo && external(repo, t.source)}
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
        imageAlt={cardImageAlt(frontmatter.title, cover?.src, frontmatter.coverAlt)}
        type="article"
        lang={lang}
        noindex={draftMode || review}
        alternates={alternates}
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
      {/* The Markdown twin of the case study (G9: /work/<slug>.md, for language models and agents). */}
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
            <Link as={NextLink} href="/work" fontFamily={MONO} fontSize="11px" color="page.fg-secondary" className="link-underline" lang={ui}>
              {t.allProjects}
            </Link>
            <Flex align="center" gap={2} wrap="wrap" justify="flex-end">
              <LanguageSwitch translations={translations} label={t.otherLanguages} />
              <EditPill kind="work" slug={slug} />
            </Flex>
          </Flex>

          <ArticleRoot ui={articleUi} lang={lang} morphId={path}>
            <PageHeader
              eyebrow={<span lang={ui}>{t.caseStudy}</span>}
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

            <ArticleEnd author={author} share={share} />

            <ArticleNav
              before={prev ? { label: t.previous, item: prev } : null}
              after={next ? { label: t.next, item: next } : null}
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
  paths: listWorkInDisplayOrder().map((w) => ({ params: { slug: w.slug } })),
  fallback: 'blocking',
})

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const slug = String(ctx.params?.slug || '')
  // A review link (H5) renders this one draft or these unpublished changes, and nothing else unpublished.
  const review = reviewRenderOf(ctx)
  const draftMode = ctx.draftMode === true && !review
  // Draft Mode shows drafts, and a live case study's unpublished changes (H4).
  const w = await getWork(slug, review ? reviewReadOptions(review) : { includeDrafts: draftMode, pending: draftMode })
  if (!w && review) return { notFound: true }
  // No item: a renamed case study's old address redirects permanently (308) to the new one (H6), else 404.
  if (!w) return (await import('../../lib/redirects')).missingItemProps('work', slug, draftMode)

  const [{ resolveCover }, { loadAuthorCard }, { qrSvg }, { articleSiblings }] = await Promise.all([
    import('../../lib/coverImage'),
    import('../../lib/authorCard'),
    import('../../lib/qr'),
    import('../../lib/articleSiblings'),
  ])

  // One link per piece, in this case study's language (F2); its own translations for the switch.
  const { posts, work, translations, alternates } = articleSiblings('work', w, { draftMode })
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
    coverFocus: w.frontmatter.coverFocus,
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
      translations,
      alternates,
      ui: articleUiFor(w.lang),
      pendingPreview: draftMode && !!(await import('../../lib/pendingRevisions')).getPendingRevision('work', w.slug),
      ...(review ? { review: true } : {}),
      // Whether /publications exists, for the nav link (lib/publicationsData).
      ...(await import('../../lib/publicationsData')).chromePublicationsProp(),
    },
    revalidate: 60,
  }
}
