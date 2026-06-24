import React from 'react'
import type { GetStaticPaths, GetStaticProps } from 'next'
import {
  Box,
  Heading,
  Text,
  Flex,
  Tag,
  Link,
  useColorModeValue,
} from '@chakra-ui/react'
import NextLink from 'next/link'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import SectionLabel from '../../components/General-UI/SectionLabel'
import MDXContent from '../../components/MDX/MDXContent'
import { listPosts, getPost, type PostFrontmatter } from '../../lib/mdx'
import { absUrl, breadcrumb, personRef, PERSON_NAME } from '../../lib/schema'
import type { MDXRemoteSerializeResult } from 'next-mdx-remote'

type Props = {
  slug: string
  frontmatter: PostFrontmatter
  source: MDXRemoteSerializeResult
  readingMinutes: number
  host: string
}

export default function BlogPost({
  slug,
  frontmatter,
  source,
  readingMinutes,
  host,
}: Props) {
  const muted = useColorModeValue('gray.600', 'gray.500')
  const monoFont = 'var(--font-geist-mono), monospace'

  return (
    <>
      <CustomHead
        title={frontmatter.title}
        description={frontmatter.description || `${frontmatter.title} — an essay by ${PERSON_NAME}.`}
        url={absUrl(`/blog/${slug}`)}
        image={absUrl(`/api/og?kind=blog&title=${encodeURIComponent(frontmatter.title)}${frontmatter.description ? `&subtitle=${encodeURIComponent(frontmatter.description)}` : ''}`)}
        type="article"
        publishedTime={frontmatter.date ? String(frontmatter.date).slice(0, 10) : undefined}
        modifiedTime={String(frontmatter.updated || frontmatter.date || '').slice(0, 10) || undefined}
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: frontmatter.title,
            description: frontmatter.description || undefined,
            image: absUrl(`/api/og?kind=blog&title=${encodeURIComponent(frontmatter.title)}`),
            datePublished: frontmatter.date,
            dateModified: frontmatter.updated || frontmatter.date,
            author: personRef,
            publisher: personRef,
            mainEntityOfPage: absUrl(`/blog/${slug}`),
            url: absUrl(`/blog/${slug}`),
          },
          breadcrumb([
            { name: 'Home', path: '/' },
            { name: 'Writing', path: '/blog' },
            { name: frontmatter.title, path: `/blog/${slug}` },
          ]),
        ]}
      />
      <HeaderFooter isMobile={false}>
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[12, 16]}>
          {/* Back link */}
          <Link
            as={NextLink}
            href="/blog"
            fontFamily={monoFont}
            fontSize="11px"
            color={muted}
            className="link-underline"
            display="inline-block"
            mb={8}
          >
            ← All posts
          </Link>

          <SectionLabel n="01">Article</SectionLabel>

          <Heading
            as="h1"
            mt={6}
            mb={4}
            fontSize={['32px', '44px', '52px']}
            lineHeight="1.08"
            letterSpacing="-0.025em"
            fontWeight={500}
            maxW="900px"
          >
            {frontmatter.title}
          </Heading>

          {frontmatter.description && (
            <Text color={muted} fontSize={['16px', '17px']} maxW="720px" mb={6}>
              {frontmatter.description}
            </Text>
          )}

          <Flex
            wrap="wrap"
            gap={4}
            fontFamily={monoFont}
            fontSize="11px"
            color={muted}
            mb={12}
            pb={6}
            borderBottom="1px solid"
            borderColor="page.border"
          >
            <Text as="span">{frontmatter.date}</Text>
            <Text as="span" opacity={0.5}>·</Text>
            <Text as="span">{readingMinutes} min read</Text>
            {frontmatter.tags && frontmatter.tags.length > 0 && (
              <>
                <Text as="span" opacity={0.5}>·</Text>
                <Flex gap={2} wrap="wrap">
                  {frontmatter.tags.map((t) => (
                    <Tag
                      key={t}
                      size="sm"
                      variant="outline"
                      fontSize="10px"
                      fontFamily={monoFont}
                    >
                      {t}
                    </Tag>
                  ))}
                </Flex>
              </>
            )}
          </Flex>

          <MDXContent source={source} />
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
  return {
    props: {
      slug: post.slug,
      frontmatter: post.frontmatter,
      source: post.source,
      readingMinutes: post.readingMinutes,
      host: process.env.NEXT_PUBLIC_SITE_HOST || 'lucian-dev.com',
    },
    revalidate: 60,
  }
}
