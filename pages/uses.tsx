import React from 'react'
import type { GetStaticProps } from 'next'
import { Box, Flex, Heading, Text } from '@chakra-ui/react'
import HeaderFooter from '../layout/HeaderFooter'
import CustomHead from '../components/General-UI/CustomHead'
import SectionLabel from '../components/General-UI/SectionLabel'
import MDXContent from '../components/MDX/MDXContent'
import { getStaticMdxPage } from '../lib/mdx'
import { getPage } from '../lib/contentStore'
import { readStack, type StackGroup } from '../lib/stack'
import type { MDXRemoteSerializeResult } from 'next-mdx-remote'

/**
 * /uses — tools & setup.
 *
 * The owner's own write-up (admin → pages → uses) comes first when it has
 * content. Below it — or on its own when the body is empty — the curated
 * stack this site is built with (lib/stack.ts, the same data as /api/stack),
 * honestly labelled as derived from the site's package.json. ISR (60 s).
 */

type Props = {
  source: MDXRemoteSerializeResult | null
  updated: string | null
  stack: StackGroup[]
  host: string
}

const mono = 'var(--font-geist-mono), monospace'

export default function UsesPage({ source, updated, stack, host }: Props) {
  return (
    <>
      <CustomHead
        title="Uses"
        description="The tools, hardware, and software Li Yanpei (Lucian) relies on daily for engineering work."
        url={`https://${host}/uses`}
        image={`https://${host}/api/og?title=Uses&kind=page&subtitle=Tools%20%26%20setup`}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'Uses',
          url: `https://${host}/uses`,
          dateModified: (source && updated) || undefined,
          author: { '@type': 'Person', name: 'Li Yanpei' },
        }}
      />
      <HeaderFooter>
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[12, 16]}>
          <SectionLabel n="01" as="p">
            Uses
          </SectionLabel>

          <Heading
            as="h1"
            mt={6}
            mb={3}
            fontSize={['32px', '44px', '52px']}
            lineHeight="1.08"
            letterSpacing="-0.025em"
            fontWeight={500}
          >
            Tools &amp; setup.
          </Heading>

          {source ? (
            <>
              {updated && (
                <Text fontFamily={mono} fontSize="11px" color="page.fg-secondary" mb={12}>
                  Last updated · <time dateTime={updated}>{updated}</time>
                </Text>
              )}
              <MDXContent source={source} />
            </>
          ) : null}

          {stack.length ? (
            <Box as="section" aria-labelledby="uses-stack" mt={source ? [16, 20] : [8, 10]}>
              <SectionLabel n="02" id="uses-stack" mb={5}>
                What this site is built with
              </SectionLabel>
              <Text fontSize={['15px', '16px']} lineHeight="1.65" color="page.fg-secondary" maxW="62ch" mb={[8, 10]}>
                Read from this site&rsquo;s own package.json and deployment when the page is generated, so the versions
                below are the ones serving this page.
              </Text>
              <StackList groups={stack} />
            </Box>
          ) : !source ? (
            <Text fontSize={['15px', '16px']} color="page.fg-secondary" mt={8}>
              Nothing has been written here yet.
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
            <Text fontFamily={mono} fontSize="11px" letterSpacing="0.14em" textTransform="uppercase" color="page.fg">
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
  let source: MDXRemoteSerializeResult | null = null
  let updated: string | null = null
  try {
    if ((getPage('uses')?.body || '').trim()) {
      const page = await getStaticMdxPage('uses')
      source = page?.source ?? null
      const raw = page?.frontmatter.updated as unknown
      updated = raw instanceof Date ? raw.toISOString().slice(0, 10) : raw ? String(raw).slice(0, 10) : null
    }
  } catch {
    source = null
  }
  return {
    props: {
      source,
      updated,
      stack: readStack().groups,
      host: process.env.NEXT_PUBLIC_SITE_HOST || 'lucian-dev.com',
    },
    revalidate: 60,
  }
}
