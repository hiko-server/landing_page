import React from 'react'
import type { GetStaticProps } from 'next'
import NextLink from 'next/link'
import { Box, Flex, Heading, Link, Text } from '@chakra-ui/react'
import HeaderFooter from '../layout/HeaderFooter'
import CustomHead from '../components/General-UI/CustomHead'
import PageHeader from '../components/General-UI/PageHeader'
import MDXContent from '../components/MDX/MDXContent'
import { getStaticMdxPage, type MDXRendered, type PageFrontmatter } from '../lib/mdx'
import { getPage } from '../lib/contentStore'
import { readStack, type StackGroup } from '../lib/stack'
import { absUrl, ogImageUrl, personAuthor } from '../lib/schema'

/**
 * /uses — tools & setup.
 *
 * The owner's own write-up (admin → pages → uses) comes first when it has
 * content, followed by "Colophon: how this site is built" — the curated stack
 * from this site's package.json (lib/stack.ts, the same data as /api/stack).
 * While the write-up is empty the page is honestly titled "How this site is
 * built" and shows only that stack. ISR (60 s).
 */

type Props = {
  tree: MDXRendered<PageFrontmatter>['tree'] | null
  updated: string | null
  stack: StackGroup[]
}

const mono = 'var(--font-geist-mono), monospace'
const BUILT_DESCRIPTION = 'The stack, hosting and tooling behind lucian-dev.com.'

export default function UsesPage({ tree, updated, stack }: Props) {
  const written = !!tree
  const title = written ? 'Tools & setup.' : 'How this site is built'
  const description = written
    ? 'The tools, hardware, and software Li Yanpei (Lucian) relies on for engineering work, and how this site is built.'
    : BUILT_DESCRIPTION

  const colophonLink = (
    <Text fontSize={['15px', '16px']} color="page.fg-secondary" mt={[8, 10]}>
      Hosting, fonts, privacy and the changelog are on the{' '}
      <Link
        as={NextLink}
        href="/colophon"
        color="accent.text"
        textDecoration="underline"
        textUnderlineOffset="3px"
      >
        colophon
      </Link>
      .
    </Text>
  )

  return (
    <>
      <CustomHead
        title={written ? 'Uses' : 'How this site is built'}
        description={description}
        url={absUrl('/uses')}
        image={ogImageUrl({
          kind: 'page',
          title: written ? 'Uses' : 'How this site is built',
          subtitle: written ? 'Tools & setup' : BUILT_DESCRIPTION,
        })}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: written ? 'Uses' : 'How this site is built',
          url: absUrl('/uses'),
          dateModified: (written && updated) || undefined,
          author: personAuthor,
        }}
      />
      <HeaderFooter>
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[12, 16]}>
          <PageHeader
            eyebrow="Uses"
            title={title}
            lede={written ? undefined : BUILT_DESCRIPTION}
            actions={
              written && updated ? (
                <Text
                  fontFamily={mono}
                  fontSize="12px"
                  color="page.fg-secondary"
                  className="tnum"
                  m={0}
                >
                  Last updated · <time dateTime={updated}>{updated}</time>
                </Text>
              ) : null
            }
          />

          {tree ? <MDXContent tree={tree} /> : null}

          {stack.length ? (
            <Box
              as={written ? 'section' : 'div'}
              aria-labelledby={written ? 'uses-stack' : undefined}
              mt={written ? [16, 20] : 0}
            >
              {written ? (
                <Heading
                  as="h2"
                  id="uses-stack"
                  fontSize={['24px', '28px']}
                  fontWeight={500}
                  letterSpacing="-0.02em"
                  lineHeight="1.2"
                  mb={3}
                >
                  Colophon: how this site is built
                </Heading>
              ) : null}
              <Text
                fontSize={['15px', '16px']}
                lineHeight="1.65"
                color="page.fg-secondary"
                maxW="62ch"
                mb={[8, 10]}
              >
                Read from this site&rsquo;s own package.json and deployment when the page is
                generated, so the versions below are the ones serving this page.
              </Text>
              <StackList groups={stack} />
              {colophonLink}
            </Box>
          ) : !written ? (
            <Text fontSize={['15px', '16px']} color="page.fg-secondary">
              The stack could not be read for this build. The{' '}
              <Link
                as={NextLink}
                href="/colophon"
                color="accent.text"
                textDecoration="underline"
                textUnderlineOffset="3px"
              >
                colophon
              </Link>{' '}
              describes how the site is built and hosted.
            </Text>
          ) : null}
        </Box>
      </HeaderFooter>
    </>
  )
}

function StackList({ groups }: { groups: StackGroup[] }) {
  return (
    <Box as="dl" borderBottom="1px solid" borderColor="page.border">
      {groups.map((g) => (
        <Box
          key={g.label}
          display="grid"
          gridTemplateColumns={{ base: 'minmax(0,1fr)', md: '220px minmax(0,1fr)' }}
          columnGap={8}
          rowGap={3}
          py={[5, 6]}
          borderTop="1px solid"
          borderColor="page.border"
        >
          <Box as="dt">
            <Text
              fontFamily={mono}
              fontSize="11px"
              letterSpacing="0.14em"
              textTransform="uppercase"
              color="page.fg"
            >
              {g.label}
            </Text>
            {g.hint ? (
              <Text fontSize="14px" color="page.fg-secondary" mt={1} lineHeight="1.5">
                {g.hint}
              </Text>
            ) : null}
          </Box>
          <Box as="dd" m={0} minW={0}>
            <Flex as="ul" listStyleType="none" m={0} p={0} wrap="wrap" gap={2}>
              {g.items.map((item) => (
                <Flex
                  as="li"
                  key={item.name}
                  align="baseline"
                  gap={2}
                  px={3}
                  py={1.5}
                  border="1px solid"
                  borderColor="page.border-strong"
                  borderRadius="8px"
                  bg="page.bg-elevated"
                  fontSize="15px"
                  lineHeight="1.3"
                >
                  <Text as="span" color="page.fg" fontWeight={500}>
                    {item.name}
                  </Text>
                  {item.version ? (
                    <Text as="span" fontFamily={mono} fontSize="11px" color="page.fg-secondary">
                      <Box as="span" srOnly>
                        version{' '}
                      </Box>
                      {item.version}
                    </Text>
                  ) : null}
                </Flex>
              ))}
            </Flex>
          </Box>
        </Box>
      ))}
    </Box>
  )
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  let tree: Props['tree'] = null
  let updated: string | null = null
  try {
    if ((getPage('uses')?.body || '').trim()) {
      const page = await getStaticMdxPage('uses')
      tree = page?.tree ?? null
      const raw = page?.frontmatter.updated as unknown
      updated =
        raw instanceof Date ? raw.toISOString().slice(0, 10) : raw ? String(raw).slice(0, 10) : null
    }
  } catch {
    tree = null
  }
  return {
    props: {
      tree,
      updated,
      stack: readStack().groups,
    },
    revalidate: 60,
  }
}
