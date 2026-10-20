import { useCallback, useMemo, useRef, useState, type SyntheticEvent } from 'react'
import { Box, Grid } from '@chakra-ui/react'
import type { Root as HastRoot } from 'hast'
import MDXContent from '../MDX/MDXContent'
import { ArticleImagesContext } from '../MDX/Figure'
import LazyLightbox, { preloadLightbox } from '../Common/LazyLightbox'
import ErrorBoundary from '../Common/ErrorBoundary'
import type { TocEntry } from '../../lib/toc'
import { collectImages, type HastNode } from '../../lib/rehype/hast'
import { TocDisclosure, TocRail } from './TableOfContents'
import ArticleProgress from './ArticleProgress'
import { useActiveHeading } from './useActiveHeading'
import { useArticleUi } from './articleUi'
import { useAutoHideHeader } from './useAutoHideHeader'
import { useReadThrough } from '../../lib/analytics/readThrough'

/** A table of contents is only worth showing for two or more sections. */
const MIN_TOC_ENTRIES = 2

/**
 * Article body with its table of contents: a sticky right rail with reading
 * progress on xl screens, a collapsible block above the text below xl.
 * Both share one active-section tracker.
 *
 * The body is the server-compiled hast tree (lib/mdx.ts). Its images are
 * collected once from the tree, so every image can open the shared
 * Lightbox and step through all images of the article. The viewer loads on
 * demand: when a pointer reaches an image or an image button is focused
 * (components/Common/LazyLightbox.tsx). It grows out of the frame of the
 * image pressed and closes into the frame of the image it shows, when that
 * one is on screen (`originOf`).
 *
 * The prose column starts on the same left edge as the page title and the
 * meta grid (no inner padding); paragraphs are capped at 68ch.
 *
 * While reading a long article on a small screen the sticky header tucks
 * away on the way down and returns on the way up (useAutoHideHeader).
 */
export default function ArticleBody({ tree, toc }: { tree: HastRoot; toc: TocEntry[] }) {
  // The article's words, in its language (the page provides them: ./articleUi).
  const ui = useArticleUi().t
  const showToc = toc.length >= MIN_TOC_ENTRIES
  const activeId = useActiveHeading(showToc ? toc.map((t) => t.id) : [])
  useAutoHideHeader()
  // Reaching #article-end after reading: one read_through goal event (lib/analytics/readThrough).
  useReadThrough()

  const images = useMemo(() => collectImages(tree as unknown as HastNode), [tree])
  const [index, setIndex] = useState<number | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  /** The image button pressed: the same picture may appear twice, this is the one that opened. */
  const pressed = useRef<HTMLElement | null>(null)
  const open = useCallback(
    (src: string, from?: HTMLElement | null) => {
      const i = images.findIndex((img) => img.src === src)
      if (i < 0) return
      pressed.current = from ?? null
      setIndex(i)
    },
    [images],
  )
  // The frame of image `i` in the text (the button pressed for its own picture).
  const originOf = useCallback(
    (i: number): HTMLElement | null => {
      const src = images[i]?.src
      if (!src) return null
      const from = pressed.current
      if (from?.isConnected && from.getAttribute('data-zoom-src') === src) return from.querySelector<HTMLElement>('[data-zoom-frame]')
      const buttons = bodyRef.current?.querySelectorAll<HTMLElement>('.zoomable[data-zoom-src]') ?? []
      for (const button of Array.from(buttons)) {
        if (button.getAttribute('data-zoom-src') === src) return button.querySelector<HTMLElement>('[data-zoom-frame]')
      }
      return null
    },
    [images],
  )
  const zoom = useMemo(() => (images.length ? { open } : null), [images.length, open])
  // A pointer over (or focus on) a zoomable image: fetch the viewer now.
  const onImageIntent = useCallback((e: SyntheticEvent) => {
    if ((e.target as Element | null)?.closest?.('.zoomable')) preloadLightbox()
  }, [])

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
        <Box id="article-body" ref={bodyRef} onPointerOver={images.length ? onImageIntent : undefined} onFocus={images.length ? onImageIntent : undefined}>
          <ArticleImagesContext.Provider value={zoom}>
            <MDXContent tree={tree} as="div" />
          </ArticleImagesContext.Provider>
        </Box>
        <Box id="article-end" aria-hidden h="1px" />
        {images.length > 0 && (
          <ErrorBoundary name="article-lightbox" fallback={null}>
            <LazyLightbox items={images} index={index} onIndexChange={setIndex} originOf={originOf} />
          </ErrorBoundary>
        )}
      </Box>
      {showToc && (
        <Box
          as="aside"
          aria-label={ui.articleOutline}
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
