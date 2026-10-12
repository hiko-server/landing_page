import React from 'react'
import { Box, Grid } from '@chakra-ui/react'
import type { MDXRemoteSerializeResult } from 'next-mdx-remote'
import MDXContent from '../MDX/MDXContent'
import type { TocEntry } from '../../lib/toc'
import { TocDisclosure, TocRail } from './TableOfContents'
import ArticleProgress from './ArticleProgress'
import { useActiveHeading } from './useActiveHeading'

/** A table of contents is only worth showing for two or more sections. */
const MIN_TOC_ENTRIES = 2

/**
 * Article body with its table of contents: a sticky right rail with reading
 * progress on xl screens, a collapsible block above the text below xl.
 * Both share one active-section tracker.
 */
export default function ArticleBody({ source, toc }: { source: MDXRemoteSerializeResult; toc: TocEntry[] }) {
  const showToc = toc.length >= MIN_TOC_ENTRIES
  const activeId = useActiveHeading(showToc ? toc.map((t) => t.id) : [])

  return (
    <Grid
      templateColumns={showToc ? { base: 'minmax(0, 1fr)', xl: 'minmax(0, 1fr) 220px' } : 'minmax(0, 1fr)'}
      columnGap={16}
      alignItems="start"
    >
      <Box minW={0}>
        {showToc && (
          <Box display={{ base: 'block', xl: 'none' }} maxW="var(--container-prose)" mx="auto" className="no-print">
            <TocDisclosure toc={toc} activeId={activeId} />
          </Box>
        )}
        <Box id="article-body">
          <MDXContent source={source} as="div" />
        </Box>
        <Box id="article-end" aria-hidden h="1px" />
      </Box>
      {showToc && (
        <Box
          as="aside"
          aria-label="Article outline"
          display={{ base: 'none', xl: 'block' }}
          position="sticky"
          top="96px"
          maxH="calc(100vh - 120px)"
          overflowY="auto"
          className="no-print"
        >
          <TocRail toc={toc} activeId={activeId} />
          <Box mt={8}>
            <ArticleProgress />
          </Box>
        </Box>
      )}
    </Grid>
  )
}
