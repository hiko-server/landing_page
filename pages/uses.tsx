import React from 'react'
import type { GetStaticProps } from 'next'
import {
  Box,
  Heading,
  Text,
  useColorModeValue,
} from '@chakra-ui/react'
import HeaderFooter from '../layout/HeaderFooter'
import CustomHead from '../components/General-UI/CustomHead'
import SectionLabel from '../components/General-UI/SectionLabel'
import MDXContent from '../components/MDX/MDXContent'
import { getStaticMdxPage } from '../lib/mdx'
import type { MDXRemoteSerializeResult } from 'next-mdx-remote'

type Props = {
  source: MDXRemoteSerializeResult | null
  updated: string | null
  host: string
}

export default function UsesPage({ source, updated, host }: Props) {
  const muted = useColorModeValue('gray.600', 'gray.500')

  return (
    <>
      <CustomHead
        title="Uses"
        description="Tools, hardware, and software I rely on daily — Li Yanpei (Hiko)."
        url={`https://${host}/uses`}
        image={`https://${host}/api/og?title=Uses&kind=page&subtitle=Tools%20%26%20setup`}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'Uses',
          url: `https://${host}/uses`,
          dateModified: updated || undefined,
          author: { '@type': 'Person', name: 'Li Yanpei' },
        }}
      />
      <HeaderFooter isMobile={false}>
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[12, 16]}>
          <SectionLabel n="02">Uses</SectionLabel>

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
          {updated && (
            <Text fontFamily="var(--font-geist-mono), monospace" fontSize="11px" color={muted} mb={12}>
              Last updated · {updated}
            </Text>
          )}

          {source && <MDXContent source={source} />}
        </Box>
      </HeaderFooter>
    </>
  )
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  const page = await getStaticMdxPage('uses')
  const raw = page?.frontmatter.updated as unknown
  const updated =
    raw instanceof Date
      ? raw.toISOString().slice(0, 10)
      : raw
        ? String(raw).slice(0, 10)
        : null
  return {
    props: {
      source: page?.source ?? null,
      updated,
      host: process.env.NEXT_PUBLIC_SITE_HOST || 'hiko.dev',
    },
    revalidate: 60,
  }
}
