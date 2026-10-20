import NextLink from 'next/link'
import Head from 'next/head'
import { Box, Link, Text } from '@chakra-ui/react'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../General-UI/CustomHead'
import PageHeader from '../General-UI/PageHeader'

/**
 * The page a review link (H5) answers when it no longer shows anything —
 * expired, turned off, unknown, or its draft is gone — in the reader's
 * language. It says what happened and what to do, and nothing about the
 * draft it once showed (not even its title).
 */
export default function ReviewUnavailable({ eyebrow, title, body, home, lang }: { eyebrow: string; title: string; body: string; home: string; lang: string }) {
  return (
    <>
      <CustomHead title={title} description={body} noindex />
      <Head>
        <meta name="robots" content="noindex, nofollow, noarchive" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <HeaderFooter>
        <Box
          lang={lang}
          maxW="var(--container-content)"
          mx="auto"
          px={[4, 6, 8]}
          py={[12, 16]}
          sx={{
            minHeight: 'calc(100vh - var(--header-h))',
            '@supports (height: 100svh)': { minHeight: 'calc(100svh - var(--header-h))' },
          }}
        >
          <PageHeader eyebrow={eyebrow} title={title} lede={body} />
          <Text>
            <Link as={NextLink} href="/" color="accent.text" className="link-underline">
              {home}
            </Link>
          </Text>
        </Box>
      </HeaderFooter>
    </>
  )
}
