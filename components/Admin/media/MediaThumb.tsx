import React from 'react'
import { Box } from '@chakra-ui/react'
import { useImageReveal } from '../../Common/useImageReveal'

/**
 * An upload shown whole (never cropped) inside its box: the image keeps its
 * own aspect ratio, centred on a quiet checkerboard that shows transparency,
 * and is never drawn larger than the file itself (a 142 px logo stays
 * 142 px). The blur placeholder (C8) fills the image's own box until the
 * file arrives, then it fades in (instantly under reduced motion — the
 * site's img[data-lqip] rules). AVIF through <picture> when the full set
 * exists. The box sizes itself with container query units, so the fit is
 * exact in any box (a square tile, the drawer's wide preview).
 */

export const CHECKERBOARD = {
  backgroundColor: 'var(--chakra-colors-page-bg-elevated)',
  backgroundImage:
    'linear-gradient(45deg, var(--chakra-colors-page-bg-overlay) 25%, transparent 25%, transparent 75%, var(--chakra-colors-page-bg-overlay) 75%), linear-gradient(45deg, var(--chakra-colors-page-bg-overlay) 25%, transparent 25%, transparent 75%, var(--chakra-colors-page-bg-overlay) 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 8px 8px',
} as const

type Props = {
  src: string
  srcSet?: string
  avifSrcSet?: string
  sizes?: string
  placeholder?: string
  width: number | null
  height: number | null
  alt?: string
  /** Load at once (the drawer's preview), else lazily. */
  eager?: boolean
  /** Padding around the image inside the box. */
  inset?: number | string
}

export default function MediaThumb({ src, srcSet, avifSrcSet, sizes, placeholder, width, height, alt = '', eager = false, inset = 0 }: Props) {
  const { ref, imgProps, boxStyle } = useImageReveal(placeholder, { width, height, fit: 'fill' })
  const known = !!(width && height)
  const frame: React.CSSProperties = known
    ? {
        aspectRatio: `${width} / ${height}`,
        width: `min(100cqw, ${width}px, calc(100cqh * ${((width as number) / (height as number)).toFixed(5)}))`,
        ...boxStyle,
      }
    : { width: '100%', height: '100%', ...boxStyle }
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      width={width ?? undefined}
      height={height ?? undefined}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      style={{ display: 'block', width: '100%', height: '100%', objectFit: known ? 'cover' : 'contain' }}
      {...imgProps}
    />
  )
  return (
    <Box position="absolute" inset={0} p={inset} sx={CHECKERBOARD}>
      <Box w="100%" h="100%" display="flex" alignItems="center" justifyContent="center" overflow="hidden" sx={{ containerType: 'size' }}>
        <Box position="relative" flexShrink={0} style={frame}>
          {avifSrcSet ? (
            <picture style={{ display: 'block', width: '100%', height: '100%' }}>
              <source type="image/avif" srcSet={avifSrcSet} sizes={sizes} />
              {img}
            </picture>
          ) : (
            img
          )}
        </Box>
      </Box>
    </Box>
  )
}
