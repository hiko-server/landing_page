import React, { useCallback, useMemo, useState } from 'react'
import { Box, Grid } from '@chakra-ui/react'
import type { Root as HastRoot } from 'hast'
import MDXContent from '../MDX/MDXContent'
import { ArticleImagesContext } from '../MDX/Figure'
import Lightbox from '../Common/Lightbox'
import ErrorBoundary from '../Common/ErrorBoundary'
import type { TocEntry } from '../../lib/toc'
import { collectImages, type HastNode } from '../../lib/rehype/hast'
import { TocDisclosure, TocRail } from './TableOfContents'
import ArticleProgress from './ArticleProgress'
import { useActiveHeading } from './useActiveHeading'

/** A table of contents is only worth showing for two or more sections. */
const MIN_TOC_ENTRIES = 2

/**
 * Article body with its table of contents: a sticky right rail with reading
 * progress on xl screens, a collapsible block above the text below xl.
 * Both share one active-section tracker.
 *
 * The body is the server-compiled hast tree (lib/mdx.ts). Its images are
 * collected once from the tree, so every image can open the shared
 * Lightbox and step through all images of the article.
 *
 * The prose column starts on the same left edge as the page title and the
 * meta grid (no inner padding); paragraphs are capped at 68ch.
 */
export default function ArticleBody({ tree, toc }: { tree: HastRoot; toc: TocEntry[] }) {
  const showToc = toc.length >= MIN_TOC_ENTRIES
  const activeId = useActiveHeading(showToc ? toc.map((t) => t.id) : [])

  const images = useMemo(() => collectImages(tree as unknown as HastNode), [tree])
  const [index, setIndex] = useState<number | null>(null)
  const open = useCallback(
    (src: string) => {
      const i = images.findIndex((img) => img.src === src)
      if (i >= 0) setIndex(i)
    },
    [images],
  )
  const zoom = useMemo(() => (images.length ? { open } : null), [images.length, open])

  return (
    <Grid
      templateColumns={showToc ? { base: 'minmax(0, 1fr)', xl: 'minmax(0, 1fr) 220px' } : 'minmax(0, 1fr)'}
      columnGap={16}
      alignItems="start"
    >
      <Box minW={0}>
        {showToc && (
          <Box display={{ base: 'block', xl: 'none' }} maxW="68ch" className="no-print">
            <TocDisclosure toc={toc} activeId={activeId} />
          </Box>
        )}
        <Box id="article-body">
          <ArticleImagesContext.Provider value={zoom}>
            <MDXContent tree={tree} as="div" />
          </ArticleImagesContext.Provider>
        </Box>
        <Box id="article-end" aria-hidden h="1px" />
        {images.length > 0 && (
          <ErrorBoundary name="article-lightbox" fallback={null}>
            <Lightbox items={images} index={index} onIndexChange={setIndex} />
          </ErrorBoundary>
        )}
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
