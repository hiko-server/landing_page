import React from 'react'
import type { GetStaticPaths, GetStaticProps } from 'next'
import { Box, Heading, Text, Flex, Link } from '@chakra-ui/react'
import NextLink from 'next/link'
import type { MDXRemoteSerializeResult } from 'next-mdx-remote'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import SectionLabel from '../../components/General-UI/SectionLabel'
import ArticleBody from '../../components/Article/ArticleBody'
import ArticleNav from '../../components/Article/ArticleNav'
import { neighbours, relatedByTags, toArticleLink, type ArticleLink } from '../../components/Article/collectionNav'
import { listPosts, listWorkInDisplayOrder, getWork, type WorkFrontmatter } from '../../lib/mdx'
import type { TocEntry } from '../../lib/toc'
import { safeHref } from '../../lib/cvFormat'
import { absUrl, breadcrumb, ogImageUrl, personRef, PERSON_NAME } from '../../lib/schema'

type Props = {
  slug: string
  frontmatter: WorkFrontmatter
  source: MDXRemoteSerializeResult
  readingMinutes: number
  toc: TocEntry[]
  /** Contract E: BCP-47 language for <html lang>. */
  lang: string
  /** Neighbours in /work display order (featured first). */
  prev: ArticleLink | null
  next: ArticleLink | null
  related: ArticleLink[]
}

const MONO = 'var(--font-geist-mono), monospace'

function Sep() {
  return (
    <Text as="span" aria-hidden opacity={0.5}>
      ·
    </Text>
  )
}

export default function WorkCase({ slug, frontmatter, source, readingMinutes, toc, lang, prev, next, related }: Props) {
  const url = absUrl(`/work/${slug}`)
  const image = ogImageUrl({ kind: 'work', title: frontmatter.title, subtitle: frontmatter.description })
  const tech = Array.isArray(frontmatter.tech) ? frontmatter.tech : []
  const link = safeHref(frontmatter.link)
  const repo = safeHref(frontmatter.repo)

  return (
    <>
      <CustomHead
        title={frontmatter.title}
        description={frontmatter.description || `${frontmatter.title} — a project case study by ${PERSON_NAME}.`}
        url={url}
        image={image}
        type="article"
        lang={lang}
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'CreativeWork',
            name: frontmatter.title,
            url,
            mainEntityOfPage: url,
            image,
            inLanguage: lang,
            description: frontmatter.description || undefined,
            author: personRef,
            ...(tech.length ? { keywords: tech.join(', ') } : {}),
            ...(link || repo ? { sameAs: [link, repo].filter(Boolean) } : {}),
          },
          breadcrumb([
            { name: 'Home', path: '/' },
            { name: 'Work', path: '/work' },
            { name: frontmatter.title, path: `/work/${slug}` },
          ]),
        ]}
      />
      <HeaderFooter>
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[12, 16]}>
          <Link
            as={NextLink}
            href="/work"
            fontFamily={MONO}
            fontSize="11px"
            color="page.fg-secondary"
            className="link-underline no-print"
            display="inline-block"
            mb={8}
          >
            ← All projects
          </Link>

          <Box as="article" lang={lang}>
            <Box as="header">
              <SectionLabel n="02" as="p">
                Case Study
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
                style={{ viewTransitionName: `vt-work-${slug}` }}
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
                fontFamily={MONO}
                fontSize="11px"
                color="page.fg-secondary"
                mb={12}
                pb={6}
                borderBottom="1px solid"
                borderColor="page.border"
              >
                {frontmatter.role && (
                  <>
                    <Text as="span">{frontmatter.role}</Text>
                    <Sep />
                  </>
                )}
                {frontmatter.period && (
                  <>
                    <Text as="span">{frontmatter.period}</Text>
                    <Sep />
                  </>
                )}
                {tech.length > 0 && (
                  <>
                    <Text as="span">{tech.join(' · ')}</Text>
                    <Sep />
                  </>
                )}
                <Text as="span">{readingMinutes} min read</Text>
                {link && (
                  <>
                    <Sep />
                    <Link href={link} isExternal color="accent.text" className="link-underline">
                      Visit site ↗
                    </Link>
                  </>
                )}
                {repo && (
                  <>
                    <Sep />
                    <Link href={repo} isExternal color="accent.text" className="link-underline">
                      Source ↗
                    </Link>
                  </>
                )}
              </Flex>
            </Box>

            <ArticleBody source={source} toc={toc} />

            <ArticleNav
              before={prev ? { label: 'Previous', item: prev } : null}
              after={next ? { label: 'Next', item: next } : null}
              related={related}
            />
          </Box>
        </Box>
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
  const w = await getWork(slug)
  if (!w) return { notFound: true, revalidate: 60 }

  const work = listWorkInDisplayOrder().map((x) => toArticleLink('work', x))
  const posts = listPosts().map((p) => toArticleLink('blog', p))
  const { before, after } = neighbours(work, slug)
  const related = relatedByTags(toArticleLink('work', w), [...work, ...posts])

  return {
    props: {
      slug: w.slug,
      frontmatter: w.frontmatter,
      source: w.source,
      readingMinutes: w.readingMinutes,
      toc: w.toc,
      lang: w.lang,
      prev: before,
      next: after,
      related,
    },
    revalidate: 60,
  }
}
