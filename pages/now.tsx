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

export default function NowPage({ source, updated, host }: Props) {
  const muted = useColorModeValue('gray.500', 'gray.500')

  return (
    <>
      <CustomHead
        title="Now"
        description="What I'm focused on right now — Li Yanpei (Hiko)."
        url={`https://${host}/now`}
      />
      <HeaderFooter isMobile={false}>
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[12, 16]}>
          <SectionLabel n="01">Now</SectionLabel>

          <Heading
            as="h1"
            mt={6}
            mb={3}
            fontSize={['32px', '44px', '52px']}
            lineHeight="1.08"
            letterSpacing="-0.025em"
            fontWeight={500}
          >
            What I&rsquo;m focused on.
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
  const page = await getStaticMdxPage('now')
  return {
    props: {
      source: page?.source ?? null,
      updated: page?.frontmatter.updated ? String(page.frontmatter.updated).slice(0, 10) : null,
      host: process.env.NEXT_PUBLIC_SITE_HOST || 'hiko.dev',
    },
    revalidate: 60,
  }
}
