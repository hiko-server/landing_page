import type React from 'react'
import { Box, Text } from '@chakra-ui/react'
import Picture from '../Common/Picture'
import { useImageReveal } from '../Common/useImageReveal'

/**
 * Case-study covers on /work and on the case-study page, one 16:10 box for
 * every card so cards line up (D2).
 *
 *   - Large covers fill the box (object-fit: cover) around the owner's focal
 *     point (object-position).
 *   - Small covers (narrower than lib/coverImage COVER_SHARP_MIN) are drawn
 *     at their own size, centred on a tinted panel — never stretched into a
 *     blur.
 *   - No cover: a typographic cover in the style of the social cards — dot
 *     grid, one accent glow, "[case study]" and the project's short name
 *     (`wordmark`, lib/caseStudy coverWordmark, computed on the server).
 *     CSS only, decorative (the title follows as text).
 *
 * The box is reserved by aspect-ratio before any file loads (no layout
 * shift). Uploads come as WebP with an AVIF <source> (G4), over their
 * blurred placeholder until they have loaded (C8; the likely LCP cover —
 * `eager` — paints over it as it arrives instead of fading in). `morph`
 * marks what morphs between the /work card and the case-study page
 * (lib/viewTransitionMorph.ts): a large cover's frame as one picture (its
 * rounded corners and border travel with it); a small cover's panel and,
 * apart from it, its logo — which moves at its own size and never doubles
 * as a scaled-up, blurred copy behind itself. Small covers have no blur-up
 * placeholder either. The typographic cover exists on the card alone.
 */

export type CoverView = {
  src: string
  srcSet: string | null
  avifSrcSet?: string | null
  placeholder?: string | null
  alt: string
  width: number | null
  height: number | null
  small: boolean
  focus: string
}

const MONO = 'var(--font-geist-mono), monospace'

const PANEL_STYLE: React.CSSProperties = {
  // Plain style: Chakra would try to read the gradients as theme tokens.
  backgroundImage: 'radial-gradient(circle, var(--dot-color) 1px, transparent 1px), radial-gradient(circle at 88% 8%, var(--accent-soft), transparent 58%)',
  backgroundSize: '8px 8px, 100% 100%',
}

export default function CoverFrame({
  cover,
  title,
  wordmark,
  eyebrow,
  sizes,
  eager,
  morph,
  decorative,
  radius = 'md',
}: {
  cover: CoverView | null
  /** Used by the typographic cover when there is no image (its `wordmark`, else the title). */
  title: string
  wordmark?: string
  /** Small mono line of the typographic cover (e.g. the period). */
  eyebrow?: string
  sizes: string
  /** In the first viewport: load at once with high priority (the likely LCP image). */
  eager?: boolean
  /** The image morphs with the other page's cover (see above). */
  morph?: boolean
  /** Inside a link whose text names the item: the image is decorative (alt=""). */
  decorative?: boolean
  radius?: string
}) {
  // Large covers only: a small one sits on its tinted panel at its own size.
  const reveal = useImageReveal(cover && !cover.small ? cover.placeholder : null, {
    fade: !eager,
    width: cover?.width,
    height: cover?.height,
    fit: 'cover',
    position: cover?.focus,
  })
  const frame = {
    className: 'work-cover',
    position: 'relative' as const,
    overflow: 'hidden',
    borderRadius: radius,
    border: '1px solid',
    borderColor: 'page.border',
    bg: 'page.bg-elevated',
    sx: { aspectRatio: '16 / 10' },
  }

  if (!cover) {
    const mark = wordmark || title
    return (
      <Box {...frame} aria-hidden data-cover="type" style={PANEL_STYLE}>
        <Text
          as="span"
          position="absolute"
          top={{ base: 3, md: 4 }}
          left={{ base: 3.5, md: 5 }}
          right={{ base: 3.5, md: 5 }}
          display="flex"
          justifyContent="space-between"
          gap={3}
          fontFamily={MONO}
          fontSize="11px"
          letterSpacing="0.08em"
          textTransform="uppercase"
          color="page.fg-subtle"
        >
          <Box as="span" color="accent.text">
            [case study]
          </Box>
          {eyebrow ? (
            <Box as="span" className="tnum" noOfLines={1}>
              {eyebrow}
            </Box>
          ) : null}
        </Text>
        <Text
          as="span"
          position="absolute"
          left={{ base: 3.5, md: 5 }}
          right={{ base: 3.5, md: 5 }}
          bottom={{ base: 3, md: 4 }}
          fontWeight={600}
          fontSize="clamp(1.5rem, 1rem + 2.4vw, 2.6rem)"
          lineHeight="1.05"
          letterSpacing="-0.03em"
          color="page.fg"
          noOfLines={2}
          sx={{ textWrap: 'balance' }}
        >
          {mark}
        </Text>
      </Box>
    )
  }

  const img = (
    // A plain <img> with the upload variants' srcsets: the site never uses the Next image optimizer.
    <Picture avifSrcSet={cover.srcSet ? cover.avifSrcSet : null} sizes={sizes}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={reveal.ref}
        {...reveal.imgProps}
        src={cover.src}
        srcSet={cover.srcSet || undefined}
        sizes={cover.srcSet ? sizes : undefined}
        alt={decorative ? '' : cover.alt}
        width={cover.width ?? 1600}
        height={cover.height ?? 1000}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        {...(eager ? { fetchpriority: 'high' } : {})}
        data-vt-part={morph && cover.small ? 'logo' : undefined}
        style={
          cover.small
            ? ({
                display: 'block',
                width: 'auto',
                height: 'auto',
                maxWidth: '100%',
                maxHeight: '100%',
                borderRadius: '4px',
              } as React.CSSProperties)
            : ({
                display: 'block',
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: cover.focus,
              } as React.CSSProperties)
        }
      />
    </Picture>
  )

  if (cover.small) {
    return (
      <Box {...frame} data-cover="small" data-vt-part={morph ? 'panel' : undefined} display="flex" alignItems="center" justifyContent="center" p={{ base: 4, md: 6 }} style={PANEL_STYLE}>
        {img}
      </Box>
    )
  }
  return (
    <Box {...frame} data-cover="image" data-vt-part={morph ? 'cover' : undefined} style={reveal.boxStyle}>
      {img}
    </Box>
  )
}
