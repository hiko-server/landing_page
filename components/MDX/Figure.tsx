import React, { createContext, useContext, useEffect, useState } from 'react'
import { Box, Text } from '@chakra-ui/react'
import { fillUi } from '../../lib/uiStrings'
import { CONTENT_UI } from '../../lib/uiStrings/content'
import { useUiLang } from '../Common/uiLang'

/**
 * Article images and figures (rendered from the compiled hast tree).
 *
 *   - Zero layout shift: images carry their intrinsic width/height (the
 *     browser reserves the box from the attributes); when the size is
 *     unknown the image sits in a 16:10 box with `object-fit: contain`, so
 *     the caption below never jumps when the file arrives.
 *   - Responsive: uploads ship `srcSet` + `sizes` (lib/rehype/images.ts).
 *   - Tap to zoom: inside an article (ArticleImagesContext from
 *     components/Article/ArticleBody.tsx) each image becomes a button that
 *     opens the shared Lightbox. The button is a progressive wrapper added
 *     after mount — the server HTML (and no-JS visitors) get a plain <img>,
 *     and hydration never sees a different tree.
 *   - `<Figure src alt caption />` in MDX compiles to the same
 *     `figure.article-figure > img + figcaption` shape as a lone markdown
 *     image, so both render through ArticleFigure + MdxImage.
 *   - Valid inside a paragraph: an image that shares its paragraph with text
 *     (`![…](…)(Ref: …)`) stays in the <p>, so MdxImage emits phrasing
 *     content only — span frames (display: block) and, after mount, a
 *     <button>. <figure>/<figcaption> never sit in a <p>: lone images are
 *     turned into figures in place of their paragraph (lib/rehype/images.ts)
 *     and inline `<Figure>` JSX is lifted out (lib/rehype/liftBlocks.ts).
 *   - Tall images (portrait screenshots) are capped at ~70% of the viewport
 *     height, their width following from the aspect ratio.
 *   - `data-width="wide" | "full"` (lib/rehype/galleries.ts) lets a figure
 *     break out of the text column: wide up to 64rem, full the whole
 *     article column — and edge to edge on phones. `100cqw` is the column:
 *     MDXContent makes its wrapper an inline-size container.
 *   - Galleries (`figure.article-gallery > div.gallery-row > figure`): each
 *     figure of a row grows by its aspect ratio (`data-ratio`), so a row's
 *     images share one height and the layout exists before any file loads.
 */

/** Opens the article lightbox on the image with this src. */
export const ArticleImagesContext = createContext<{ open: (src: string) => void } | null>(null)

/** True inside a link: an image there is navigation, never a zoom button. */
export const InsideLinkContext = createContext(false)

/** Inside a gallery row of two or more images: the image fills its cell (the row sets the size). */
export const GalleryCellContext = createContext(false)

/** The tallest a lone image is drawn: 70% of the viewport, at most 40rem. */
const TALL_MAX_HEIGHT = 'min(70vh, 40rem)'
/** Height / width above which an image counts as tall. */
const TALL_RATIO = 1.25

function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}

const toNumber = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

const frameSx = {
  display: 'block',
  borderRadius: 'lg',
  border: '1px solid',
  borderColor: 'page.border',
  bg: 'page.bg-elevated',
} as const

export function MdxImage({ alt, width, height, src, srcSet, sizes, title, className }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const zoom = useContext(ArticleImagesContext)
  const ui = CONTENT_UI[useUiLang()]
  const inLink = useContext(InsideLinkContext)
  const inCell = useContext(GalleryCellContext)
  const mounted = useMounted()
  const w = toNumber(width)
  const h = toNumber(height)
  const altText = typeof alt === 'string' ? alt : ''
  const known = !!(w && h)

  // A plain <img>: Chakra would read width/height as style props and drop
  // the intrinsic-size attributes the browser needs to reserve the box.
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? sizes || '(min-width: 768px) 720px, 100vw' : undefined}
      alt={altText}
      title={title}
      className={className}
      width={w}
      height={h}
      loading="lazy"
      decoding="async"
      style={known ? { display: 'block', width: '100%', height: 'auto' } : { display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
    />
  )

  // Known size: the frame is as wide as the image (never upscaled) and its
  // height follows from the width/height attributes; a tall image is also
  // capped in height (its width follows). In a gallery cell the row sets the
  // size. Unknown: a 16:10 box. Spans only (display: block): the image may
  // share a <p> with text, and a <div> there would make the HTML parser
  // close the paragraph — the server markup would no longer hydrate.
  const tall = known && (h as number) / (w as number) > TALL_RATIO
  const sizing = inCell
    ? known
      ? {}
      : { aspectRatio: '16 / 10' }
    : known
      ? { maxWidth: tall ? `min(${w}px, calc(${TALL_MAX_HEIGHT} * ${w} / ${h}))` : `${w}px`, mx: 'auto' }
      : { aspectRatio: '16 / 10' }
  const framed = (
    <Box
      as="span"
      sx={{
        ...frameSx,
        overflow: 'hidden',
        width: '100%',
        ...sizing,
      }}
    >
      {img}
    </Box>
  )

  if (!zoom || inLink || !mounted || typeof src !== 'string') {
    return (
      <Box as="span" display="block" my={6}>
        {framed}
      </Box>
    )
  }

  return (
    <Box
      as="button"
      type="button"
      className="zoomable"
      aria-label={altText ? fillUi(ui.enlargeImageAlt, { alt: altText }) : ui.enlargeImage}
      aria-haspopup="dialog"
      onClick={() => zoom.open(src)}
      display="block"
      w="100%"
      my={6}
      p={0}
      bg="transparent"
      border={0}
      borderRadius="lg"
      cursor="zoom-in"
      textAlign="inherit"
      _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '3px' }}
    >
      {framed}
    </Box>
  )
}

