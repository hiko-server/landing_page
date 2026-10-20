import type { ReactElement } from 'react'

/**
 * An <img> offered in AVIF where the browser supports it (G4): a <picture>
 * with one `<source type="image/avif">` (the upload's AVIF variants,
 * lib/uploadVariants.ts) in front of the <img>, which keeps its WebP srcset,
 * src, size attributes, alt and loading hints — the browser takes the
 * source's candidates when it can decode AVIF and the img's otherwise.
 *
 * The <picture> is `display: contents`, so the <img> lays out exactly as it
 * did without it (flex / grid children, `> img` selectors aside). Without an
 * AVIF srcset the <img> renders alone.
 */
export default function Picture({ avifSrcSet, sizes, children }: { avifSrcSet?: string | null; sizes?: string; children: ReactElement }) {
  if (!avifSrcSet) return children
  return (
    <picture style={{ display: 'contents' }}>
      <source type="image/avif" srcSet={avifSrcSet} sizes={sizes} />
      {children}
    </picture>
  )
}
