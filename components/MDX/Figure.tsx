import React, { createContext, useContext, useEffect, useState } from 'react'
import { Box, Text } from '@chakra-ui/react'

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
 */

/** Opens the article lightbox on the image with this src. */
export const ArticleImagesContext = createContext<{ open: (src: string) => void } | null>(null)

/** True inside a link: an image there is navigation, never a zoom button. */
export const InsideLinkContext = createContext(false)

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
  const inLink = useContext(InsideLinkContext)
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
  // height follows from the width/height attributes. Unknown: a 16:10 box.
  // Spans only (display: block): the image may share a <p> with text, and a
  // <div> there would make the HTML parser close the paragraph — the server
  // markup would no longer hydrate.
  const framed = (
    <Box
      as="span"
      sx={{
        ...frameSx,
        overflow: 'hidden',
        width: '100%',
        ...(known ? { maxWidth: `${w}px`, mx: 'auto' } : { aspectRatio: '16 / 10' }),
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
      aria-label={altText ? `Enlarge image: ${altText}` : 'Enlarge image'}
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

/** <figure>: article figures get spacing and a centred caption; code-block figures pass through. */
export default function ArticleFigure({ className, children, ...rest }: React.HTMLAttributes<HTMLElement>) {
  if (!String(className || '').split(/\s+/).includes('article-figure')) {
    return (
      <figure className={className} {...rest}>
        {children}
      </figure>
    )
  }
  return (
    <Box as="figure" className={className} my={8} sx={{ '& .zoomable, & > span': { my: 0 } }} {...rest}>
      {children}
    </Box>
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