type FigureProps = React.HTMLAttributes<HTMLElement> & { 'data-width'?: string; 'data-ratio'?: string | number }

/** Breakout of a wide / full figure or gallery (see the header comment). */
function widthSx(width: unknown) {
  if (width === 'wide') return { width: { base: '100%', md: 'min(100cqw, 64rem)' }, maxWidth: 'none' }
  if (width === 'full') {
    return {
      maxWidth: 'none',
      width: { base: 'calc(100cqw + 2 * var(--page-gutter, 0px))', md: '100cqw' },
      marginInlineStart: { base: 'calc(-1 * var(--page-gutter, 0px))', md: 0 },
      // Edge to edge on phones: no rounded corners or side borders at the screen edge.
      '@media (max-width: 47.99em)': {
        '& .zoomable, & .zoomable > span, & > span > span, & .gallery-row span': { borderRadius: 0, borderInlineWidth: 0 },
        '& figcaption': { px: 'var(--page-gutter, 0px)' },
      },
    }
  }
  return {}
}

/** A gallery cell's flex share: its aspect ratio (all cells of a row then share one height). */
function cellRatio(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n > 0 && n < 20 ? n : 1.6
}

/**
 * <figure>: article figures get spacing, a centred caption and their width;
 * galleries lay out their rows; code-block figures pass through.
 */
export default function ArticleFigure({ className, children, ...rest }: FigureProps) {
  const classes = String(className || '').split(/\s+/)
  const { 'data-width': width, 'data-ratio': ratio, ...attrs } = rest
  if (classes.includes('article-gallery')) {
    return (
      <Box as="figure" className={className} data-width={width} my={8} mx={0} sx={widthSx(width)} {...attrs}>
        {children}
      </Box>
    )
  }
  if (!classes.includes('article-figure')) {
    return (
      <figure className={className} {...rest}>
        {children}
      </figure>
    )
  }
  if (ratio !== undefined) {
    // A cell of a gallery row (the row is a flex container: components/MDX/Gallery).
    return (
      <Box
        as="figure"
        className={className}
        m={0}
        minW={0}
        style={{ flex: `${cellRatio(ratio)} 1 0%` }}
        sx={{ '& .zoomable, & > span': { my: 0 }, '& figcaption': { mt: 2 } }}
        {...attrs}
      >
        {children}
      </Box>
    )
  }
  return (
    <Box as="figure" className={className} data-width={width} my={8} mx={0} sx={{ '& .zoomable, & > span': { my: 0 }, ...widthSx(width) }} {...attrs}>
      {children}
    </Box>
  )
}

/** A row of a gallery: cells side by side, one shared height; a row of one is a plain figure slot. */
export function GalleryRow({ children, ...rest }: React.HTMLAttributes<HTMLDivElement> & { 'data-count'?: string | number }) {
  const count = Number(rest['data-count']) || 0
  return (
    <GalleryCellContext.Provider value={count > 1}>
      <Box
        className="gallery-row"
        data-count={count || undefined}
        display="flex"
        alignItems="flex-start"
        gap={{ base: 2, md: 3 }}
        sx={{ '& + &': { mt: { base: 2, md: 3 } } }}
      >
        {children}
      </Box>
    </GalleryCellContext.Provider>
  )
}

export function FigCaption(props: React.HTMLAttributes<HTMLElement>) {
  return (
    <Text
      as="figcaption"
      mt={3}
      textAlign="center"
      fontFamily="var(--font-geist-mono), monospace"
      fontSize="12px"
      lineHeight="1.5"
      color="page.fg-secondary"
      {...props}
    />
  )
}
