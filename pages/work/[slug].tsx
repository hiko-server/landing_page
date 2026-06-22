import React from 'react'
import type { GetStaticPaths, GetStaticProps } from 'next'
import {
  Box,
  Heading,
  Text,
  Flex,
  Link,
  useColorModeValue,
} from '@chakra-ui/react'
import NextLink from 'next/link'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import SectionLabel from '../../components/General-UI/SectionLabel'
import MDXContent from '../../components/MDX/MDXContent'
import { listWork, getWork, type WorkFrontmatter } from '../../lib/mdx'
import type { MDXRemoteSerializeResult } from 'next-mdx-remote'

type Props = {
  slug: string
  frontmatter: WorkFrontmatter
  source: MDXRemoteSerializeResult
  readingMinutes: number
  host: string
}

export default function WorkCase({ slug, frontmatter, source, readingMinutes, host }: Props) {
  const muted = useColorModeValue('gray.600', 'gray.500')
  const monoFont = 'var(--font-geist-mono), monospace'

  return (
    <>
      <CustomHead
        title={frontmatter.title}
        description={frontmatter.description || 'Project case study by Li Yanpei'}
        url={`https://${host}/work/${slug}`}
        image={`https://${host}/api/og?kind=work&title=${encodeURIComponent(frontmatter.title)}${frontmatter.description ? `&subtitle=${encodeURIComponent(frontmatter.description)}` : ''}`}
        type="article"
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'CreativeWork',
            name: frontmatter.title,
            url: `https://${host}/work/${slug}`,
            author: { '@type': 'Person', name: 'Li Yanpei' },
            description: frontmatter.description,
          },
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${host}/` },
              { '@type': 'ListItem', position: 2, name: 'Work', item: `https://${host}/work` },
              { '@type': 'ListItem', position: 3, name: frontmatter.title, item: `https://${host}/work/${slug}` },
            ],
          },
        ]}
      />
      <HeaderFooter isMobile={false}>
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[12, 16]}>
          <Link
            as={NextLink}
            href="/work"
            fontFamily={monoFont}
            fontSize="11px"
            color={muted}
            className="link-underline"
            display="inline-block"
            mb={8}
          >
            ← All projects
          </Link>

          <SectionLabel n="02">Case Study</SectionLabel>

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
            {frontmatter.role && <Text as="span">{frontmatter.role}</Text>}
            {frontmatter.period && (
              <>
                <Text as="span" opacity={0.5}>·</Text>
                <Text as="span">{frontmatter.period}</Text>
              </>
            )}
            {frontmatter.tech && frontmatter.tech.length > 0 && (
              <>
                <Text as="span" opacity={0.5}>·</Text>
                <Text as="span">{frontmatter.tech.join(' · ')}</Text>
              </>
            )}
            <Text as="span" opacity={0.5}>·</Text>
            <Text as="span">{readingMinutes} min read</Text>
            {frontmatter.link && (
              <>
                <Text as="span" opacity={0.5}>·</Text>
                <Link href={frontmatter.link} isExternal color="var(--accent)" className="link-underline">
                  Visit site ↗
                </Link>
              </>
            )}
            {frontmatter.repo && (
              <>
                <Text as="span" opacity={0.5}>·</Text>
                <Link href={frontmatter.repo} isExternal color="var(--accent)" className="link-underline">
                  Source ↗
                </Link>
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
  paths: listWork().map((w) => ({ params: { slug: w.slug } })),
  fallback: 'blocking',
})

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const slug = String(ctx.params?.slug || '')
  const w = await getWork(slug)
  if (!w) return { notFound: true, revalidate: 60 }
  return {
    props: {
      slug: w.slug,
      frontmatter: w.frontmatter,
      source: w.source,
      readingMinutes: w.readingMinutes,
      host: process.env.NEXT_PUBLIC_SITE_HOST || 'lucian-dev.com',
    },
    revalidate: 60,
  }
}
